import { SurfaceId } from '../../data/surfaces';
import { detailUndercut, patchHeightAt, patchSlopeAt, type DetailPatch } from './detail';

/** Marker for "no water here" in the water-surface grid. */
export const NO_WATER = -1e6;

/** Visual ground tint per sample (render picks palette colours from this). */
export const GroundTint = {
  GrassDry: 0,
  GrassSage: 1,
  DirtTrack: 2,
  DirtEdge: 3,
  Rock: 4,
  Scree: 5,
  Mud: 6,
  Gravel: 7,
  CreekBed: 8,
  ForestFloor: 9,
  FaintTrack: 10,
} as const;
export type GroundTint = (typeof GroundTint)[keyof typeof GroundTint];

/**
 * Terrain grid: 1 m samples, `res` × `res`, centred on the origin. Sample (ix, iz)
 * sits at x = ix - half, z = iz - half. Each cell is split into two triangles along
 * the (ix, iz)–(ix+1, iz+1) diagonal, matching the physics heightfield.
 */
export class Terrain {
  readonly res: number;
  readonly half: number;
  /** Fine ground detail (ruts, drainage humps) drawn and collided instead of the 1 m cells it covers. */
  detail: readonly DetailPatch[] = [];
  /** How far each 1 m sample hidden under fine detail is pushed down (sample index → m). */
  undercut = new Map<number, number>();
  private readonly detailCells = new Map<number, DetailPatch>();

  constructor(
    readonly size: number,
    readonly heights: Float32Array,
    readonly surface: Uint8Array,
    readonly tint: Uint8Array,
    readonly water: Float32Array,
  ) {
    this.res = size + 1;
    this.half = size / 2;
  }

  /** Use fine ground detail over the 1 m cells it covers. */
  setDetail(patches: readonly DetailPatch[]): void {
    this.detail = patches;
    this.detailCells.clear();
    for (const p of patches)
      for (let cz = 0; cz < p.nz; cz++)
        for (let cx = 0; cx < p.nx; cx++)
          if (p.cells[cz * p.nx + cx]) this.detailCells.set((p.iz0 + cz) * this.size + p.ix0 + cx, p);
    this.undercut = detailUndercut(patches, this.res);
  }

  /** The 1 m sample as collided and drawn: pushed under any fine detail covering it. */
  solidSample(ix: number, iz: number): number {
    const r = this.res;
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= r ? r - 1 : iz;
    return this.heights[iz * r + ix] - (this.undercut.get(iz * r + ix) ?? 0);
  }

  sample(ix: number, iz: number): number {
    const r = this.res;
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= r ? r - 1 : iz;
    return this.heights[iz * r + ix];
  }

  /** Exact height on the triangulated surface (same triangles as physics and render LOD 0). */
  heightAt(x: number, z: number): number {
    const fx = Math.min(Math.max(x + this.half, 0), this.size - 1e-6);
    const fz = Math.min(Math.max(z + this.half, 0), this.size - 1e-6);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (this.detailCells.size > 0) {
      const patch = this.detailCells.get(iz * this.size + ix);
      if (patch) return patchHeightAt(patch, fx, fz);
    }
    const tx = fx - ix;
    const tz = fz - iz;
    const r = this.res;
    const i = iz * r + ix;
    const h00 = this.heights[i];
    const h10 = this.heights[i + 1];
    const h01 = this.heights[i + r];
    const h11 = this.heights[i + r + 1];
    if (tx + tz <= 1) return h00 + tx * (h10 - h00) + tz * (h01 - h00);
    return h11 + (1 - tx) * (h01 - h11) + (1 - tz) * (h10 - h11);
  }

  /** Surface normal (unit) of the triangle under (x, z). */
  normalAt(
    x: number,
    z: number,
    out: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number } {
    const fx = Math.min(Math.max(x + this.half, 0), this.size - 1e-6);
    const fz = Math.min(Math.max(z + this.half, 0), this.size - 1e-6);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const patch = this.detailCells.size > 0 ? this.detailCells.get(iz * this.size + ix) : undefined;
    if (patch) {
      const [gx, gz] = patchSlopeAt(patch, fx, fz);
      const len = Math.sqrt(gx * gx + 1 + gz * gz);
      out.x = -gx / len;
      out.y = 1 / len;
      out.z = -gz / len;
      return out;
    }
    const tx = fx - ix;
    const tz = fz - iz;
    const r = this.res;
    const i = iz * r + ix;
    const h00 = this.heights[i];
    const h10 = this.heights[i + 1];
    const h01 = this.heights[i + r];
    const h11 = this.heights[i + r + 1];
    let dx: number;
    let dz: number;
    if (tx + tz <= 1) {
      dx = h10 - h00;
      dz = h01 - h00;
    } else {
      dx = h11 - h01;
      dz = h11 - h10;
    }
    const len = Math.sqrt(dx * dx + 1 + dz * dz);
    out.x = -dx / len;
    out.y = 1 / len;
    out.z = -dz / len;
    return out;
  }

  /** Slope in degrees at (x, z). */
  slopeDegAt(x: number, z: number): number {
    const n = this.normalAt(x, z, { x: 0, y: 0, z: 0 });
    return (Math.acos(Math.min(1, n.y)) * 180) / Math.PI;
  }

  private nearestIndex(x: number, z: number): number {
    const r = this.res;
    let ix = Math.round(x + this.half);
    let iz = Math.round(z + this.half);
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= r ? r - 1 : iz;
    return iz * r + ix;
  }

  surfaceAt(x: number, z: number): SurfaceId {
    return this.surface[this.nearestIndex(x, z)] as SurfaceId;
  }

  tintAt(x: number, z: number): GroundTint {
    return this.tint[this.nearestIndex(x, z)] as GroundTint;
  }

  /**
   * Water surface height at (x, z), or null if dry. Uses the highest water level of
   * the four surrounding samples so the edge of the creek counts as wet.
   */
  waterSurfaceAt(x: number, z: number, levelOffset = 0): number | null {
    const fx = x + this.half;
    const fz = z + this.half;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return null;
    const r = this.res;
    const i = iz * r + ix;
    const w = Math.max(this.water[i], this.water[i + 1], this.water[i + r], this.water[i + r + 1]);
    if (w <= NO_WATER) return null;
    return w + levelOffset;
  }

  /** Water depth above the ground at (x, z) (0 if dry). */
  waterDepthAt(x: number, z: number, levelOffset = 0): number {
    const w = this.waterSurfaceAt(x, z, levelOffset);
    if (w === null) return 0;
    return Math.max(0, w - this.heightAt(x, z));
  }

  inBounds(x: number, z: number): boolean {
    return Math.abs(x) <= this.half && Math.abs(z) <= this.half;
  }
}

export { SurfaceId };
