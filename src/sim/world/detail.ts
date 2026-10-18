import type { ErosionRutDef, TrackHumpDef } from './mapTypes';
import type { TrackInfo } from './features';
import { smoothstep } from './noise';

/** Fine samples per metre in a detail patch (0.25 m spacing). */
export const DETAIL_SUB = 4;
/** How far below the fine ground the hidden 1 m surface is pushed under a patch (m). */
const UNDERCUT = 0.25;

/**
 * Fine ground detail over part of the 1 m terrain: erosion ruts and drainage humps
 * that the 1 m grid is too coarse to show. A patch covers whole 1 m cells. Inside it
 * the fine heights are the 1 m surface plus an offset, sampled on the same triangle
 * split (each quad cut along its (i+1, j)–(i, j+1) diagonal, which the 1 m diagonals
 * pass along), so where the offset is zero the fine ground lies exactly on the 1 m
 * triangles and the seam is invisible.
 */
export interface DetailPatch {
  /** Sample index of the patch's min corner and its size, in 1 m cells. */
  ix0: number;
  iz0: number;
  nx: number;
  nz: number;
  /** Fine heights, (nx·SUB + 1) × (nz·SUB + 1), rows along x. */
  heights: Float32Array;
  /** Offset from the 1 m surface at each fine sample (− = rut, + = hump). */
  offset: Float32Array;
  /** 1 for each 1 m cell the fine ground replaces. */
  cells: Uint8Array;
}

export function patchStride(p: DetailPatch): number {
  return p.nx * DETAIL_SUB + 1;
}

/** Height on the fine triangles at a point inside a covered cell. */
export function patchHeightAt(p: DetailPatch, fx: number, fz: number): number {
  const w = patchStride(p);
  const gx = (fx - p.ix0) * DETAIL_SUB,
    gz = (fz - p.iz0) * DETAIL_SUB;
  const ix = Math.min(p.nx * DETAIL_SUB - 1, Math.max(0, Math.floor(gx)));
  const iz = Math.min(p.nz * DETAIL_SUB - 1, Math.max(0, Math.floor(gz)));
  const tx = gx - ix,
    tz = gz - iz;
  const i = iz * w + ix;
  const h = p.heights;
  if (tx + tz <= 1) return h[i] + tx * (h[i + 1] - h[i]) + tz * (h[i + w] - h[i]);
  return h[i + w + 1] + (1 - tx) * (h[i + w] - h[i + w + 1]) + (1 - tz) * (h[i + 1] - h[i + w + 1]);
}

/** Gradient (dh/dx, dh/dz) of the fine triangle under a point. */
export function patchSlopeAt(p: DetailPatch, fx: number, fz: number): [number, number] {
  const w = patchStride(p);
  const gx = (fx - p.ix0) * DETAIL_SUB,
    gz = (fz - p.iz0) * DETAIL_SUB;
  const ix = Math.min(p.nx * DETAIL_SUB - 1, Math.max(0, Math.floor(gx)));
  const iz = Math.min(p.nz * DETAIL_SUB - 1, Math.max(0, Math.floor(gz)));
  const i = iz * w + ix;
  const h = p.heights;
  if (gx - ix + (gz - iz) <= 1) return [(h[i + 1] - h[i]) * DETAIL_SUB, (h[i + w] - h[i]) * DETAIL_SUB];
  return [(h[i + w + 1] - h[i + w]) * DETAIL_SUB, (h[i + w + 1] - h[i + 1]) * DETAIL_SUB];
}

/** Offset of a drainage hump at a point `u` metres along from its crest (track direction). */
function humpOffset(hump: TrackHumpDef, u: number): number {
  const half = hump.length / 2;
  let h = 0;
  if (Math.abs(u) < half) h += hump.height * Math.cos((Math.PI * u) / (2 * half)) ** 2;
  const ditch = hump.ditch ?? 0;
  if (ditch > 0) {
    // The ditch is dug from the mound's toe on the water side.
    const v = u * (hump.ditchSide ?? 1) - half * 0.55,
      span = half * 1.3;
    if (v > 0 && v < span) h -= ditch * Math.sin((Math.PI * v) / span) ** 2;
  }
  return h;
}

