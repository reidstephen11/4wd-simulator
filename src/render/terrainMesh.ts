import * as THREE from 'three';
import { GroundTint, type Terrain } from '../sim/world/terrain';
import { hash2 } from '../sim/world/rng';
import { pal, varyColor } from './colors';
import { patchFog } from './fog';

/** Quadtree levels: node size (m) and grid step (m). Level 0 matches the physics triangles. */
const LEVELS = [
  { size: 64, step: 1 },
  { size: 64, step: 2 },
  { size: 128, step: 4 },
  { size: 256, step: 8 },
] as const;
const ROOT = 3;

/** Linear colour per ground tint. */
function tintColors(): THREE.Color[] {
  const out: THREE.Color[] = [];
  out[GroundTint.GrassDry] = pal('grassDry');
  out[GroundTint.GrassSage] = pal('grassSage');
  out[GroundTint.DirtTrack] = pal('dirtTrack');
  out[GroundTint.DirtEdge] = pal('dirtDark');
  out[GroundTint.Rock] = pal('rock');
  out[GroundTint.Scree] = pal('rockDark').clone().lerp(pal('rock'), 0.3);
  out[GroundTint.Mud] = pal('mud');
  out[GroundTint.Gravel] = pal('rock').clone().lerp(pal('dirtTrack'), 0.45);
  out[GroundTint.CreekBed] = pal('rockDark').clone().lerp(pal('mud'), 0.4);
  out[GroundTint.ForestFloor] = pal('grassSage').clone().lerp(pal('foliageDark'), 0.5);
  out[GroundTint.FaintTrack] = pal('grassDry').clone().lerp(pal('dirtTrack'), 0.55);
  return out;
}

interface Node {
  key: string;
  level: number;
  /** Sample index of the node's min corner. */
  ix: number;
  iz: number;
  cx: number;
  cz: number;
  minY: number;
  maxY: number;
  mesh: THREE.Mesh | null;
  lastUsed: number;
}

/**
 * Terrain mesh as a fixed-depth quadtree (SPEC §5): 256 m blocks far away, down to
 * 64 m chunks at 1 m resolution near the eye. Far levels are built up front; near
 * levels are built on demand (a few per frame) and cached. A node only splits once
 * all its children are built, so there are never holes. Skirts hide level cracks.
 */
export class TerrainMesh {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private readonly colors = tintColors();
  private readonly nodes = new Map<string, Node>();
  private readonly roots: Node[] = [];
  private lodDistances: readonly number[] = [96, 230, 520];
  private frame = 0;
  private readonly visible = new Set<Node>();
  /** Max on-demand node builds per frame. */
  buildBudget = 3;
  private readonly cacheLimit = [48, 160];

