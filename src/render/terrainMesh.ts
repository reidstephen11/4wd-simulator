import * as THREE from 'three';
import { GroundTint, type Terrain } from '../sim/world/terrain';
import { pal } from './colors';
import { createGroundMaterial } from './groundMaterial';

/** Quadtree levels: node size (m) and grid step (m). Level 0 matches the physics triangles. */
const LEVELS = [
  { size: 64, step: 1 },
  { size: 64, step: 2 },
  { size: 128, step: 4 },
  { size: 256, step: 8 },
] as const;
const ROOT = 3;
const TINT_SAMPLES = [
  [0, 0, 0.6],
  [-1, 0, 0.1],
  [1, 0, 0.1],
  [0, -1, 0.1],
  [0, 1, 0.1],
] as const;

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
  readonly material: THREE.MeshStandardMaterial;
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
    _seed: number,
  ) {
    this.material = createGroundMaterial();
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
    // shadow area around the car. Smooth terrain normals show the relief.
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
      // Mark every node on the way down as used, not only the drawn ones, so the parents
      // of the detailed chunks around the eye are never evicted (that made them thrash).
      n.lastUsed = this.frame;
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
        if (this.visible.has(n) || n.lastUsed === this.frame || !n.mesh) continue;
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
    const count = (cells * cells * 2 + cells * 16) * 3;
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const ground = new Float32Array(count * 2);
    const color = new THREE.Color();
    let v = 0;
    const vertex = (sx: number, sz: number, drop = 0) => {
      const ix = Math.max(0, Math.min(t.size, sx));
      const iz = Math.max(0, Math.min(t.size, sz));
      pos.set([sx - t.half, t.sample(ix, iz) - drop, sz - t.half], v * 3);
      // The same central-difference normal at every shared vertex, including LOD seams.
      const dx = t.sample(ix - 1, iz) - t.sample(ix + 1, iz);
      const dz = t.sample(ix, iz - 1) - t.sample(ix, iz + 1);
      const length = Math.hypot(dx, 2, dz);
      nrm.set([dx / length, 2 / length, dz / length], v * 3);
      color.setRGB(0, 0, 0);
      let rock = 0,
        wet = 0;
      // A narrow blend softens the square edge of track and biome paint.
      for (const [ox, oz, weight] of TINT_SAMPLES) {
        const x = Math.max(0, Math.min(t.size, ix + ox));
        const z = Math.max(0, Math.min(t.size, iz + oz));
        const tint = t.tint[z * t.res + x];
        const base = this.colors[tint] ?? this.colors[0];
        color.r += base.r * weight;
        color.g += base.g * weight;
        color.b += base.b * weight;
        if (tint === GroundTint.Rock || tint === GroundTint.Scree || tint === GroundTint.Gravel)
          rock += weight;
        if (tint === GroundTint.Mud || tint === GroundTint.CreekBed) wet += weight;
      }
      col.set([color.r, color.g, color.b], v * 3);
      ground.set([rock, wet], v * 2);
      v++;
    };
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const x = ix0 + i * step,
          z = iz0 + j * step;
        // Keep the exact Rapier diagonal and heights; only shading changes.
        vertex(x, z);
        vertex(x, z + step);
        vertex(x + step, z);
        vertex(x + step, z);
        vertex(x, z + step);
        vertex(x + step, z + step);
      }
    }
    const skirt = 1.5 * step + 1;
    const edge = (ax: number, az: number, bx: number, bz: number) => {
      vertex(ax, az);
      vertex(bx, bz, skirt);
      vertex(bx, bz);
      vertex(ax, az);
      vertex(ax, az, skirt);
      vertex(bx, bz, skirt);
      vertex(ax, az);
      vertex(bx, bz);
      vertex(bx, bz, skirt);
      vertex(ax, az);
      vertex(bx, bz, skirt);
      vertex(ax, az, skirt);
    };
    for (let i = 0; i < cells; i++) {
      const a = i * step;
      edge(ix0 + a, iz0, ix0 + a + step, iz0);
      edge(ix0 + a, iz0 + size, ix0 + a + step, iz0 + size);
      edge(ix0, iz0 + a, ix0, iz0 + a + step);
      edge(ix0 + size, iz0 + a, ix0 + size, iz0 + a + step);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('ground', new THREE.BufferAttribute(ground, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  dispose(): void {
    for (const n of this.nodes.values()) n.mesh?.geometry.dispose();
    this.material.dispose();
  }
}