/** Depth of an erosion rut at a point (s along, l right) in track coordinates. */
function rutOffset(rut: ErosionRutDef, s: number, l: number): number {
  const path = rut.path;
  let best = Infinity,
    along = 0,
    total = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [s0, l0] = path[k],
      [s1, l1] = path[k + 1];
    const ds = s1 - s0,
      dl = l1 - l0,
      len = Math.hypot(ds, dl);
    const t = Math.max(0, Math.min(1, ((s - s0) * ds + (l - l0) * dl) / (len * len)));
    const d = Math.hypot(s - s0 - ds * t, l - l0 - dl * t);
    if (d < best) {
      best = d;
      along = total + len * t;
    }
    total += len;
  }
  const hw = rut.width / 2;
  if (best >= hw) return 0;
  // Flat floor, sloping walls; the rut starts and ends over up to two metres.
  const ramp = Math.min(2, total * 0.3);
  const taper = smoothstep(0, ramp, along) * smoothstep(0, ramp, total - along);
  return -rut.depth * taper * (1 - smoothstep(hw * 0.35, hw, best));
}

/**
 * Build the fine detail for one track: sample its humps and ruts at 0.25 m over the
 * track corridor, keep the 1 m cells they touch plus a one-cell margin, and set the
 * fine heights from `coarseHeight` (the plain 1 m surface) plus the offset.
 */
export function buildDetailPatch(
  track: TrackInfo,
  half: number,
  coarseHeight: (x: number, z: number) => number,
): DetailPatch | null {
  const def = track.def;
  const humps = def.humps ?? [],
    ruts = def.erosion ?? [];
  if (humps.length === 0 && ruts.length === 0) return null;
  const poly = track.poly;
  const reach = def.width / 2 + def.shoulder + 1.5;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let k = 0; k < poly.count; k++) {
    minX = Math.min(minX, poly.xs[k] - reach);
    maxX = Math.max(maxX, poly.xs[k] + reach);
    minZ = Math.min(minZ, poly.zs[k] - reach);
    maxZ = Math.max(maxZ, poly.zs[k] + reach);
  }
  const ix0 = Math.floor(minX + half) - 1,
    iz0 = Math.floor(minZ + half) - 1;
  const nx = Math.ceil(maxX + half) + 1 - ix0,
    nz = Math.ceil(maxZ + half) + 1 - iz0;
  const w = nx * DETAIL_SUB + 1,
    rows = nz * DETAIL_SUB + 1;
  const offset = new Float32Array(w * rows);
  const hw = def.width / 2;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < w; i++) {
      const x = ix0 - half + i / DETAIL_SUB,
        z = iz0 - half + j / DETAIL_SUB;
      // Nearest point on the centreline: distance along and signed offset (+ right).
      let d2 = Infinity,
        s = 0,
        l = 0;
      for (let k = 0; k + 1 < poly.count; k++) {
        const ax = poly.xs[k],
          az = poly.zs[k];
        const vx = poly.xs[k + 1] - ax,
          vz = poly.zs[k + 1] - az;
        const len2 = vx * vx + vz * vz;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
        const cx = ax + vx * t - x,
          cz = az + vz * t - z;
        const dd = cx * cx + cz * cz;
        if (dd < d2) {
          d2 = dd;
          s = poly.s[k] + (poly.s[k + 1] - poly.s[k]) * t;
          l = (-vz * (x - ax) + vx * (z - az)) / Math.sqrt(len2);
        }
      }
      if (d2 > reach * reach) continue;
      let o = 0;
      for (const hump of humps) {
        // Humps run past the track edges into the banks, then fade.
        const fade = 1 - smoothstep(hw + def.shoulder, reach, Math.abs(l));
        const skew = Math.tan(((hump.angleDeg ?? 0) * Math.PI) / 180);
        o += humpOffset(hump, s - hump.at - l * skew) * fade;
      }
      for (const rut of ruts) o += rutOffset(rut, s, l);
      offset[j * w + i] = o;
    }
  // Cells touching any offset, grown by one so the patch edge carries no offset.
  const touched = new Uint8Array(nx * nz);
  for (let cz = 0; cz < nz; cz++)
    for (let cx = 0; cx < nx; cx++) {
      let any = false;
      for (let j = 0; j <= DETAIL_SUB && !any; j++)
        for (let i = 0; i <= DETAIL_SUB && !any; i++)
          if (Math.abs(offset[(cz * DETAIL_SUB + j) * w + cx * DETAIL_SUB + i]) > 1e-4) any = true;
      touched[cz * nx + cx] = any ? 1 : 0;
    }
  const cells = new Uint8Array(nx * nz);
  let count = 0;
  for (let cz = 1; cz < nz - 1; cz++)
    for (let cx = 1; cx < nx - 1; cx++) {
      let near = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) near |= touched[(cz + dz) * nx + cx + dx];
      cells[cz * nx + cx] = near;
      count += near;
    }
  if (count === 0) return null;
  const heights = new Float32Array(w * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < w; i++)
      heights[j * w + i] =
        coarseHeight(ix0 - half + i / DETAIL_SUB, iz0 - half + j / DETAIL_SUB) + offset[j * w + i];
  return { ix0, iz0, nx, nz, heights, offset, cells };
}

