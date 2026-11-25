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
  Concrete: 11,
  BlackSoil: 12,
  /** The dark wet inside of a pothole or washout deep enough to pinch a tyre. */
  Pothole: 13,
  /** Dry river sand. */
  Sand: 14,
} as const;
export type GroundTint = (typeof GroundTint)[keyof typeof GroundTint];

/** What a track paints on the ground: its tints come from `GroundTint`. */
export const TrackPaintKind = { None: 0, Dirt: 1, Gravel: 2, Concrete: 3, Faint: 4 } as const;

/** The tint a track of this paint kind has away from its edges. */
export function trackTint(kind: number): GroundTint {
  return kind === TrackPaintKind.Faint
    ? GroundTint.FaintTrack
    : kind === TrackPaintKind.Gravel
      ? GroundTint.Gravel
      : kind === TrackPaintKind.Concrete
        ? GroundTint.Concrete
        : GroundTint.DirtTrack;
}

/**
 * Track paint near the edge of each painted track, per 1 m sample, so the edge can be
 * drawn smooth instead of in 1 m steps. `edge` is the distance from the track's edge in
 * tenths of a metre (negative on the track), or `NO_TRACK_EDGE` more than 2 m from any
 * painted track. It is kept where something was painted over the track afterwards, and
 * at every clay bank sample (of any track, however far out), as a bank is drawn out from it.
 * `paint` is the kind in its low 3 bits and, above them, the tint the ground has beside
 * the track. 0 = no track paint here.
 */
export const NO_TRACK_EDGE = -128;
export interface TrackPaint {
  edge: Int8Array;
  paint: Uint8Array;
  /**
   * Where `edge` is kept: the sample's offset (tenths of a metre) from the track's centre
   * line, + on its left. With `edge` it gives the distance out from either edge, which
   * changes evenly right across the track, so a terrain chunk with vertices further apart
   * than the track is wide can still draw both edges where they are (v1.74).
   */
  offset: Int8Array;
}

/**
 * A patch of ground painted over whatever is there (a washout, a bog, a creek bank), so
 * its edge can be drawn smooth instead of in 1 m steps. `edge` is the distance (m) out
 * from the patch's edge, negative inside; within `rimWidth` (m) of the edge it shows
 * `rim`, deeper in `inner`. `under` is the tint the ground had before the patch. A round
 * patch (a pothole) also gives its centre, east and south of the sample (m), so it can
 * be drawn round where the 1 m samples alone would draw it as a diamond.
 */
export interface GroundPatch {
  edge: number;
  inner: GroundTint;
  rim: GroundTint;
  rimWidth: number;
  under: GroundTint;
  centre?: readonly [number, number];
}

/** Ground patches are kept this far (m) out from their edge, so the edge blends true. */
export const PATCH_REACH = 2;

const tenths = (m: number) => Math.max(-127, Math.min(127, Math.round(m * 10))) + 128;

/**
 * A ground patch packed into one number: edge, rim width and centre in tenths of a metre.
 * The tints and widths take the low 28 bits; the centre sits above them.
 */
export function packPatch(p: GroundPatch): number {
  const rim = Math.max(0, Math.min(255, Math.round(p.rimWidth * 10)));
  const low = tenths(p.edge) | (rim << 8) | (p.inner << 16) | (p.rim << 20) | (p.under << 24);
  const high = p.centre ? 1 | (tenths(p.centre[0]) << 1) | (tenths(p.centre[1]) << 9) : 0;
  return low + high * 2 ** 28;
}

export function unpackPatch(v: number): GroundPatch {
  const high = Math.floor(v / 2 ** 28);
  return {
    edge: ((v & 255) - 128) / 10,
    rimWidth: ((v >> 8) & 255) / 10,
    inner: ((v >> 16) & 15) as GroundTint,
    rim: ((v >> 20) & 15) as GroundTint,
    under: ((v >> 24) & 15) as GroundTint,
    centre: high & 1 ? [(((high >> 1) & 255) - 128) / 10, (((high >> 9) & 255) - 128) / 10] : undefined,
  };
}

/**
 * A bare clay bank beside a track, packed into one number: how far (tenths of a metre,
 * roughly) the sample is outside the bank, negative on it, and the tint the ground would
 * have without it. Banks are drawn under the track paint, so only their outer edge shows.
 */
export function packBank(edge: number, under: GroundTint): number {
  return tenths(edge) | (under << 8);
}

export function unpackBank(v: number): { edge: number; under: GroundTint } {
  return { edge: ((v & 255) - 128) / 10, under: ((v >> 8) & 15) as GroundTint };
}

/** The tint a ground patch gives the 1 m sample it is at. */
export function patchTint(p: GroundPatch): GroundTint {
  return p.edge > 0 ? p.under : p.edge < -p.rimWidth ? p.inner : p.rim;
}

/**
 * Terrain grid: 1 m samples, `resX` × `resZ`, centred on the origin. Sample (ix, iz)
 * sits at x = ix - halfX, z = iz - halfZ, at index iz * resX + ix. Each cell is split into
 * two triangles along the (ix, iz)–(ix+1, iz+1) diagonal, matching the physics heightfield.
 */
