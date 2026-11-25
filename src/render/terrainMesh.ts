import * as THREE from 'three';
import {
  GroundTint,
  NO_TRACK_EDGE,
  PATCH_REACH,
  TrackPaintKind,
  patchTint,
  trackTint,
  unpackBank,
  unpackPatch,
  type Terrain,
} from '../sim/world/terrain';
import { DETAIL_SUB, patchStride, patchTriangles, type DetailPatch } from '../sim/world/detail';
import { smoothstep } from '../sim/world/noise';
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
/**
 * Where track paint ends (m out from the track's edge) and how wide the blend into the
 * ground beside it is; and the same for the band of mud inside a graded track's edge
 * (MUD_EDGE in the terrain generator). Concrete has no mud band.
 */
const PAINT_EDGE = 0.8,
  FAINT_EDGE = 0.3,
  PAINT_BLEND = 0.45,
  EDGE_BAND = 0.4,
  BAND_BLEND = 0.2;
/** Edge distance (m) given to samples with no track paint beside a painted one. */
const OUTSIDE_PAINT = 2.5;
/**
 * Weights of the blur (per 1 m sample, each way) that smooths how far a clay bank reaches
 * out beyond a track's edge. The raw reach takes the slope at each sample, which jumps from
 * one sample to the next, so the bank's edge was ragged at 1 m: seen low and ahead, a
 * saw-tooth (v1.74).
 */
const BANK_BLUR = [1, 8, 28, 56, 70, 56, 28, 8, 1].map((w) => w / 256);
/** `TerrainMesh.bank` for a sample with no clay bank samples round it. */
const NONE = 127;
/** A bank's reach (m) beyond a track's edge where there's no bank: well inside the widest track. */
const NO_BANK = -6;
/** Side (samples) of the blocks `TerrainMesh.seedBlocks` marks. */
const BLOCK = 8;
/** Half-width (m) of the blend at a ground patch's edge and into its rim. */
const PATCH_BLEND = 0.3,
  RIM_BLEND = 0.2;
/**
 * Shading values per vertex: the ground's colour (r, g, b), rockiness and wetness; the
 * colour of a track there (r, g, b); the distance (m) out from the track's edge, where
 * its paint ends, the width of its darker edge band (0: none) and the rut tone (below 0
 * darker, above 0 paler); then a ground patch's inner and rim colours (r, g, b each), the
 * distance (m) out from its edge and its rim's width; for a round patch its centre (x, z),
 * radius (m) and 1 (0 for any other); how far (m) a clay bank reaches beyond the track's
 * left and right edges (NO_BANK: none); and the distance (m) out from the track's right edge.
 *
 * The two distances from a track's edges are each from one edge, out from the track's left
 * (8) and right (26) sides: across a track each changes evenly, so a chunk whose vertices
 * are further apart than the track is wide still draws it, at its width, and the shader
 * takes the greater of the two (v1.74).
 */
const SHADE = 27;
const RUT = 11;
const TRACK_LEFT = 8,
  TRACK_RIGHT = 26;
/**
 * The finest grid step (m) that keeps both distances from a track's edges. Finer chunks
 * keep one, the distance from the nearer edge, in both: their triangles are too small to
 * hold a whole track, and where two tracks meet, distances from different tracks' edges
 * on either side of a triangle would draw paint between them.
 */
const TWO_SIDED_STEP = 4;
/** Square roots of the whole numbers up to a search's widest reach, squared, each way. */
const ROOTS = Float32Array.from({ length: 2 * 64 * 64 + 1 }, (_, n) => Math.sqrt(n));
const rootOf = (n: number) => (n < ROOTS.length ? ROOTS[n] : Math.sqrt(n));

interface EdgeFound {
  value: number;
  seed: number;
  across: number;
  mixed: boolean;
}