  constructor(
    private readonly terrain: Terrain,
    private readonly seed: number,
  ) {
    this.material = patchFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.name = 'terrain';
    const rootSize = LEVELS[ROOT].size;
    const n = terrain.size / rootSize;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) this.roots.push(this.node(ROOT, x * rootSize, z * rootSize));
    // Pre-build the two coarse levels.
    for (const r of this.roots) {
      this.build(r);
      for (const c of this.children(r)) this.build(c);
    }
  }

  setLodDistances(d: readonly number[]): void {
    this.lodDistances = d;
  }

  private node(level: number, ix: number, iz: number): Node {
    const key = `${level}:${ix}:${iz}`;
    let n = this.nodes.get(key);
    if (n) return n;
    const size = LEVELS[level].size;
    const t = this.terrain;
    let minY = Infinity;
    let maxY = -Infinity;
    const st = Math.max(1, size / 16);
    for (let z = iz; z <= iz + size; z += st)
      for (let x = ix; x <= ix + size; x += st) {
        const h = t.sample(x, z);
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    n = {
      key,
      level,
      ix,
      iz,
      cx: ix + size / 2 - t.half,
      cz: iz + size / 2 - t.half,
      minY,
      maxY,
      mesh: null,
      lastUsed: 0,
    };
    this.nodes.set(key, n);
    return n;
  }

  private children(n: Node): Node[] {
    if (n.level === 0) return [];
    const childLevel = n.level - 1;
    const cs = LEVELS[childLevel].size;
    const size = LEVELS[n.level].size;
    if (cs === size) return [this.node(childLevel, n.ix, n.iz)];
    return [
      this.node(childLevel, n.ix, n.iz),
      this.node(childLevel, n.ix + cs, n.iz),
      this.node(childLevel, n.ix, n.iz + cs),
      this.node(childLevel, n.ix + cs, n.iz + cs),
    ];
  }

  private distance(n: Node, eye: THREE.Vector3): number {
    const hs = LEVELS[n.level].size / 2;
    const dx = Math.max(0, Math.abs(eye.x - n.cx) - hs);
    const dz = Math.max(0, Math.abs(eye.z - n.cz) - hs);
    const dy = eye.y > n.maxY ? eye.y - n.maxY : eye.y < n.minY ? n.minY - eye.y : 0;
    return Math.sqrt(dx * dx + dz * dz + dy * dy);
  }

  private build(n: Node): void {
    const geo = this.buildGeometry(n.ix, n.iz, LEVELS[n.level].size, LEVELS[n.level].step);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    // Terrain doesn't cast: at a low sun its long shadows get clipped at the edge of the
    // shadow area around the car. Flat shading already shows the relief.
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.name = `terrain-${n.key}`;
    this.group.add(mesh);
    n.mesh = mesh;
  }

  /** Update which nodes are drawn for an eye position. `all` builds everything needed now. */
  update(eye: THREE.Vector3, all = false): void {
    this.frame++;
    let budget = all ? Infinity : this.buildBudget;
    const want: Node[] = [];
    const requests: { n: Node; d: number }[] = [];
    const visit = (n: Node) => {
      const d = this.distance(n, eye);
      if (n.level > 0 && d < this.lodDistances[n.level - 1]) {
        const kids = this.children(n);
        const missing = kids.filter((k) => !k.mesh);
        if (missing.length === 0) {
          for (const k of kids) visit(k);
          return;
        }
        for (const k of missing) requests.push({ n: k, d });
      }
      want.push(n);
    };
    for (const r of this.roots) visit(r);
    requests.sort((a, b) => a.d - b.d);
    for (const r of requests) {
      if (budget <= 0) break;
      if (!r.n.mesh) {
        this.build(r.n);
        budget--;
      }
    }
    if (all && requests.length > 0) {
      this.update(eye, true);
      return;
    }
    for (const n of this.visible) if (n.mesh) n.mesh.visible = false;
    this.visible.clear();
    for (const n of want) {
      if (!n.mesh) continue;
      n.mesh.visible = true;
      n.lastUsed = this.frame;
      this.visible.add(n);
    }
    this.evict();
  }

  private evict(): void {
    for (let level = 0; level <= 1; level++) {
      const built = [...this.nodes.values()].filter((n) => n.level === level && n.mesh);
      if (built.length <= this.cacheLimit[level]) continue;
      built.sort((a, b) => a.lastUsed - b.lastUsed);
      for (const n of built.slice(0, built.length - this.cacheLimit[level])) {
        if (this.visible.has(n) || !n.mesh) continue;
        this.group.remove(n.mesh);
        n.mesh.geometry.dispose();
        n.mesh = null;
      }
    }
  }

  /** Number of drawn nodes per level (debug). */
  lodCounts(): number[] {
    const counts = [0, 0, 0, 0];
    for (const n of this.visible) counts[n.level]++;
    return counts;
  }

  buildGeometry(ix0: number, iz0: number, size: number, step: number): THREE.BufferGeometry {
    const t = this.terrain;
    const cells = size / step;
    const triCount = cells * cells * 2 + cells * 4 * 4;
    const pos = new Float32Array(triCount * 9);
    const nrm = new Int8Array(triCount * 9);
    const col = new Uint8Array(triCount * 9);
    const res = t.res;
    const H = t.heights;
    const half = t.half;
    const tmp = new THREE.Color();
    let v = 0;

    const colorFor = (sx: number, sz: number, slopeY: number, salt: number): THREE.Color => {
      const i = Math.min(res - 1, sz) * res + Math.min(res - 1, sx);
      const base = this.colors[t.tint[i]] ?? this.colors[0];
      varyColor(base, hash2(sx * 2 + salt, sz, this.seed), hash2(sz, sx * 2 + salt, this.seed + 1), tmp);
      // Steeper faces read a touch darker so slopes stand out.
      const shade = 0.88 + 0.12 * Math.min(1, Math.max(0, (slopeY - 0.55) / 0.45));
      return tmp.multiplyScalar(shade);
    };

    const pushTri = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
      color: THREE.Color,
      up: boolean,
    ) => {
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (!up) {
        const ux = bx - ax;
        const uy = by - ay;
        const uz = bz - az;
        const wx = cx - ax;
        const wy = cy - ay;
        const wz = cz - az;
        nx = uy * wz - uz * wy;
        ny = uz * wx - ux * wz;
        nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
      }
      const r = Math.round(Math.min(1, color.r) * 255);
      const g = Math.round(Math.min(1, color.g) * 255);
      const b = Math.round(Math.min(1, color.b) * 255);
      const NX = Math.round(nx * 127);
      const NY = Math.round(ny * 127);
      const NZ = Math.round(nz * 127);
      pos[v] = ax;
      pos[v + 1] = ay;
      pos[v + 2] = az;
      pos[v + 3] = bx;
      pos[v + 4] = by;
      pos[v + 5] = bz;
      pos[v + 6] = cx;
      pos[v + 7] = cy;
      pos[v + 8] = cz;
      for (let k = 0; k < 9; k += 3) {
        nrm[v + k] = NX;
        nrm[v + k + 1] = NY;
        nrm[v + k + 2] = NZ;
        col[v + k] = r;
        col[v + k + 1] = g;
        col[v + k + 2] = b;
      }
      v += 9;
    };

    const hs = (ix: number, iz: number) => H[Math.min(res - 1, iz) * res + Math.min(res - 1, ix)];

    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const sx = ix0 + i * step;
        const sz = iz0 + j * step;
        const x0 = sx - half;
        const z0 = sz - half;
        const x1 = x0 + step;
        const z1 = z0 + step;
        const h00 = hs(sx, sz);
        const h10 = hs(sx + step, sz);
        const h01 = hs(sx, sz + step);
        const h11 = hs(sx + step, sz + step);
        const cs = step >> 1;
        // Triangle A (00, 01, 10) and B (10, 01, 11): split along the 10–01 diagonal like Rapier.
        const nA = step / Math.hypot(h10 - h00, step, h01 - h00);
        pushTri(x0, h00, z0, x0, h01, z1, x1, h10, z0, colorFor(sx, sz, nA, 0), false);
        const nB = step / Math.hypot(h11 - h01, step, h11 - h10);
        pushTri(x1, h10, z0, x0, h01, z1, x1, h11, z1, colorFor(sx + cs, sz + cs, nB, 1), false);
      }
    }

    // Skirts along the four edges, both windings, so cracks between levels never show.
    const skirt = 1.5 * step + 1;
    const edge = (ax: number, az: number, bx: number, bz: number) => {
      const ha = hs(ax, az);
      const hb = hs(bx, bz);
      const c = colorFor(ax, az, 0.9, 0);
      const X0 = ax - half;
      const Z0 = az - half;
      const X1 = bx - half;
      const Z1 = bz - half;
      pushTri(X0, ha, Z0, X1, hb - skirt, Z1, X1, hb, Z1, c, true);
      pushTri(X0, ha, Z0, X0, ha - skirt, Z0, X1, hb - skirt, Z1, c, true);
      pushTri(X0, ha, Z0, X1, hb, Z1, X1, hb - skirt, Z1, c, true);
      pushTri(X0, ha, Z0, X1, hb - skirt, Z1, X0, ha - skirt, Z0, c, true);
    };
    for (let i = 0; i < cells; i++) {
      const a = i * step;
      edge(ix0 + a, iz0, ix0 + a + step, iz0);
      edge(ix0 + a, iz0 + size, ix0 + a + step, iz0 + size);
      edge(ix0, iz0 + a, ix0, iz0 + a + step);
      edge(ix0 + size, iz0 + a, ix0 + size, iz0 + a + step);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, v), 3, true));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v), 3, true));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  dispose(): void {
    for (const n of this.nodes.values()) n.mesh?.geometry.dispose();
    this.material.dispose();
  }
}
