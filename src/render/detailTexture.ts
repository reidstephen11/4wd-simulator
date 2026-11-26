import * as THREE from 'three';

/**
 * The fine detail of the ground and the rocks (v0.26): one small texture that tiles, made in
 * code, read by the ground shader and the rock shader at two scales each. Its four channels:
 *   R  grain: fine relief everywhere (several sizes of bump laid over each other)
 *   G  pebbles: the height of rounded stones, one to a cell, some cells left bare
 *   B  clods: 0 along the cracks between clods of mud or clay, rising to 1 at their middles
 *   A  tone: one value for each pebble's cell, so each stone can be a little paler or darker
 * No Three.js in `detailTextureData`, so it can be tested.
 */
export const DETAIL_SIZE = 256;
/** Pebble cells and clod cells across the texture. */
const PEBBLES = 12;
const CLODS = 7;

const hash = (x: number, y: number, seed: number): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Value noise that repeats every `period` cells: u, v in 0..1 across the texture. */
function tileNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const at = (dx: number, dy: number) => hash(mod(ix + dx, period), mod(iy + dy, period), seed);
  return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
}

/**
 * The nearest and next-nearest of one point to each cell of a `cells` × `cells` grid that
 * wraps: their distances in cells, and the nearest one's cell.
 */
function tileCells(u: number, v: number, cells: number, seed: number) {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  let cx = 0;
  let cy = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const gx = mod(ix + dx, cells);
      const gy = mod(iy + dy, cells);
      const px = ix + dx + 0.15 + 0.7 * hash(gx, gy, seed);
      const py = iy + dy + 0.15 + 0.7 * hash(gx, gy, seed + 1);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        cx = gx;
        cy = gy;
      } else if (d < f2) f2 = d;
    }
  return { f1, f2, cx, cy };
}

/** The texture's bytes: `size` × `size` RGBA. */
export function detailTextureData(size = DETAIL_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size;
      const v = (j + 0.5) / size;
      // Grain: four sizes of bump, the finer the fainter.
      const grain =
        tileNoise(u, v, 8, 11) * 0.4 +
        tileNoise(u, v, 16, 12) * 0.3 +
        tileNoise(u, v, 32, 13) * 0.2 +
        tileNoise(u, v, 64, 14) * 0.1;
      // Pebbles: a dome on each cell's point, its size and height the cell's own; one cell in four is bare.
      const p = tileCells(u, v, PEBBLES, 21);
      const size0 = 0.3 + 0.22 * hash(p.cx, p.cy, 22);
      const bare = hash(p.cx, p.cy, 23) < 0.25;
      const dome = bare ? 0 : Math.sqrt(Math.max(0, 1 - (p.f1 / size0) ** 2));
      const pebble = dome * (0.55 + 0.45 * hash(p.cx, p.cy, 24));
      // Clods: flat tops, falling to a crack where two cells meet.
      const c = tileCells(u, v, CLODS, 31);
      const clod = smooth(Math.min(1, (c.f2 - c.f1) / 0.22));
      const o = (j * size + i) * 4;
      data[o] = Math.round(grain * 255);
      data[o + 1] = Math.round(pebble * 255);
      data[o + 2] = Math.round(clod * 255);
      data[o + 3] = Math.round(hash(p.cx, p.cy, 25) * 255);
    }
  return data;
}

let shared: THREE.DataTexture | null = null;

/** The detail texture, made once and shared by every material that reads it. */
export function detailTexture(): THREE.DataTexture {
  if (shared) return shared;
  const t = new THREE.DataTexture(detailTextureData(), DETAIL_SIZE, DETAIL_SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  // Heights and masks, not colours: read as they are.
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  shared = t;
  return t;
}

/** Shared by the materials that read the detail texture. */
export const detailUniforms = { detailMap: { value: null as THREE.Texture | null } };

/** Give a shader the detail texture (call from a material's onBeforeCompile). */
export function useDetailMap(shader: { uniforms: Record<string, THREE.IUniform> }): void {
  detailUniforms.detailMap.value ??= detailTexture();
  shader.uniforms.detailMap = detailUniforms.detailMap;
}