/**
 * How far to push down each 1 m sample hidden under fine detail, keyed by sample
 * index. Only samples whose four cells are all covered move, and each ends below the
 * lowest fine ground in those cells, so the 1 m surface never pokes through.
 */
export function detailUndercut(patches: readonly DetailPatch[], res: number): Map<number, number> {
  const drop = new Map<number, number>();
  for (const p of patches) {
    const w = patchStride(p);
    const cellMin = new Float32Array(p.nx * p.nz).fill(Infinity);
    for (let cz = 0; cz < p.nz; cz++)
      for (let cx = 0; cx < p.nx; cx++) {
        if (!p.cells[cz * p.nx + cx]) continue;
        let m = Infinity;
        for (let j = 0; j <= DETAIL_SUB; j++)
          for (let i = 0; i <= DETAIL_SUB; i++)
            m = Math.min(m, p.heights[(cz * DETAIL_SUB + j) * w + cx * DETAIL_SUB + i]);
        cellMin[cz * p.nx + cx] = m;
      }
    for (let vz = 1; vz < p.nz; vz++)
      for (let vx = 1; vx < p.nx; vx++) {
        const around = [(vz - 1) * p.nx + vx - 1, (vz - 1) * p.nx + vx, vz * p.nx + vx - 1, vz * p.nx + vx];
        if (!around.every((c) => p.cells[c])) continue;
        const floor = Math.min(...around.map((c) => cellMin[c])) - UNDERCUT;
        const ix = p.ix0 + vx,
          iz = p.iz0 + vz;
        const base =
          p.heights[vz * DETAIL_SUB * w + vx * DETAIL_SUB] - p.offset[vz * DETAIL_SUB * w + vx * DETAIL_SUB];
        drop.set(iz * res + ix, Math.max(0, base - floor));
      }
  }
  return drop;
}

/** Fine-grid corners of each triangle over a patch's covered cells, for collision and drawing. */
export function patchTriangles(p: DetailPatch, emit: (i: number, j: number) => void): void {
  for (let cz = 0; cz < p.nz; cz++)
    for (let cx = 0; cx < p.nx; cx++) {
      if (!p.cells[cz * p.nx + cx]) continue;
      for (let j = 0; j < DETAIL_SUB; j++)
        for (let i = 0; i < DETAIL_SUB; i++) {
          const gi = cx * DETAIL_SUB + i,
            gj = cz * DETAIL_SUB + j;
          // Same diagonal as the 1 m grid; winding faces up.
          emit(gi, gj);
          emit(gi, gj + 1);
          emit(gi + 1, gj);
          emit(gi + 1, gj);
          emit(gi, gj + 1);
          emit(gi + 1, gj + 1);
        }
    }
}