/** The shading values as the ground material's attributes. */
function setShadeAttributes(geo: THREE.BufferGeometry, shade: Float32Array): void {
  const buffer = new THREE.InterleavedBuffer(shade, SHADE);
  geo.setAttribute('color', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute('ground', new THREE.InterleavedBufferAttribute(buffer, 2, 3));
  geo.setAttribute('trackColor', new THREE.InterleavedBufferAttribute(buffer, 3, 5));
  geo.setAttribute('trackEdge', new THREE.InterleavedBufferAttribute(buffer, 4, 8));
  geo.setAttribute('patchInner', new THREE.InterleavedBufferAttribute(buffer, 3, 12));
  geo.setAttribute('patchRim', new THREE.InterleavedBufferAttribute(buffer, 3, 15));
  geo.setAttribute('patchEdge', new THREE.InterleavedBufferAttribute(buffer, 2, 18));
  geo.setAttribute('patchCircle', new THREE.InterleavedBufferAttribute(buffer, 4, 20));
  geo.setAttribute('clayBank', new THREE.InterleavedBufferAttribute(buffer, 2, 24));
  geo.setAttribute('trackRight', new THREE.InterleavedBufferAttribute(buffer, 1, TRACK_RIGHT));
}
/** `TerrainMesh.under` for a sample not looked at yet. */
const UNKNOWN_TINT = 255;
/** Write values into a shading array from `at` on (in place of a splice, which allocates). */
function setShade(out: number[], at: number, ...values: number[]): void {
  for (let k = 0; k < values.length; k++) out[at + k] = values[k];
}
const isRock = (tint: number) =>
  tint === GroundTint.Rock || tint === GroundTint.Scree || tint === GroundTint.Gravel;
const isWet = (tint: number) =>
  tint === GroundTint.Mud ||
  tint === GroundTint.CreekBed ||
  tint === GroundTint.BlackSoil ||
  tint === GroundTint.Pothole;

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
  out[GroundTint.Concrete] = pal('barkPale').clone().lerp(pal('rock'), 0.55);
  // Wet black soil under thin grass: dark and sodden.
  out[GroundTint.BlackSoil] = pal('grassSage').clone().lerp(new THREE.Color('#2A241C'), 0.72);
  out[GroundTint.Pothole] = pal('mud').clone().lerp(new THREE.Color('#1C130D'), 0.55);
  out[GroundTint.Sand] = pal('sand');
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
  /** The four (or one) nodes a level down, found the first time they're asked for. */
  kids: Node[] | null;
}

/**
 * Terrain mesh as a fixed-depth quadtree (SPEC §5): 256 m blocks far away, down to
 * 64 m chunks at 1 m resolution near the eye. Far levels are built up front; near
 * levels are built on demand (a few per frame) and cached. A node only splits once
 * all its children are built, so there are never holes. Skirts hide level cracks.
 */
const byDistance = (a: { d: number }, b: { d: number }) => a.d - b.d;

export class TerrainMesh {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly colors = tintColors();
  /** The tint of the band along a track's edges and of clay banks: mud after rain. */
  private readonly edgeTint: GroundTint;
  /** Rut floors darken towards this and hump crests pale towards this. */
  private readonly rutDark = pal('dirtDark').clone().lerp(pal('mud'), 0.35);
  private readonly crestPale = pal('dirtTrack').clone().lerp(pal('grassDry'), 0.25);
  /**
   * Each sample's `underTint`, worked out the first time it's needed: every sample is
   * read by its four neighbours too. The ground's paint is final before the mesh is built.
   */
  private readonly under: Uint8Array;
  /**
   * How far (tenths of a metre) the clay bank at each sample reaches beyond its track's edge,
   * smoothed (BANK_BLUR), worked out the first time it's needed (-128: not yet; NONE: no bank).
   */
  private readonly bank: Int8Array;
  /** Per BLOCK×BLOCK block of samples: 1 if a track edge is stored there, 2 if a clay bank, or both. */
  private seedBlocks: Uint8Array | null = null;
  private readonly nodes = new Map<string, Node>();
  private readonly roots: Node[] = [];
  private lodDistances: readonly number[] = [96, 230, 520];
  private frame = 0;
  /** The nodes drawn this frame (an array: clearing a Set allocates a new table each time). */
  private readonly visible: Node[] = [];
  /**
   * Main-thread time (ms) for on-demand node builds per frame. One node is always built
   * when one is needed; more only while under this.
   */
  buildMs = 3;
  private readonly cacheLimit = [48, 160];