export class Terrain {
  /** Samples east–west and north–south (one more than the cells). */
  readonly resX: number;
  readonly resZ: number;
  /** Half the map's extent east–west and north–south (m). */
  readonly halfX: number;
  readonly halfZ: number;
  /** Fine ground detail (ruts, drainage humps) drawn and collided instead of the 1 m cells it covers. */
  detail: readonly DetailPatch[] = [];
  /** How far each 1 m sample hidden under fine detail is pushed down (sample index → m). */
  undercut = new Map<number, number>();
  /** Depth of the pothole or washout at each 1 m sample well inside one (sample index → m). */
  holes = new Map<number, number>();
  /** Smooth track edges for drawing (null: draw the tint grid as it is). */
  trackPaint: TrackPaint | null = null;
  /** Ground patches near each 1 m sample they cover or come within `PATCH_REACH` of (packed). */
  groundPatches = new Map<number, number>();
  /** Clay banks beside the tracks near each 1 m sample they cover or come within `PATCH_REACH` of (packed). */
  clayBanks = new Map<number, number>();
  /** The edges of the tracks and the clay banks are mud (`GroundTint.Mud`), not `DirtEdge`. */
  muddyEdges = false;
  private readonly detailCells = new Map<number, DetailPatch>();

  /** `sizeX` × `sizeZ` cells of 1 m: the map's width (east–west) and length (north–south). */
  constructor(
    readonly sizeX: number,
    readonly sizeZ: number,
    readonly heights: Float32Array,
    readonly surface: Uint8Array,
    readonly tint: Uint8Array,
    readonly water: Float32Array,
  ) {
    this.resX = sizeX + 1;
    this.resZ = sizeZ + 1;
    this.halfX = sizeX / 2;
    this.halfZ = sizeZ / 2;
  }

  /** Use fine ground detail over the 1 m cells it covers. */
  setDetail(patches: readonly DetailPatch[]): void {
    this.detail = patches;
    this.detailCells.clear();
    for (const p of patches)
      for (let cz = 0; cz < p.nz; cz++)
        for (let cx = 0; cx < p.nx; cx++)
          if (p.cells[cz * p.nx + cx]) this.detailCells.set((p.iz0 + cz) * this.sizeX + p.ix0 + cx, p);
    this.undercut = detailUndercut(patches, this.resX);
  }

  /** The 1 m sample as collided and drawn: pushed under any fine detail covering it. */
  solidSample(ix: number, iz: number): number {
    const r = this.resX;
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= this.resZ ? this.resZ - 1 : iz;
    return this.heights[iz * r + ix] - (this.undercut.get(iz * r + ix) ?? 0);
  }

  sample(ix: number, iz: number): number {
    const r = this.resX;
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= this.resZ ? this.resZ - 1 : iz;
    return this.heights[iz * r + ix];
  }

  /** Exact height on the triangulated surface (same triangles as physics and render LOD 0). */
  heightAt(x: number, z: number): number {
    const fx = Math.min(Math.max(x + this.halfX, 0), this.sizeX - 1e-6);
    const fz = Math.min(Math.max(z + this.halfZ, 0), this.sizeZ - 1e-6);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (this.detailCells.size > 0) {
      const patch = this.detailCells.get(iz * this.sizeX + ix);
      if (patch) return patchHeightAt(patch, fx, fz);
    }
    const tx = fx - ix;
    const tz = fz - iz;
    const r = this.resX;
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
    const fx = Math.min(Math.max(x + this.halfX, 0), this.sizeX - 1e-6);
    const fz = Math.min(Math.max(z + this.halfZ, 0), this.sizeZ - 1e-6);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const patch = this.detailCells.size > 0 ? this.detailCells.get(iz * this.sizeX + ix) : undefined;
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
    const r = this.resX;
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

  /** Index of the sample nearest (x, z), clamped to the map. */
  index(x: number, z: number): number {
    const r = this.resX;
    let ix = Math.round(x + this.halfX);
    let iz = Math.round(z + this.halfZ);
    ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
    iz = iz < 0 ? 0 : iz >= this.resZ ? this.resZ - 1 : iz;
    return iz * r + ix;
  }

  surfaceAt(x: number, z: number): SurfaceId {
    return this.surface[this.index(x, z)] as SurfaceId;
  }

  /** Depth (m) of the pothole or washout a point is in, 0 where there is none. */
  holeAt(x: number, z: number): number {
    return this.holes.size > 0 ? (this.holes.get(this.index(x, z)) ?? 0) : 0;
  }

  smoothAt(x: number, z: number): boolean {
    return this.tintAt(x, z) === GroundTint.Concrete;
  }

  tintAt(x: number, z: number): GroundTint {
    return this.tint[this.index(x, z)] as GroundTint;
  }

  /**
   * Water surface height at (x, z), or null if dry. Uses the highest water level of
   * the four surrounding samples so the edge of the creek counts as wet.
   */
  waterSurfaceAt(x: number, z: number, levelOffset = 0): number | null {
    const ix = Math.floor(x + this.halfX);
    const iz = Math.floor(z + this.halfZ);
    if (ix < 0 || iz < 0 || ix >= this.sizeX || iz >= this.sizeZ) return null;
    const r = this.resX;
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
    return Math.abs(x) <= this.halfX && Math.abs(z) <= this.halfZ;
  }
}

export { SurfaceId };