  constructor(
    private readonly terrain: Terrain,
    _seed: number,
  ) {
    this.edgeTint = terrain.muddyEdges ? GroundTint.Mud : GroundTint.DirtEdge;
    this.under = new Uint8Array(terrain.resX * terrain.resZ).fill(UNKNOWN_TINT);
    this.bank = new Int8Array(terrain.resX * terrain.resZ).fill(-128);
    this.material = createGroundMaterial({
      paintBlend: PAINT_BLEND,
      bandBlend: BAND_BLEND,
      band: this.colors[this.edgeTint],
      patchBlend: PATCH_BLEND,
      rimBlend: RIM_BLEND,
      rut: this.rutDark,
      crest: this.crestPale,
    });
    this.group.name = 'terrain';
    const rootSize = LEVELS[ROOT].size;
    for (let z = 0; z < terrain.sizeZ / rootSize; z++)
      for (let x = 0; x < terrain.sizeX / rootSize; x++)
        this.roots.push(this.node(ROOT, x * rootSize, z * rootSize));
    // Pre-build the two coarse levels.
    for (const r of this.roots) {
      this.build(r);
      for (const c of this.children(r)) this.build(c);
    }
    for (const patch of terrain.detail) {
      const mesh = new THREE.Mesh(this.buildDetail(patch), this.material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'terrain-detail';
      this.group.add(mesh);
    }
  }

  /**
   * Fine ruts and humps over the cells they replace: the same tints and ground
   * shading, with rut floors darker and damper and hump crests worn paler.
   */
  private buildDetail(p: DetailPatch): THREE.BufferGeometry {
    const t = this.terrain;
    const w = patchStride(p),
      rows = p.nz * DETAIL_SUB + 1;
    const n = w * rows;
    const pos = new Float32Array(n * 3),
      nrm = new Float32Array(n * 3),
      shade = new Float32Array(n * SHADE);
    const h = (i: number, j: number) =>
      p.heights[Math.min(rows - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
    // Shading at each 1 m vertex of the patch, as the 1 m mesh has it.
    const cw = p.nx + 1;
    const corners = new Float32Array(cw * (p.nz + 1) * SHADE);
    for (let cz = 0; cz <= p.nz; cz++)
      for (let cx = 0; cx <= p.nx; cx++) {
        corners.set(this.sampleShade(p.ix0 + cx, p.iz0 + cz), (cz * cw + cx) * SHADE);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const x = p.ix0 + i / DETAIL_SUB,
          z = p.iz0 + j / DETAIL_SUB;
        pos.set([x - t.halfX, p.heights[k], z - t.halfZ], k * 3);
        const dx = (h(i - 1, j) - h(i + 1, j)) * DETAIL_SUB,
          dz = (h(i, j - 1) - h(i, j + 1)) * DETAIL_SUB;
        const length = Math.hypot(dx, 2, dz);
        nrm.set([dx / length, 2 / length, dz / length], k * 3);
        // Blend the 1 m vertex shading across the cell, as the 1 m mesh does.
        const cx = Math.min(p.nx - 1, Math.floor(i / DETAIL_SUB)),
          cz = Math.min(p.nz - 1, Math.floor(j / DETAIL_SUB));
        const tx = i / DETAIL_SUB - cx,
          tz = j / DETAIL_SUB - cz;
        for (const [corner, weight] of [
          [cz * cw + cx, (1 - tx) * (1 - tz)],
          [cz * cw + cx + 1, tx * (1 - tz)],
          [(cz + 1) * cw + cx, (1 - tx) * tz],
          [(cz + 1) * cw + cx + 1, tx * tz],
        ])
          for (let c = 0; c < SHADE; c++) shade[k * SHADE + c] += corners[corner * SHADE + c] * weight;
        // The shader darkens rut floors and pales hump crests after the edge blend.
        const o = p.offset[k];
        if (o < 0) {
          const k2 = Math.min(1, -o / 0.45);
          shade[k * SHADE + 4] = Math.max(shade[k * SHADE + 4], k2 * 0.6);
          shade[k * SHADE + RUT] = -k2;
        } else shade[k * SHADE + RUT] = Math.min(1, o / 0.6);
      }
    const indices: number[] = [];
    patchTriangles(p, (i, j) => indices.push(j * w + i));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    setShadeAttributes(geo, shade);
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
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
      cx: ix + size / 2 - t.halfX,
      cz: iz + size / 2 - t.halfZ,
      minY,
      maxY,
      mesh: null,
      lastUsed: 0,
      kids: null,
    };
    this.nodes.set(key, n);
    return n;
  }

  private children(n: Node): Node[] {
    if (n.kids) return n.kids;
    if (n.level === 0) return (n.kids = []);
    const childLevel = n.level - 1;
    const cs = LEVELS[childLevel].size;
    const size = LEVELS[n.level].size;
    if (cs === size) return (n.kids = [this.node(childLevel, n.ix, n.iz)]);
    return (n.kids = [
      this.node(childLevel, n.ix, n.iz),
      this.node(childLevel, n.ix + cs, n.iz),
      this.node(childLevel, n.ix, n.iz + cs),
      this.node(childLevel, n.ix + cs, n.iz + cs),
    ]);
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

  // Kept between frames so the walk below allocates nothing once the ground is built (v1.49).
  private readonly want: Node[] = [];
  private readonly requests: { n: Node; d: number }[] = [];
  /** A build left a level over its cache limit with nothing it could free yet. */
  private overLimit = false;

  /** Update which nodes are drawn for an eye position. `all` builds everything needed now. */
  update(eye: THREE.Vector3, all = false): void {
    this.frame++;
    const start = performance.now();
    let built = 0;
    const want = this.want;
    const requests = this.requests;
    want.length = 0;
    requests.length = 0;
    for (const r of this.roots) this.visit(r, eye);
    if (requests.length > 1) requests.sort(byDistance);
    for (const r of requests) {
      if (!all && built > 0 && performance.now() - start > this.buildMs) break;
      if (!r.n.mesh) {
        this.build(r.n);
        built++;
      }
    }
    if (all && requests.length > 0) {
      this.update(eye, true);
      return;
    }
    for (const n of this.visible) if (n.mesh) n.mesh.visible = false;
    this.visible.length = 0;
    for (const n of want) {
      if (!n.mesh) continue;
      n.mesh.visible = true;
      n.lastUsed = this.frame;
      this.visible.push(n);
    }
    // The cache only grows by a build, so only a build (or one that left it over) can need it.
    if (built > 0 || this.overLimit) this.evict();
  }

  private visit(n: Node, eye: THREE.Vector3): void {
    // Mark every node on the way down as used, not only the drawn ones, so the parents
    // of the detailed chunks around the eye are never evicted (that made them thrash).
    n.lastUsed = this.frame;
    const d = this.distance(n, eye);
    if (n.level > 0 && d < this.lodDistances[n.level - 1]) {
      const kids = this.children(n);
      let missing = 0;
      for (const k of kids) if (!k.mesh) missing++;
      if (missing === 0) {
        for (const k of kids) this.visit(k, eye);
        return;
      }
      for (const k of kids) if (!k.mesh) this.requests.push({ n: k, d });
    }
    this.want.push(n);
  }

  private evict(): void {
    this.overLimit = false;
    for (let level = 0; level <= 1; level++) {
      const built = [...this.nodes.values()].filter((n) => n.level === level && n.mesh);
      if (built.length <= this.cacheLimit[level]) continue;
      built.sort((a, b) => a.lastUsed - b.lastUsed);
      let left = built.length;
      for (const n of built.slice(0, built.length - this.cacheLimit[level])) {
        // Drawn nodes were all used this frame.
        if (n.lastUsed === this.frame || !n.mesh) continue;
        this.group.remove(n.mesh);
        n.mesh.geometry.dispose();
        n.mesh = null;
        left--;
      }
      if (left > this.cacheLimit[level]) this.overLimit = true;
    }
  }

  /** Number of drawn nodes per level (debug). */
  lodCounts(): number[] {
    const counts = [0, 0, 0, 0];
    for (const n of this.visible) counts[n.level]++;
    return counts;
  }

  private readonly shade = new Array<number>(SHADE).fill(0);

  /**
   * Shading at a 1 m sample: the colour of the ground beside any track, rockiness and
   * wetness, and near a track's edge the track's own colour with the distance to the edge.
   * The ground shader blends the two from that distance per pixel, so the edge follows the
   * real line of the track instead of the triangles. Elsewhere both colours are the same
   * narrow blend of the neighbouring tints, which softens the grid.
   */
  private sampleShade(ix: number, iz: number, step = 1): number[] {
    const t = this.terrain;
    const out = this.shade;
    out.fill(0);
    const i = iz * t.resX + ix;
    this.trackShade(ix, iz, step);
    // A ground patch is drawn over the track paint with its own smooth edge.
    const packed = t.groundPatches.get(i);
    const patch = packed === undefined ? null : unpackPatch(packed);
    if (patch && patch.edge <= 0) {
      out[3] = isRock(t.tint[i]) ? 1 : 0;
      out[4] = isWet(t.tint[i]) ? 1 : 0;
    }
    const inner = patch ? (this.colors[patch.inner] ?? this.colors[0]) : null;
    const rim = patch ? (this.colors[patch.rim] ?? this.colors[0]) : null;
    const edge = patch?.edge ?? PATCH_REACH + 0.5;
    const [cx, cz] = patch?.centre ?? [0, 0];
    const [bankLeft, bankRight] = this.bankReach(ix, iz, step);
    setShade(
      out,
      12,
      inner?.r ?? out[0],
      inner?.g ?? out[1],
      inner?.b ?? out[2],
      rim?.r ?? out[0],
      rim?.g ?? out[1],
      rim?.b ?? out[2],
      edge,
      patch?.rimWidth ?? 0,
      ix - t.halfX + cx,
      iz - t.halfZ + cz,
      patch?.centre ? Math.hypot(cx, cz) - edge : -edge,
      patch?.centre ? 1 : 0,
      bankLeft,
      bankRight,
    );
    return out;
  }

  /** The tint a sample's ground had before any ground patch or clay bank was laid over it. */
  private underTint(i: number): number {
    const cached = this.under[i];
    if (cached !== UNKNOWN_TINT) return cached;
    const tint = this.findUnderTint(i);
    this.under[i] = tint;
    return tint;
  }

  private findUnderTint(i: number): number {
    const t = this.terrain;
    const packed = t.groundPatches.get(i);
    let tint: number = t.tint[i];
    if (packed !== undefined) {
      const patch = unpackPatch(packed);
      // Something painted after the patch (a puddle) shows as it is.
      if (tint === patchTint(patch)) tint = patch.under;
    }
    const bank = t.clayBanks.get(i);
    if (bank !== undefined && tint === this.edgeTint) tint = unpackBank(bank).under;
    return tint;
  }

  /** The ground's own and any track's shading at a sample, into `shade`. */
  private trackShade(ix: number, iz: number, step: number): void {
    const t = this.terrain;
    const out = this.shade;
    const i = iz * t.resX + ix;
    const paint = t.trackPaint;
    const p = paint?.paint[i] ?? 0;
    if (paint && p) {
      const kind = p & 7,
        under = p >> 3;
      const e = paint.edge[i] / 10;
      const faint = kind === TrackPaintKind.Faint;
      const end = faint ? FAINT_EDGE : PAINT_EDGE;
      const band = faint || kind === TrackPaintKind.Concrete ? 0 : EDGE_BAND;
      const centre = trackTint(kind);
      // Rock and wetness don't need a sharp edge, so they are still blended per sample.
      const inner = band ? smoothstep(-band + BAND_BLEND, -band - BAND_BLEND, e) : 1;
      const cover = smoothstep(end + PAINT_BLEND, end - PAINT_BLEND, e);
      this.addTint(under, 1 - cover);
      this.addTint(this.edgeTint, cover * (1 - inner));
      this.addTint(centre, cover * inner);
      const u = this.colors[under] ?? this.colors[0];
      const c = this.colors[centre] ?? this.colors[0];
      out[0] = u.r;
      out[1] = u.g;
      out[2] = u.b;
      setShade(out, 5, c.r, c.g, c.b, e, end, band);
      this.setTrackEdges(ix, iz, step, e, i);
      return;
    }
    for (const [ox, oz, weight] of TINT_SAMPLES) {
      const x = Math.max(0, Math.min(t.sizeX, ix + ox));
      const z = Math.max(0, Math.min(t.sizeZ, iz + oz));
      this.addTint(this.underTint(z * t.resX + x), weight);
    }
    // No track colour of its own. Where something was painted over a track, keep the
    // distance to its edge so the blend from a painted neighbour stays true.
    const e = paint?.edge[i] ?? NO_TRACK_EDGE;
    if (paint && e === NO_TRACK_EDGE && step > 1) {
      // A coarse vertex more than 2 m out from a track: the distance it really is from the
      // track's edge, with that track's paint, so that between it and a vertex on the
      // track the edge is drawn where the 1 m mesh draws it, not pulled in towards the
      // track and blended into the ground's colour (so it changed shape as the player
      // drove up to it, v1.74).
      const near = this.extend(ix, iz, step);
      const seed = near ? paint.paint[near.seed] : 0;
      if (near && seed) {
        const kind = seed & 7;
        const faint = kind === TrackPaintKind.Faint;
        const c = this.colors[trackTint(kind)] ?? this.colors[0];
        const band = faint || kind === TrackPaintKind.Concrete ? 0 : EDGE_BAND;
        setShade(out, 5, c.r, c.g, c.b, near.value / 10, faint ? FAINT_EDGE : PAINT_EDGE, band);
        this.setTrackEdges(ix, iz, step, near.value / 10, near.seed, near);
        return;
      }
      if (near) {
        setShade(out, 5, out[0], out[1], out[2], near.value / 10, PAINT_EDGE, 0);
        this.setTrackEdges(ix, iz, step, near.value / 10, near.seed, near);
        return;
      }
    }
    setShade(out, 5, out[0], out[1], out[2], e === NO_TRACK_EDGE ? OUTSIDE_PAINT : e / 10, PAINT_EDGE, 0);
    if (e === NO_TRACK_EDGE) out[TRACK_RIGHT] = OUTSIDE_PAINT;
    else this.setTrackEdges(ix, iz, step, e / 10, i);
  }

  /**
   * The distances (m) out from a track's left and right edges at a vertex `step` m from its
   * neighbours and `e` m out from the nearer edge, with the track's half-width and side at
   * sample `seed`. `near` is what `extend` found for a vertex with no edge of its own.
   */
  private setTrackEdges(
    ix: number,
    iz: number,
    step: number,
    e: number,
    seed: number,
    near?: { across: number; mixed: boolean },
  ): void {
    const paint = this.terrain.trackPaint!;
    this.shade[TRACK_LEFT] = this.shade[TRACK_RIGHT] = e;
    if (step < TWO_SIDED_STEP) return;
    const found = near ?? this.extend(ix, iz, step);
    if (found?.mixed) return;
    const offset = paint.offset[seed] / 10;
    const halfWidth = Math.abs(offset) - paint.edge[seed] / 10;
    const at = near ? near.across / 10 : offset;
    this.shade[TRACK_LEFT] = at - halfWidth;
    this.shade[TRACK_RIGHT] = -at - halfWidth;
  }

  /**
   * How far (m) a clay bank reaches beyond a track's left and right edges at a vertex `step`
   * m from its neighbours: the reach of the nearest bank on each side of the track (NO_BANK
   * if none is within reach). The shader takes the bank's edge that far out from the
   * track's edge (v1.74). A distance from the bank's own edge would have no bank between
   * vertices either side of a track, as a distance from the track's edge had no track.
   */
  private bankReach(ix: number, iz: number, step: number): [number, number] {
    const t = this.terrain;
    const paint = t.trackPaint;
    if (!paint || t.clayBanks.size === 0) return [NO_BANK, NO_BANK];
    const blocks = this.blocks();
    const bx = Math.ceil(t.resX / BLOCK);
    const reach = Math.ceil(step * 1.5 + PATCH_REACH);
    let left = Infinity,
      right = Infinity,
      leftSeed = -1,
      rightSeed = -1;
    const x0 = Math.max(0, ix - reach),
      x1 = Math.min(t.sizeX, ix + reach);
    const z0 = Math.max(0, iz - reach),
      z1 = Math.min(t.sizeZ, iz + reach);
    for (let qz = Math.floor(z0 / BLOCK); qz <= Math.floor(z1 / BLOCK); qz++)
      for (let qx = Math.floor(x0 / BLOCK); qx <= Math.floor(x1 / BLOCK); qx++) {
        if (!(blocks[qz * bx + qx] & 2)) continue;
        for (let z = Math.max(z0, qz * BLOCK); z <= Math.min(z1, qz * BLOCK + BLOCK - 1); z++)
          for (let x = Math.max(x0, qx * BLOCK); x <= Math.min(x1, qx * BLOCK + BLOCK - 1); x++) {
            const k = z * t.resX + x;
            if (!this.isBankSeed(k)) continue;
            const r = (x - ix) * (x - ix) + (z - iz) * (z - iz);
            if (paint.offset[k] >= 0) {
              if (r < left) {
                left = r;
                leftSeed = k;
              }
            } else if (r < right) {
              right = r;
              rightSeed = k;
            }
          }
      }
    const at = (seed: number) => {
      const v = seed < 0 ? NONE : this.reachAt(seed);
      return v === NONE ? NO_BANK : v / 10;
    };
    if (step < TWO_SIDED_STEP) {
      // One distance from the track's edge: the bank on the vertex's own side, in both.
      const own =
        this.terrain.trackPaint!.edge[iz * t.resX + ix] !== NO_TRACK_EDGE
          ? paint.offset[iz * t.resX + ix] >= 0
          : left <= right;
      const reachHere = at(own ? leftSeed : rightSeed);
      return [reachHere, reachHere];
    }
    return [at(leftSeed), at(rightSeed)];
  }

  /** A clay bank sample with its track's edge distance kept. */
  private isBankSeed(i: number): boolean {
    return this.terrain.trackPaint!.edge[i] !== NO_TRACK_EDGE && this.terrain.clayBanks.has(i);
  }

  /**
   * How far (tenths of a metre) the clay bank at sample `i` reaches beyond its track's
   * edge, blurred over the bank samples round it on the same side of the track.
   */
  private reachAt(i: number): number {
    const cached = this.bank[i];
    if (cached !== -128) return cached;
    const t = this.terrain;
    const paint = t.trackPaint!;
    const ix = i % t.resX,
      iz = (i - ix) / t.resX;
    const left = paint.offset[i] >= 0;
    let sum = 0,
      weight = 0;
    const r = (BANK_BLUR.length - 1) / 2;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = ix + dx,
          z = iz + dz;
        if (x < 0 || z < 0 || x > t.sizeX || z > t.sizeZ) continue;
        const k = z * t.resX + x;
        if (!this.isBankSeed(k) || paint.offset[k] >= 0 !== left) continue;
        const w = BANK_BLUR[dx + r] * BANK_BLUR[dz + r];
        sum += (paint.edge[k] / 10 - unpackBank(t.clayBanks.get(k)!).edge) * w;
        weight += w;
      }
    const v = weight > 0 ? Math.max(-126, Math.min(126, Math.round((sum / weight) * 10))) : NONE;
    this.bank[i] = v;
    return v;
  }

  /**
   * For a vertex `step` m from its neighbours: the least of (a nearby sample's distance out
   * from a track's edge + the distance to that sample), over the samples within reach that
   * have one. A distance from an edge grows by a metre a metre, so this is the distance
   * from the edge those samples lie along, out as far as the vertex. With the sample it
   * came from (`seed`), the vertex's offset from that track's centre line (`across`) and
   * whether another track's edge is within reach too (`mixed`). Distances are in tenths
   * of a metre; null if no edge is within reach.
   */
  private extend(ix: number, iz: number, step: number): EdgeFound | null {
    const t = this.terrain;
    const paint = t.trackPaint!;
    const blocks = this.blocks();
    const bx = Math.ceil(t.resX / BLOCK);
    // Far enough to reach the edge from any vertex of a triangle the edge crosses.
    const reach = Math.ceil(step * 1.5 + PATCH_REACH);
    let best = Infinity,
      seed = -1;
    const found = this.found;
    found.length = 0;
    const x0 = Math.max(0, ix - reach),
      x1 = Math.min(t.sizeX, ix + reach);
    const z0 = Math.max(0, iz - reach),
      z1 = Math.min(t.sizeZ, iz + reach);
    for (let qz = Math.floor(z0 / BLOCK); qz <= Math.floor(z1 / BLOCK); qz++)
      for (let qx = Math.floor(x0 / BLOCK); qx <= Math.floor(x1 / BLOCK); qx++) {
        if (!(blocks[qz * bx + qx] & 1)) continue;
        for (let z = Math.max(z0, qz * BLOCK); z <= Math.min(z1, qz * BLOCK + BLOCK - 1); z++)
          for (let x = Math.max(x0, qx * BLOCK); x <= Math.min(x1, qx * BLOCK + BLOCK - 1); x++) {
            const k = z * t.resX + x;
            const v = paint.edge[k];
            if (v === NO_TRACK_EDGE) continue;
            const r = rootOf((x - ix) * (x - ix) + (z - iz) * (z - iz)) * 10;
            if (v + r < best) {
              best = v + r;
              seed = k;
            }
            found.push(k, r);
          }
      }
    if (seed < 0) return null;
    // Only the samples of the nearest track: their offsets differ from its by no more than
    // the distance between them (and rounding). Another track's beside it needn't.
    const sx = seed % t.resX,
      sz = (seed - sx) / t.resX,
      so = paint.offset[seed];
    let upper = Infinity,
      lower = -Infinity,
      mixed = false;
    for (let n = 0; n < found.length; n += 2) {
      const k = found[n],
        r = found[n + 1];
      const kx = k % t.resX,
        kz = (k - kx) / t.resX;
      const o = paint.offset[k];
      if (Math.abs(o - so) > rootOf((kx - sx) * (kx - sx) + (kz - sz) * (kz - sz)) * 10 + 3) {
        mixed = true;
        continue;
      }
      if (o + r < upper) upper = o + r;
      if (o - r > lower) lower = o - r;
    }
    // The offset from a track's centre line changes a metre a metre across it, so it is at
    // most `upper` and at least `lower`: `upper` on its left, where the samples nearest are
    // further left, and `lower` on its right. Their sum is clear of 0 either side (twice
    // the half-width and the reach of the samples), where picking the side by the nearest
    // sample alone wavered near the centre line.
    const out = this.edgeFound;
    out.value = best;
    out.seed = seed;
    out.across = upper + lower >= 0 ? upper : lower;
    out.mixed = mixed;
    return out;
  }

  /** `extend`'s answer, kept between calls. */
  private readonly edgeFound: EdgeFound = { value: 0, seed: 0, across: 0, mixed: false };

  /** Samples (index, then distance) `extend` found, kept between calls. */
  private readonly found: number[] = [];

  /** The blocks of samples with a track edge or a clay bank stored, marked the first time they're needed. */
  private blocks(): Uint8Array {
    if (this.seedBlocks) return this.seedBlocks;
    const t = this.terrain;
    const bx = Math.ceil(t.resX / BLOCK);
    const blocks = new Uint8Array(bx * Math.ceil(t.resZ / BLOCK));
    const mark = (i: number, bit: number) => {
      const ix = i % t.resX,
        iz = (i - ix) / t.resX;
      blocks[Math.floor(iz / BLOCK) * bx + Math.floor(ix / BLOCK)] |= bit;
    };
    const edge = t.trackPaint?.edge;
    if (edge) for (let i = 0; i < edge.length; i++) if (edge[i] !== NO_TRACK_EDGE) mark(i, 1);
    for (const i of t.clayBanks.keys()) mark(i, 2);
    this.seedBlocks = blocks;
    return blocks;
  }

  private addTint(tint: number, weight: number): void {
    const base = this.colors[tint] ?? this.colors[0];
    const out = this.shade;
    out[0] += base.r * weight;
    out[1] += base.g * weight;
    out[2] += base.b * weight;
    if (isRock(tint)) out[3] += weight;
    if (isWet(tint)) out[4] += weight;
  }

  buildGeometry(ix0: number, iz0: number, size: number, step: number): THREE.BufferGeometry {
    const t = this.terrain;
    const cells = size / step;
    const row = cells + 1;
    const grid = row * row;
    // Each sample is shaded once and shared by its triangles; the skirts add a dropped
    // copy of every sample along the four edges.
    const count = grid + 4 * row;
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const shade = new Float32Array(count * SHADE);
    for (let j = 0; j < row; j++) {
      for (let i = 0; i < row; i++) {
        const sx = ix0 + i * step,
          sz = iz0 + j * step;
        const ix = Math.max(0, Math.min(t.sizeX, sx));
        const iz = Math.max(0, Math.min(t.sizeZ, sz));
        const v = j * row + i;
        pos[v * 3] = sx - t.halfX;
        pos[v * 3 + 1] = t.solidSample(ix, iz);
        pos[v * 3 + 2] = sz - t.halfZ;
        // The same central-difference normal at every shared vertex, including LOD seams.
        const dx = t.sample(ix - 1, iz) - t.sample(ix + 1, iz);
        const dz = t.sample(ix, iz - 1) - t.sample(ix, iz + 1);
        const length = Math.hypot(dx, 2, dz);
        nrm[v * 3] = dx / length;
        nrm[v * 3 + 1] = 2 / length;
        nrm[v * 3 + 2] = dz / length;
        shade.set(this.sampleShade(ix, iz, step), v * SHADE);
      }
    }
    const skirt = 1.5 * step + 1;
    // The samples along each edge: bottom, top, left, right.
    const edges = [
      (k: number) => k,
      (k: number) => cells * row + k,
      (k: number) => k * row,
      (k: number) => k * row + cells,
    ];
    edges.forEach((at, e) => {
      for (let k = 0; k < row; k++) {
        const src = at(k),
          dst = grid + e * row + k;
        pos.copyWithin(dst * 3, src * 3, src * 3 + 3);
        pos[dst * 3 + 1] -= skirt;
        nrm.copyWithin(dst * 3, src * 3, src * 3 + 3);
        shade.copyWithin(dst * SHADE, src * SHADE, src * SHADE + SHADE);
      }
    });
    const index = new (count > 65535 ? Uint32Array : Uint16Array)(cells * cells * 6 + 4 * cells * 12);
    let n = 0;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = j * row + i;
        // Keep the exact Rapier diagonal and heights; only shading changes.
        index.set([a, a + row, a + 1, a + 1, a + row, a + row + 1], n);
        n += 6;
      }
    }
    for (let k = 0; k < cells; k++) {
      edges.forEach((at, e) => {
        const a = at(k),
          b = at(k + 1),
          da = grid + e * row + k,
          db = da + 1;
        // Both windings, so the skirt shows from either side.
        index.set([a, db, b, a, da, db, a, b, db, a, db, da], n);
        n += 12;
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    setShadeAttributes(geo, shade);
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  dispose(): void {
    for (const n of this.nodes.values()) n.mesh?.geometry.dispose();
    for (const m of this.group.children)
      if (m instanceof THREE.Mesh && m.name === 'terrain-detail') m.geometry.dispose();
    this.material.dispose();
  }
}
