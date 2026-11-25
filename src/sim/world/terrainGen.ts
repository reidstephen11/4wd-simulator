import { SurfaceId } from '../../data/surfaces';
import type { FlatDef, MapDef, ScarpDef, HillDef, TrackDef } from './mapTypes';
import { Noise2D, clamp, smoothstep } from './noise';
import { attrAt, densify, locate, type DensePolyline } from './polyline';
import {
  GroundTint,
  NO_TRACK_EDGE,
  NO_WATER,
  PATCH_REACH,
  Terrain,
  packBank,
  TrackPaintKind,
  packPatch,
  patchTint,
  trackTint,
} from './terrain';
import type { CreekInfo, GullyInfo, StaticBox, TerrainFeatures, TrackInfo } from './features';
import { buildDetailPatch, type DetailPatch } from './detail';
import { BEARING, onBridge } from './bridges';
import {
  roughHole,
  roughPatch,
  roughOffset,
  trackMudHoles,
  trackRoughness,
  type TrackRoughness,
} from './roughness';

/** Macro relief is evaluated on a coarser grid and upsampled. */
const MACRO_STEP = 2;
/** Distance from the creek centreline over which the banks are carved (a creek's `valley` widens it). */
const CREEK_BANK_REACH = 34;
/** A track following the ground meets a pin at its end over this distance (m). */
const PIN_FADE = 80;
/** Steepest rise (height per metre) of the valley sides beyond the carved banks. */
const CREEK_WALL_SLOPE = 1.5;
/** The edges of dirt, clay and gravel tracks are darker (mud after rain) from this far (m) inside the edge. */
const MUD_EDGE = 0.4;
/** Beside a track, ground the grading cut or built up by more than this (m) is a bank. */
const BANK_CUT = 0.4;
/**
 * How far out from the water a creek's banks are filled or a ford ramps to the bed (m).
 * Inside this, creek carving may raise a weir when the paddock sits below the water;
 * track grading must cut a ramp through that weir or the channel skip leaves a wall.
 */
const CREEK_BANK_RAMP = 8;
/** A creek's banks are filled to at most this far (m) above its water, within that reach. */
const CREEK_BANK_FILL = 0.35;

interface Grid {
  resX: number;
  resZ: number;
  step: number;
  originX: number;
  originZ: number;
}

export interface GenStep {
  progress: number;
  label: string;
}

export interface GeneratedTerrain {
  terrain: Terrain;
  features: TerrainFeatures;
}

/**
 * Stamp the distance to a polyline into `dist` (keeping the minimum) for every grid
 * sample within `radius`. `param` receives the fractional dense index of the nearest
 * point, `side` the signed lateral offset (positive on the left looking along the line).
 */
function stampPolyline(
  poly: DensePolyline,
  radius: number,
  grid: Grid,
  dist: Float32Array,
  param: Float32Array,
  side?: Float32Array,
  owner?: Int16Array,
  ownerId = 0,
): void {
  const { resX, resZ, step, originX, originZ } = grid;
  for (let k = 0; k < poly.count - 1; k++) {
    const ax = poly.xs[k];
    const az = poly.zs[k];
    const bx = poly.xs[k + 1];
    const bz = poly.zs[k + 1];
    const minX = Math.max(0, Math.floor((Math.min(ax, bx) - radius - originX) / step));
    const maxX = Math.min(resX - 1, Math.ceil((Math.max(ax, bx) + radius - originX) / step));
    const minZ = Math.max(0, Math.floor((Math.min(az, bz) - radius - originZ) / step));
    const maxZ = Math.min(resZ - 1, Math.ceil((Math.max(az, bz) + radius - originZ) / step));
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const invLen = len2 > 0 ? 1 / Math.sqrt(len2) : 0;
    for (let iz = minZ; iz <= maxZ; iz++) {
      const pz = originZ + iz * step;
      for (let ix = minX; ix <= maxX; ix++) {
        const px = originX + ix * step;
        const wx = px - ax;
        const wz = pz - az;
        let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + vx * t - px;
        const cz = az + vz * t - pz;
        const d = Math.sqrt(cx * cx + cz * cz);
        if (d > radius) continue;
        const i = iz * resX + ix;
        if (d < dist[i]) {
          dist[i] = d;
          param[i] = k + t;
          if (side) side[i] = (vx * wz - vz * wx) * invLen;
          if (owner) owner[i] = ownerId;
        }
      }
    }
  }
}

/** Value at fractional dense index p of a per-dense-point array. */
function atParam(arr: ArrayLike<number>, p: number): number {
  const i = Math.floor(p);
  const n = arr.length;
  if (i >= n - 1) return arr[n - 1];
  if (i < 0) return arr[0];
  const f = p - i;
  return arr[i] + (arr[i + 1] - arr[i]) * f;
}

/** Valley floor height at `x` along the floor's axis. */
function floorAt(floor: MapDef['floor'], x: number): number {
  if (x <= floor[0][0]) return floor[0][1];
  for (let i = 0; i < floor.length - 1; i++) {
    const [x0, h0] = floor[i];
    const [x1, h1] = floor[i + 1];
    if (x <= x1) return h0 + ((x - x0) / (x1 - x0)) * (h1 - h0);
  }
  return floor[floor.length - 1][1];
}

/** Precomputed scarp lookup: line position, width and height interpolated along the axis. */
function scarpValue(scarp: ScarpDef, x: number, z: number, noise: Noise2D): number {
  const pts = scarp.points;
  const alongX = scarp.raise === 'north' || scarp.raise === 'south';
  const a = alongX ? x : z;
  let i = 0;
  const key = (p: (typeof pts)[number]) => (alongX ? p.x : p.z);
  const line = (p: (typeof pts)[number]) => (alongX ? p.z : p.x);
  if (a <= key(pts[0])) i = 0;
  else if (a >= key(pts[pts.length - 1])) i = pts.length - 2;
  else while (i < pts.length - 2 && a > key(pts[i + 1])) i++;
  const p0 = pts[i];
  const p1 = pts[i + 1];
  const span = key(p1) - key(p0);
  const f = clamp((a - key(p0)) / span, 0, 1);
  const lineC =
    line(p0) + (line(p1) - line(p0)) * f + (scarp.wobble ?? 0) * noise.fbm(a / 140, scarp.id.length * 7.3, 2);
  const width = p0.width + (p1.width - p0.width) * f;
  const height = p0.height + (p1.height - p0.height) * f;
  const cos = 1 / Math.sqrt(1 + ((line(p1) - line(p0)) / span) ** 2);
  const c = alongX ? z : x;
  let d: number;
  switch (scarp.raise) {
    case 'north':
      d = (lineC - c) * cos;
      break;
    case 'south':
      d = (c - lineC) * cos;
      break;
    case 'east':
      d = (c - lineC) * cos;
      break;
    default:
      d = (lineC - c) * cos;
  }
  return height * smoothstep(-width / 2, width / 2, d);
}

/** Height a hill adds at (x, z). */
export function hillValue(h: HillDef, x: number, z: number): number {
  let dx = x - h.x;
  let dz = z - h.z;
  if (h.stretch) {
    const [sx, sz, deg] = h.stretch;
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rx = dx * c + dz * s;
    const rz = -dx * s + dz * c;
    dx = rx / sx;
    dz = rz / sz;
  }
  const r = Math.sqrt(dx * dx + dz * dz) / h.radius;
  if (r >= 1) return 0;
  switch (h.shape) {
    case 'cone': {
      const c = 1 - r;
      return h.height * c * smoothstep(0, 0.35, c) ** 0.5;
    }
    case 'mesa':
      return h.height * (1 - smoothstep(0.55, 1, r));
    default:
      return h.height * (0.5 + 0.5 * Math.cos(Math.PI * r));
  }
}

/** Bilinear sample of a grid `resX` samples wide and `resZ` long. */
function bilinear(src: Float32Array, resX: number, resZ: number, fx: number, fz: number): number {
  const ix = Math.min(resX - 2, Math.max(0, Math.floor(fx)));
  const iz = Math.min(resZ - 2, Math.max(0, Math.floor(fz)));
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * resX + ix;
  const a = src[i] + (src[i + 1] - src[i]) * tx;
  const b = src[i + resX] + (src[i + resX + 1] - src[i + resX]) * tx;
  return a + (b - a) * tz;
}

/** Whether a dense-point parameter falls in one of a track's [from, to] stretches. */
function inStretch(
  stretches: ReadonlyArray<readonly [number, number]> | undefined,
  s: ArrayLike<number>,
  param: number,
): boolean {
  if (!stretches) return false;
  const along = atParam(s, param);
  return stretches.some(([from, to]) => along >= from && along <= to);
}

/** A track's bank width (m) at a dense-point parameter. */
/** The x in [0, 1] at which smoothstep(0, 1, x) is y. */
function inverseSmoothstep(y: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * Math.min(1, Math.max(0, y))) / 3);
}

function shoulderAt(t: TrackInfo, p: number): number {
  return t.shoulders ? atParam(t.shoulders, p) : t.def.shoulder;
}

/** Widest bank (m) a batter may make: on a hillside steeper than the batter it stops here. */
const MAX_BATTER_SHOULDER = 14;

/**
 * Bank widths along a track with a `batter`: at each point wide enough that the bank from
 * the track's edge to the natural ground on either side is no steeper than the batter on
 * average (up to a limit, so a cut into a steep hillside doesn't reshape the whole slope),
 * and never narrower than its shoulder. Each width is held over the next few metres either
 * way and then eased along the track, so the deepest cut keeps its full width and the banks
 * don't jag.
 */
function batterShoulders(
  def: TrackDef,
  poly: DensePolyline,
  profile: Float32Array,
  groundAt: (x: number, z: number) => number,
): Float32Array {
  const hw = def.width / 2;
  const batter = def.batter!;
  const need = new Float32Array(poly.count);
  for (let k = 0; k < poly.count; k++) {
    const a = Math.max(0, k - 1);
    const b = Math.min(poly.count - 1, k + 1);
    const dx = poly.xs[b] - poly.xs[a];
    const dz = poly.zs[b] - poly.zs[a];
    const len = Math.hypot(dx, dz) || 1;
    const [nx, nz] = [-dz / len, dx / len];
    let s = def.shoulder;
    const steep = (side: number) =>
      Math.abs(groundAt(poly.xs[k] + nx * side * (hw + s), poly.zs[k] + nz * side * (hw + s)) - profile[k]) >
      batter * s;
    while (s < MAX_BATTER_SHOULDER && (steep(-1) || steep(1))) s += 1;
    need[k] = s;
  }
  const held = new Float32Array(poly.count);
  const r = 6;
  for (let k = 0; k < poly.count; k++)
    for (let j = Math.max(0, k - r); j <= Math.min(poly.count - 1, k + r); j++)
      held[k] = Math.max(held[k], need[j]);
  return boxBlur(held, r);
}

function boxBlur(src: Float32Array, radius: number): Float32Array {
  const n = src.length;
  const out = new Float32Array(n);
  const r = Math.max(0, Math.round(radius));
  let sum = 0;
  let count = 0;
  // Sliding window with clamped ends.
  for (let i = -r; i <= r; i++) {
    sum += src[clamp(i, 0, n - 1)];
    count++;
  }
  for (let i = 0; i < n; i++) {
    out[i] = sum / count;
    sum += src[clamp(i + r + 1, 0, n - 1)] - src[clamp(i - r, 0, n - 1)];
  }
  return out;
}

/**
 * Generate the terrain grid and derived features from map data. Written as a generator
 * so the browser can show progress between steps; call `generateTerrain` to run it all.
 */
export function* generateTerrainSteps(map: MapDef): Generator<GenStep, GeneratedTerrain, void> {
  const halfX = map.width / 2;
  const halfZ = map.length / 2;
  const resX = map.width + 1;
  const resZ = map.length + 1;
  const n = resX * resZ;
  // Distance inside the map's edge, ragged by noise: where the border mountains rise.
  const edgeIn = (x: number, z: number) =>
    Math.min(halfX - Math.abs(x), halfZ - Math.abs(z)) + noise3.fbm(x / 160, z / 160, 2) * 40;
  const noise = new Noise2D(map.seed);
  const noise2 = new Noise2D(map.seed + 101);
  const noise3 = new Noise2D(map.seed + 202);
  const roughNoise = new Noise2D(map.seed + 303);

  // --- Creek centrelines (needed early to calm the noise near water) ---
  // Every creek and river is carved the same way; where two meet, each sample belongs to
  // the nearer one, so their water levels should agree at the junction.
  const creekLines = map.creeks.map((def) => {
    const pts = def.points.map((p) => [p.x, p.z] as const);
    return {
      def,
      pts,
      poly: densify(pts, 1),
      water: def.points.map((p) => p.water),
      halfWidth: def.points.map((p) => p.halfWidth),
      depth: def.points.map((p) => p.depth),
      bankSlope: def.points.map((p) => p.bankSlope ?? 0.55),
      gravel: def.points.map((p) => (p.bed === 'gravel' ? 1 : 0)),
      sand: def.points.map((p) => (p.bed === 'sand' ? 1 : 0)),
      flow: def.points.map((p) => p.flow ?? def.flow ?? 0),
      reach: def.valley ?? CREEK_BANK_REACH,
    };
  });

  yield { progress: 0.02, label: 'Shaping hills' };

  // --- Macro relief on a coarse grid ---
  const mresX = map.width / MACRO_STEP + 1;
  const mresZ = map.length / MACRO_STEP + 1;
  const mn = mresX * mresZ;
  const mgrid: Grid = { resX: mresX, resZ: mresZ, step: MACRO_STEP, originX: -halfX, originZ: -halfZ };
  const macro = new Float32Array(mn);
  const mCreekDist = new Float32Array(mn).fill(1e9);
  const mCreekParam = new Float32Array(mn);
  for (const c of creekLines) stampPolyline(c.poly, map.noise.creekCalm, mgrid, mCreekDist, mCreekParam);

  const ridgeDist = new Float32Array(mn);
  const ridgeParam = new Float32Array(mn);
  const ridgeAdd = new Float32Array(mn);
  for (const ridge of map.ridges) {
    ridgeDist.fill(1e9);
    const poly = densify(ridge.points, 4);
    stampPolyline(poly, ridge.width, mgrid, ridgeDist, ridgeParam);
    const sigma = ridge.width * 0.4;
    for (let i = 0; i < ridgeDist.length; i++) {
      const d = ridgeDist[i];
      if (d < ridge.width) ridgeAdd[i] += ridge.height * Math.exp(-(d * d) / (sigma * sigma));
    }
  }

  const { border } = map;
  for (let iz = 0; iz < mresZ; iz++) {
    const z = -halfZ + iz * MACRO_STEP;
    for (let ix = 0; ix < mresX; ix++) {
      const x = -halfX + ix * MACRO_STEP;
      const i = iz * mresX + ix;
      let h = floorAt(map.floor, map.floorAlong === 'z' ? z : x);
      const calm = 0.22 + 0.78 * smoothstep(8, map.noise.creekCalm, mCreekDist[i]);
      h +=
        calm *
        (map.noise.macroAmplitude * noise.fbm(x / map.noise.macroScale, z / map.noise.macroScale, 3) +
          map.noise.midAmplitude * noise2.fbm(x / map.noise.midScale, z / map.noise.midScale, 2));
      for (const s of map.scarps) h += scarpValue(s, x, z, noise3);
      for (const hill of map.hills) h += hillValue(hill, x, z);
      h += ridgeAdd[i];
      // Border mountains close off the map edge.
      const e = edgeIn(x, z);
      let b = smoothstep(border.width, 0, e);
      if (b > 0) {
        for (const g of border.gaps) {
          const gd = Math.hypot(x - g.x, z - g.z);
          b *= smoothstep(g.radius * 0.4, g.radius * 2.6, gd);
        }
        // Forested hills are rounded: no sharp crests.
        const crests = border.forested ? 0 : 0.2 * noise2.ridged(x / 130, z / 130, 2);
        h += b * border.height * (0.75 + 0.35 * noise3.fbm(x / 240, z / 240, 3) + crests);
      }
      macro[i] = h;
    }
  }

  // Valley sides: beyond the carved banks the ground may rise no faster than
  // CREEK_WALL_SLOPE, so tall relief beside the creek (the border mountains at either
  // end) meets the bank carve without a cliff. The reach is long enough for the cap to
  // rise above the tallest relief, so it ends without a step.
  let top = -Infinity;
  for (let i = 0; i < macro.length; i++) top = Math.max(top, macro[i]);
  for (const c of creekLines) {
    let lowBank = Infinity;
    for (let k = 0; k < c.def.points.length; k++) {
      const p = c.def.points[k];
      lowBank = Math.min(lowBank, p.water + (c.reach - p.halfWidth) * c.bankSlope[k]);
    }
    const wallReach = c.reach + Math.max(0, top - lowBank) / CREEK_WALL_SLOPE + MACRO_STEP;
    const wallPoly = densify(c.pts, 4);
    const mWallDist = new Float32Array(mn).fill(1e9);
    const mWallParam = new Float32Array(mn);
    stampPolyline(wallPoly, wallReach, mgrid, mWallDist, mWallParam);
    for (let i = 0; i < macro.length; i++) {
      const d = mWallDist[i];
      if (d > wallReach) continue;
      const u = atParam(wallPoly.u, mWallParam[i]);
      const bankTop = attrAt(c.water, u) + (c.reach - attrAt(c.halfWidth, u)) * attrAt(c.bankSlope, u);
      const wall = bankTop + Math.max(0, d - c.reach) * CREEK_WALL_SLOPE;
      if (macro[i] > wall) macro[i] = wall;
    }
  }

  yield { progress: 0.18, label: 'Adding detail' };

  // --- Full resolution heights ---
  const heights = new Float32Array(n);
  const { detailAmplitude, detailScale } = map.noise;
  for (let iz = 0; iz < resZ; iz++) {
    const z = -halfZ + iz;
    const fz = iz / MACRO_STEP;
    for (let ix = 0; ix < resX; ix++) {
      const x = -halfX + ix;
      const h = bilinear(macro, mresX, mresZ, ix / MACRO_STEP, fz);
      heights[iz * resX + ix] =
        h +
        detailAmplitude * noise2.fbm(x / detailScale, z / detailScale, 2) +
        detailAmplitude * 0.25 * noise3.noise(x / 2.3, z / 2.3);
    }
  }

  const sampleH = (x: number, z: number) => bilinear(heights, resX, resZ, x + halfX, z + halfZ);

  // --- Flats (campsites, hut, lookout) and prop footprints ---
  const flats: FlatDef[] = [
    ...map.flats,
    ...map.props
      .filter((p) => p.flatten)
      .map((p) => ({ id: p.kind, x: p.x, z: p.z, radius: p.flatten ?? 0, blend: (p.flatten ?? 0) * 0.8 })),
  ];
  for (const f of flats) {
    let target = f.height;
    if (target === undefined) {
      let sum = 0;
      let cnt = 0;
      for (let dz = -f.radius; dz <= f.radius; dz += 1)
        for (let dx = -f.radius; dx <= f.radius; dx += 1)
          if (dx * dx + dz * dz <= f.radius * f.radius) {
            sum += sampleH(f.x + dx, f.z + dz);
            cnt++;
          }
      target = sum / Math.max(1, cnt);
    }
    const R = f.radius + f.blend;
    for (
      let iz = Math.max(0, Math.floor(f.z - R + halfZ));
      iz <= Math.min(resZ - 1, Math.ceil(f.z + R + halfZ));
      iz++
    )
      for (
        let ix = Math.max(0, Math.floor(f.x - R + halfX));
        ix <= Math.min(resX - 1, Math.ceil(f.x + R + halfX));
        ix++
      ) {
        const d = Math.hypot(ix - halfX - f.x, iz - halfZ - f.z);
        if (d >= R) continue;
        const w = 1 - smoothstep(f.radius, R, d);
        const i = iz * resX + ix;
        heights[i] += (target - heights[i]) * w;
      }
  }

  yield { progress: 0.3, label: 'Carving the creek' };

  // --- Creek channel ---
  const grid: Grid = { resX, resZ, step: 1, originX: -halfX, originZ: -halfZ };
  const water = new Float32Array(n).fill(NO_WATER);
  const creekDist = new Float32Array(n).fill(1e9);
  const creekParam = new Float32Array(n);
  const creekOwner = new Int16Array(n).fill(-1);
  creekLines.forEach((c, id) =>
    stampPolyline(c.poly, c.reach, grid, creekDist, creekParam, undefined, creekOwner, id),
  );
  const creekHalfAt = new Float32Array(n); // half width at the nearest creek point (0 if far)
  const surface = new Uint8Array(n).fill(SurfaceId.Grass);
  const tint = new Uint8Array(n).fill(GroundTint.GrassDry);
  for (let i = 0; i < n; i++) {
    const d = creekDist[i];
    if (creekOwner[i] < 0) continue;
    const c = creekLines[creekOwner[i]];
    if (d > c.reach) continue;
    const u = atParam(c.poly.u, creekParam[i]);
    const W = attrAt(c.water, u);
    const hw = attrAt(c.halfWidth, u);
    const depth = attrAt(c.depth, u);
    const bankSlope = attrAt(c.bankSlope, u);
    creekHalfAt[i] = hw;
    if (d <= hw) {
      const q = d / hw;
      heights[i] = W - depth * (1 - q * q);
      water[i] = W;
    } else {
      const upper = W + (d - hw) * bankSlope;
      const lower = W + Math.min(CREEK_BANK_FILL, (d - hw) * bankSlope * 0.9);
      let h = heights[i];
      if (h > upper) h = upper;
      if (d < hw + CREEK_BANK_RAMP && h < lower) h = lower;
      heights[i] = h;
    }
  }
  // Shallow bars: the bed rises to the bar's depth below the water. A bar's top is firm
  // even where the rest of the creek's bed is soft (`CreekDef.softBed`).
  const firmBed = new Uint8Array(n);
  for (const c of creekLines)
    for (const bar of c.def.bars ?? []) {
      const a = (bar.rotationDeg * Math.PI) / 180;
      const [ca, sa] = [Math.cos(a), Math.sin(a)];
      const R = Math.max(bar.radiusX, bar.radiusZ) * 1.3;
      for (let iz = Math.floor(bar.z - R + halfZ); iz <= Math.ceil(bar.z + R + halfZ); iz++)
        for (let ix = Math.floor(bar.x - R + halfX); ix <= Math.ceil(bar.x + R + halfX); ix++) {
          if (ix < 0 || iz < 0 || ix >= resX || iz >= resZ) continue;
          const i = iz * resX + ix;
          if (water[i] <= NO_WATER) continue;
          const x = ix - halfX - bar.x;
          const z = iz - halfZ - bar.z;
          const r = Math.hypot((x * ca + z * sa) / bar.radiusX, (-x * sa + z * ca) / bar.radiusZ);
          if (r <= 1.05) firmBed[i] = 1;
          const w = 1 - smoothstep(0.7, 1.15, r);
          if (w <= 0) continue;
          heights[i] = Math.max(heights[i], heights[i] + (water[i] - bar.depth - heights[i]) * w);
        }
    }
  // Rocky stretches of bed and scour holes, under water only.
  const underWater = (x: number, z: number, R: number, apply: (i: number, x: number, z: number) => void) => {
    for (let iz = Math.floor(z - R + halfZ); iz <= Math.ceil(z + R + halfZ); iz++)
      for (let ix = Math.floor(x - R + halfX); ix <= Math.ceil(x + R + halfX); ix++) {
        if (ix < 0 || iz < 0 || ix >= resX || iz >= resZ) continue;
        const i = iz * resX + ix;
        if (water[i] > NO_WATER) apply(i, ix - halfX, iz - halfZ);
      }
  };
  for (const c of creekLines) {
    for (const r of c.def.rough ?? [])
      underWater(r.x, r.z, r.radius, (i, x, z) => {
        const fade = 1 - smoothstep(r.radius * 0.7, r.radius, Math.hypot(x - r.x, z - r.z));
        heights[i] +=
          r.height * fade * (noise2.noise(x / 2.2, z / 2.2) + 0.5 * noise3.noise(x / 1.1, z / 1.1));
      });
    for (const hole of c.def.holes ?? [])
      underWater(hole.x, hole.z, hole.radius, (i, x, z) => {
        const q = Math.hypot(x - hole.x, z - hole.z) / hole.radius;
        if (q < 1) heights[i] -= hole.depth * (1 - smoothstep(0.35, 1, q));
      });
  }
  const creeks: CreekInfo[] = creekLines.map((c) => {
    const water = new Float32Array(c.poly.count);
    const halfWidth = new Float32Array(c.poly.count);
    const flow = new Float32Array(c.poly.count);
    for (let k = 0; k < c.poly.count; k++) {
      water[k] = attrAt(c.water, c.poly.u[k]);
      halfWidth[k] = attrAt(c.halfWidth, c.poly.u[k]);
      flow[k] = attrAt(c.flow, c.poly.u[k]);
    }
    return { def: c.def, poly: c.poly, water, halfWidth, flow };
  });

  yield { progress: 0.45, label: 'Grading tracks' };

  // --- Tracks ---
  const tracks: TrackInfo[] = [];
  const trackDist = new Float32Array(n).fill(1e9);
  const trackParam = new Float32Array(n);
  const trackSide = new Float32Array(n);
  const trackOwner = new Int16Array(n).fill(-1);
  const rawProfiles: Float32Array[] = [];
  const roughs: (TrackRoughness | null)[] = [];
  map.tracks.forEach((def, id) => {
    const pts2 = def.points.map((p) => [p[0], p[1]] as const);
    const poly = densify(pts2, 1);
    const raw = new Float32Array(poly.count);
    for (let k = 0; k < poly.count; k++) raw[k] = sampleH(poly.xs[k], poly.zs[k]);
    // A bridge's approaches are smoothed as if the ground ran straight across the gap.
    const spans = (def.bridges ?? []).map((b) => [b.from, b.to] as const);
    const smoothed = linearise(Float32Array.from(raw), poly, spans, 1);
    let profile = boxBlur(boxBlur(smoothed, def.smooth * 0.5), def.smooth * 0.5);
    profile = applyPins(def, poly, profile);
    profile = linearise(profile, poly, [...(def.even ?? []), ...spans]);
    // A cutting or gully floor sits below the smoothed ground.
    if (def.cut) for (let k = 0; k < poly.count; k++) profile[k] -= pairsAt(def.cut, poly.s[k]);
    if (def.rockySteps) {
      for (let k = 0; k < poly.count; k++) {
        const s = poly.s[k];
        for (const st of def.rockySteps)
          profile[k] +=
            st.rise * (smoothstep(st.at - 0.6, st.at + 0.6, s) - smoothstep(st.at + 0.6, st.at + 14, s));
      }
    }
    // A 12 m smooth fills a ~6 m creek dip. Ramp the profile to the bed at the creek's
    // bank slope so a ford is a slope into the water, not a weir the later channel skip
    // would leave standing across the road. A bridge's deck follows this profile, so leave
    // its linearized span (already a straight line between the abutments) alone: ramping it
    // would drop the boards into the creek, as the Bloomfield River bridge did after v0.88.
    for (let k = 0; k < poly.count; k++) {
      const s = poly.s[k];
      if (def.bridges?.some((b) => s >= b.from - BEARING && s <= b.to + BEARING)) continue;
      const ix = Math.round(poly.xs[k] + halfX);
      const iz = Math.round(poly.zs[k] + halfZ);
      if (ix < 0 || iz < 0 || ix >= resX || iz >= resZ) continue;
      const i = iz * resX + ix;
      if (creekOwner[i] < 0) continue;
      const cHw = creekHalfAt[i];
      if (cHw <= 0 || creekDist[i] > cHw + CREEK_BANK_RAMP) continue;
      const c = creekLines[creekOwner[i]];
      const u = atParam(c.poly.u, creekParam[i]);
      profile[k] = fordRamp(attrAt(c.water, u), cHw, creekDist[i], attrAt(c.bankSlope, u), profile[k]);
    }
    const shoulders = def.batter ? batterShoulders(def, poly, profile, sampleH) : undefined;
    tracks.push({ def, poly, profile, shoulders });
    rawProfiles.push(raw);
    roughs.push(trackRoughness(def, poly.length, map.seed * 31 + id));
    // Reach far enough out to keep black soil off the margin beside the track, too.
    const reach =
      def.width / 2 +
      Math.max(
        shoulders ? Math.max(...shoulders) : def.shoulder,
        map.blackSoil ? map.blackSoil.margin + 1.5 : 0,
      );
    stampPolyline(poly, reach, grid, trackDist, trackParam, trackSide, trackOwner, id);
  });

  // How far (dm) out from a track's edge the grading cut into or built up the ground by
  // more than BANK_CUT, plus 1 (0: not beside a track).
  const bankReach = new Uint8Array(n);
  // Potholes and washouts in the graded tracks: sample index → depth (m), and which are potholes.
  const holes = new Map<number, number>();
  const potholes = new Set<number>();
  // Ground painted over in patches, drawn with smooth edges: sample index → the patch and
  // the order it was laid in. Inside two patches the later one shows; otherwise the nearer.
  const overlays = new Map<
    number,
    {
      edge: number;
      inner: GroundTint;
      rim: GroundTint;
      rimWidth: number;
      layer: number;
      centre?: readonly [number, number];
    }
  >();
  const addPatch = (
    i: number,
    edge: number,
    inner: GroundTint,
    rim: GroundTint,
    rimWidth: number,
    layer: number,
    centre?: readonly [number, number],
  ) => {
    if (edge >= PATCH_REACH) return;
    const old = overlays.get(i);
    if (old && (old.edge <= 0 && edge <= 0 ? old.layer > layer : old.edge <= edge)) return;
    overlays.set(i, { edge, inner, rim, rimWidth, layer, centre });
  };
  for (let i = 0; i < n; i++) {
    const id = trackOwner[i];
    if (id < 0) continue;
    const t = tracks[id];
    const def = t.def;
    const d = trackDist[i];
    const p = trackParam[i];
    // Leave the wet channel as carved. The old skip of halfWidth+0.5 m kept a weir
    // the banks had raised, and the smoothed profile just outside it was a metre lower,
    // so the water's edge was a wall you could not see (the water covered the step).
    const creekHw = creekHalfAt[i];
    if (creekOwner[i] >= 0 && creekHw > 0 && creekDist[i] <= creekHw) continue;
    // So is the ground under a bridge.
    if (def.bridges && onBridge(def, atParam(t.poly.s, p))) continue;
    const hw = def.width / 2;
    const target0 = atParam(t.profile, p);
    const raw = atParam(rawProfiles[id], p);
    const h = heights[i];
    let target = target0 + def.camber * (h - raw);
    if (def.faint) target = h + (target0 - raw) * 0.35;
    // Extra lean raises the right side (trackSide is + on the left).
    if (def.cant)
      target -= trackSide[i] * Math.tan((pairsAt(def.cant, atParam(t.poly.s, p)) * Math.PI) / 180);
    // Slight crown between the wheel lines reads as worn ruts.
    const lat = Math.abs(trackSide[i]);
    if (def.ruts > 0 && lat < hw) target += def.ruts * (1 - Math.min(1, Math.abs(lat - 0.75) / 0.75));
    const rough = roughs[id];
    if (rough) {
      const s = atParam(t.poly.s, p);
      target += roughOffset(
        rough,
        roughNoise,
        (i % resX) - halfX,
        Math.floor(i / resX) - halfZ,
        s,
        trackSide[i],
      );
      const hole = d <= hw ? roughHole(rough, s, trackSide[i]) : null;
      if (hole) {
        holes.set(i, hole.depth);
        if (hole.kind === 'pothole') potholes.add(i);
      }
      // Potholes and washouts hold dark mud or show the earth they cut into; those deep
      // enough to pinch a tyre are darker still, ringed with pale gravel. Their paint
      // stops a little past the track's edge.
      const patch =
        def.surface !== 'concrete' && d < hw + 0.5 + PATCH_REACH
          ? roughPatch(rough, s, trackSide[i], PATCH_REACH)
          : null;
      if (patch) {
        const inner = patch.rim
          ? GroundTint.Pothole
          : patch.kind === 'pothole'
            ? GroundTint.Mud
            : GroundTint.DirtEdge;
        const rim = patch.rim ? GroundTint.Gravel : inner;
        if (patch.centre) {
          // A pothole is round: turn its centre from along and across the track to east and south.
          const k = Math.min(t.poly.count - 2, Math.floor(p));
          const tx = t.poly.xs[k + 1] - t.poly.xs[k];
          const tz = t.poly.zs[k + 1] - t.poly.zs[k];
          const len = Math.hypot(tx, tz) || 1;
          const [along, left] = patch.centre;
          const centre = [(along * tx - left * tz) / len, (along * tz + left * tx) / len] as const;
          addPatch(i, patch.edge, inner, rim, patch.rim, 0, centre);
        } else addPatch(i, Math.max(patch.edge, d - hw - 0.5), inner, rim, patch.rim, 0);
      }
    }
    // Cut a visible bank through a perched weir, or fill a hollow up to the bed, at the
    // creek's bank slope, so the centre line (and both wheel tracks) ramp into the water.
    if (creekOwner[i] >= 0 && creekHw > 0 && creekDist[i] < creekHw + CREEK_BANK_RAMP) {
      const c = creekLines[creekOwner[i]];
      const u = atParam(c.poly.u, creekParam[i]);
      target = fordRamp(attrAt(c.water, u), creekHw, creekDist[i], attrAt(c.bankSlope, u), target);
      target += bankRoughness(
        c.def.bankRough ?? BANK_ROUGH,
        creekDist[i] - creekHw,
        trackSide[i],
        creekOwner[i],
        roughNoise.fbm(((i % resX) - halfX) / 1.4, (Math.floor(i / resX) - halfZ) / 1.4, 2),
      );
    }
    const w = d <= hw ? 1 : 1 - smoothstep(hw, hw + shoulderAt(t, p), d);
    heights[i] = h + (target - h) * w;
    // The cut fades out across the shoulder: find where it falls to BANK_CUT.
    const cut = Math.abs(target - h);
    const reachOut = cut > BANK_CUT ? shoulderAt(t, p) * inverseSmoothstep(1 - BANK_CUT / cut) : 0;
    bankReach[i] = 1 + Math.min(254, Math.round(reachOut * 10));
  }

  // Staircase ledges: granite steps across the track (static boxes). Each leans with the
  // graded track across it and reaches below the ground under its whole footprint, so an
  // end over a falling hillside juts out of the slope instead of floating above it.
  const boxes: StaticBox[] = [];
  for (const t of tracks) {
    for (const st of t.def.steps ?? []) {
      for (let s = st.from; s <= st.to; s += st.spacing) {
        const k = Math.min(t.poly.count - 2, Math.round(s));
        const dx = t.poly.xs[k + 1] - t.poly.xs[k];
        const dz = t.poly.zs[k + 1] - t.poly.zs[k];
        const len = Math.hypot(dx, dz) || 1;
        const [ux, uz] = [dx / len, dz / len];
        const grade = Math.max(0.12, (t.profile[Math.min(t.poly.count - 1, k + 3)] - t.profile[k]) / 3);
        const depthAlong = clamp(st.rise / grade, 0.5, 2.4);
        const yTop = t.profile[k] + st.rise;
        const hx = t.def.width / 2 + 0.9;
        const hz = depthAlong / 2;
        // Box centred half its length uphill of the step face; local +x is (uz, -ux).
        const cx = t.poly.xs[k] + ux * hz;
        const cz = t.poly.zs[k] + uz * hz;
        const edge = t.def.width / 2;
        const roll = Math.atan2(
          sampleH(cx + uz * edge, cz - ux * edge) - sampleH(cx - uz * edge, cz + ux * edge),
          2 * edge,
        );
        const [cr, sr] = [Math.cos(roll), Math.sin(roll)];
        let hy = (st.rise + 0.8) / 2;
        for (let u = -hx; u <= hx + 1e-6; u += hx / 8)
          for (let w = -hz; w <= hz + 1e-6; w += hz / 2) {
            // Bottom point across from the top centre (the box centre sits hy·sin(roll) out).
            const across = u * cr + 2 * hy * sr;
            const ground = sampleH(cx + uz * across + ux * w, cz - ux * across + uz * w);
            hy = Math.max(hy, (yTop + u * sr - ground + 0.15) / (2 * cr));
          }
        boxes.push({
          kind: 'ledge',
          x: cx + uz * hy * sr,
          y: yTop - hy * cr,
          z: cz - ux * hy * sr,
          hx,
          hy,
          hz,
          yaw: Math.atan2(dx, dz),
          roll,
        });
      }
    }
  }

  yield { progress: 0.58, label: 'Washouts and bogs' };

  // --- Bogs, and the mud holes in rough tracks ---
  const mudHoles = tracks.flatMap((t, id) =>
    trackMudHoles(t, map.seed * 53 + id, sampleH, (x, z, s) => {
      const i = Math.round(z + halfZ) * resX + Math.round(x + halfX);
      return (
        creekDist[i] - creekHalfAt[i] < 15 || [s - 7, s, s + 7].some((q) => onBridge(t.def, q) !== undefined)
      );
    }),
  );
  const bogMask = new Uint8Array(n);
  // Where hollows overlap (a long boggy stretch) the ground sinks to the deepest of them.
  const bogDip = new Map<number, number>();
  for (const b of [...map.bogs, ...mudHoles]) {
    const a = (b.rotationDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const creekBog = b.id.includes('-creek-');
    const R = Math.max(b.radiusX, b.radiusZ) * 1.6 + PATCH_REACH;
    for (let iz = Math.floor(b.z - R + halfZ); iz <= Math.ceil(b.z + R + halfZ); iz++)
      for (let ix = Math.floor(b.x - R + halfX); ix <= Math.ceil(b.x + R + halfX); ix++) {
        if (ix < 0 || iz < 0 || ix >= resX || iz >= resZ) continue;
        const x = ix - halfX - b.x;
        const z = iz - halfZ - b.z;
        const rx = (x * c + z * s) / b.radiusX;
        const rz = (-x * s + z * c) / b.radiusZ;
        const r = Math.sqrt(rx * rx + rz * rz) + noise3.noise((ix - halfX) / 4, (iz - halfZ) / 4) * 0.18;
        const i = iz * resX + ix;
        addPatch(
          i,
          (r - 1.12) * Math.min(b.radiusX, b.radiusZ),
          creekBog ? GroundTint.BlackSoil : GroundTint.Mud,
          creekBog ? GroundTint.Pothole : GroundTint.Mud,
          creekBog ? 0.55 : 0,
          1,
        );
        if (r > 1.5) continue;
        let dip =
          b.depth * (1 - smoothstep(0.35, 1.05, r)) -
          (creekBog ? 0.11 : 0.06) * noise2.noise((ix - halfX) / 1.7, (iz - halfZ) / 1.7) * (r < 1 ? 1 : 0);
        // Wheel ruts down a creek-bank bog, so it reads as used wet mud rather than a smooth dish.
        if (creekBog && r < 1) {
          const lateral = Math.abs(rx * b.radiusX);
          const rut = 1 - smoothstep(0.35, 0.95, Math.abs(lateral - 0.75));
          dip += 0.08 * rut * (1 - smoothstep(0.4, 1, r));
        }
        bogDip.set(i, Math.max(bogDip.get(i) ?? -Infinity, dip));
        if (r < 1.12) bogMask[i] = Math.max(bogMask[i], b.deep ? 2 : 1);
      }
  }
  for (const [i, dip] of bogDip) heights[i] -= dip;

  // --- Washout gullies: trench in the heightfield plus vertical lips as static boxes ---
  const gullies: GullyInfo[] = [];
  const gullyMask = new Uint8Array(n);
  for (const g of map.gullies) {
    const a = (g.headingDeg * Math.PI) / 180;
    const dirX = Math.sin(a);
    const dirZ = -Math.cos(a);
    // Earth walls either side of the gap. They're wide so they cover every heightfield
    // triangle the trench carving touches (samples are 1 m apart).
    const lipW = 2.2;
    const trenchHalf = g.gap / 2 + 0.65;
    const rampOut = trenchHalf + 0.5;
    const L = g.length / 2;
    const R = L + rampOut + 2;
    // Record the ground height along the lips before carving.
    const segLen = 3;
    const nSeg = Math.ceil(g.length / segLen);
    // Each wall's top follows the ground across the gully: [inner edge, outer edge] heights.
    const lipTop: [number, number][][] = [];
    for (let k = 0; k < nSeg; k++) {
      const along = -L + (k + 0.5) * (g.length / nSeg);
      const tops: [number, number][] = [];
      for (const sgn of [-1, 1]) {
        const at = (off: number) =>
          sampleH(g.x + dirX * along - dirZ * off * sgn, g.z + dirZ * along + dirX * off * sgn);
        tops.push([at(g.gap / 2), at(g.gap / 2 + lipW)]);
      }
      lipTop.push(tops);
    }
    const centreH = sampleH(g.x, g.z);
    for (let iz = Math.floor(g.z - R + halfZ); iz <= Math.ceil(g.z + R + halfZ); iz++)
      for (let ix = Math.floor(g.x - R + halfX); ix <= Math.ceil(g.x + R + halfX); ix++) {
        if (ix < 0 || iz < 0 || ix >= resX || iz >= resZ) continue;
        const x = ix - halfX - g.x;
        const z = iz - halfZ - g.z;
        const along = x * dirX + z * dirZ;
        const lat = Math.abs(-x * dirZ + z * dirX);
        const endFade = smoothstep(L + 1.5, L - 3, Math.abs(along));
        const i = iz * resX + ix;
        const edge = Math.max(lat - rampOut, Math.abs(along) - L - 1.5);
        addPatch(i, edge, GroundTint.DirtEdge, GroundTint.DirtEdge, 0, 2);
        if (endFade <= 0 || lat > rampOut) continue;
        const depth = g.depth * endFade;
        const carve = lat <= trenchHalf ? depth : depth * (1 - (lat - trenchHalf) / (rampOut - trenchHalf));
        heights[i] -= carve;
        if (lat <= rampOut) gullyMask[i] = 1;
      }
    for (let k = 0; k < nSeg; k++) {
      const along = -L + (k + 0.5) * (g.length / nSeg);
      const endFade = smoothstep(L + 1.5, L - 3, Math.abs(along) + segLen / 2);
      if (endFade < 0.98) continue;
      for (let si = 0; si < 2; si++) {
        const sgn = si === 0 ? -1 : 1;
        const off = sgn * (g.gap / 2 + lipW * 0.5);
        const [inner, outer] = lipTop[k][si];
        const top = (inner + outer) / 2;
        const bottom = Math.min(inner, outer) - g.depth - 0.6;
        // Box local +x points to the side the wall is on (sgn), so roll tilts the top
        // from the inner edge height to the outer edge height.
        const yaw = Math.atan2(dirX, dirZ);
        boxes.push({
          kind: 'gullyLip',
          x: g.x + dirX * along - dirZ * off,
          y: top - (top - bottom) / 2,
          z: g.z + dirZ * along + dirX * off,
          hx: lipW / 2,
          hy: (top - bottom) / 2,
          hz: g.length / nSeg / 2,
          yaw,
          roll: Math.atan2(outer - inner, lipW) * -sgn,
        });
      }
    }
    gullies.push({ def: g, dirX, dirZ, bottom: centreH - g.depth });
  }

  yield { progress: 0.68, label: 'Laying surfaces' };

  // Black soil off the tracks, away from camps and on gentle ground only.
  const soil = map.blackSoil;
  const blackSoilAt = (i: number, x: number, z: number, slope: number, nz: number): boolean => {
    if (!soil || slope > soil.maxSlopeDeg + nz * 2) return false;
    const id = trackOwner[i];
    if (id >= 0 && trackDist[i] - tracks[id].def.width / 2 < soil.margin + (1 + nz) * 0.75) return false;
    if (flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.radius + f.blend)) return false;
    return noise3.noise(x / 90 + 17.3, z / 90) < soil.firmAbove;
  };

  // --- Surfaces and tints ---
  const edgeTint = map.muddyEdges ? GroundTint.Mud : GroundTint.DirtEdge;
  const clayBanks = new Map<number, number>();
  for (let iz = 2; iz < resZ - 2; iz++) {
    for (let ix = 2; ix < resX - 2; ix++) {
      const i = iz * resX + ix;
      // Wide stencil so small bumps don't speckle the slope classes.
      const gx = (heights[i + 2] - heights[i - 2]) * 0.25;
      const gz = (heights[i + 2 * resX] - heights[i - 2 * resX]) * 0.25;
      const slope = Math.atan(Math.sqrt(gx * gx + gz * gz)) * (180 / Math.PI);
      const x = ix - halfX;
      const z = iz - halfZ;
      const nz = noise2.noise(x / 16, z / 16);
      // Border mountains: steep but forested so the map edge reads as closed scrub.
      const edge = edgeIn(x, z);
      if (edge < border.width && slope < 52 + nz * 6) {
        surface[i] = slope > 32 ? SurfaceId.Gravel : SurfaceId.Grass;
        tint[i] = !border.forested && nz > 0.45 && slope > 36 ? GroundTint.Scree : GroundTint.ForestFloor;
        continue;
      }
      if (slope > 39 + nz * 4) {
        surface[i] = SurfaceId.Rock;
        tint[i] = nz > 0.1 ? GroundTint.Rock : GroundTint.Scree;
      } else if (slope > 31.5 + nz * 5) {
        surface[i] = SurfaceId.Gravel;
        tint[i] = GroundTint.Scree;
      } else if (blackSoilAt(i, x, z, slope, nz)) {
        surface[i] = SurfaceId.BlackSoil;
        tint[i] = GroundTint.BlackSoil;
      } else {
        surface[i] = SurfaceId.Grass;
        const wet = creekDist[i] - creekHalfAt[i];
        tint[i] = creekDist[i] < 1e8 && wet < 14 + nz * 6 ? GroundTint.GrassSage : GroundTint.GrassDry;
      }
      // Cuttings and fill beside a track on a clay map are bare, boggy clay, not scree: where the
      // grading moved the ground more than BANK_CUT (judged by that rather than by slope
      // alone, which the bumps along a rough road would swing to and fro, striping the
      // banks) on a slope. Kept for drawing as the distance (m) out from the bank's outer
      // edge, a metre more for each 10° too gentle: a plain distance from the track, so
      // the edge is drawn smooth however narrow the bank. The track paint covers it on the
      // track, except on a track with no paint.
      if (map.clayBanks && bankReach[i]) {
        const def = tracks[trackOwner[i]].def;
        const hw = def.width / 2;
        const d = trackDist[i];
        let bank = d - hw - (bankReach[i] - 1) / 10 + Math.max(0, (12 + nz * 3 - slope) / 10);
        if (def.surface === 'rock' || def.surface === 'sand') bank = Math.max(bank, hw - d);
        if (bank < PATCH_REACH) clayBanks.set(i, packBank(bank, tint[i] as GroundTint));
        if (bank <= 0 && d > hw) {
          surface[i] = map.muddyEdges ? SurfaceId.Mud : SurfaceId.Dirt;
          tint[i] = edgeTint;
        }
      }
    }
  }

  for (const p of map.patches) {
    const R = p.radius * 1.3;
    const kind = p.kind;
    const sid =
      kind === 'rock'
        ? SurfaceId.Rock
        : kind === 'gravel'
          ? SurfaceId.Gravel
          : kind === 'mud'
            ? SurfaceId.Mud
            : kind === 'dirt'
              ? SurfaceId.Dirt
              : kind === 'sand'
                ? SurfaceId.Sand
                : SurfaceId.Grass;
    for (let iz = Math.floor(p.z - R + halfZ); iz <= Math.ceil(p.z + R + halfZ); iz++)
      for (let ix = Math.floor(p.x - R + halfX); ix <= Math.ceil(p.x + R + halfX); ix++) {
        if (ix < 0 || iz < 0 || ix >= resX || iz >= resZ) continue;
        const x = ix - halfX;
        const z = iz - halfZ;
        const r =
          Math.hypot(x - p.x, z - p.z) / p.radius + (p.ragged ?? 0) * noise3.noise(x / 6, z / 6) * 0.5;
        if (r > 1) continue;
        const i = iz * resX + ix;
        surface[i] = sid;
        if (kind === 'rock')
          tint[i] = noise2.noise(x / 6, z / 6) > -0.25 ? GroundTint.Rock : GroundTint.Scree;
        else if (kind === 'gravel') tint[i] = GroundTint.Gravel;
        else if (kind === 'dirt') tint[i] = GroundTint.DirtTrack;
        else if (kind === 'mud') tint[i] = GroundTint.Mud;
        else if (kind === 'sand') tint[i] = GroundTint.Sand;
      }
  }

  const trackDistance = new Uint8Array(n).fill(255);
  const paintEdge = new Int8Array(n).fill(NO_TRACK_EDGE);
  const paintOffset = new Int8Array(n);
  const paint = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const id = trackOwner[i];
    if (id < 0) continue;
    const def = tracks[id].def;
    const hw = def.width / 2;
    const d = trackDist[i];
    trackDistance[i] = Math.min(255, Math.max(0, Math.round(d - hw)));
    const kind = def.faint
      ? TrackPaintKind.Faint
      : def.surface === 'gravel' && !inStretch(def.clay, tracks[id].poly.s, trackParam[i])
        ? TrackPaintKind.Gravel
        : def.surface === 'concrete'
          ? TrackPaintKind.Concrete
          : def.surface === 'rock' || def.surface === 'sand'
            ? TrackPaintKind.None
            : TrackPaintKind.Dirt;
    const bank = clayBanks.get(i);
    // A clay bank is drawn out from the track's edge, so its samples keep that too.
    if ((kind && d - hw < 2) || bank !== undefined) {
      paintEdge[i] = Math.max(-127, Math.min(127, Math.round((d - hw) * 10)));
      paintOffset[i] = Math.max(-127, Math.min(127, Math.round(trackSide[i] * 10)));
    }
    if (kind && d - hw < 2) {
      // The ground beside the track, as it would be without a clay bank (drawn separately).
      paint[i] = kind | ((bank === undefined ? tint[i] : bank >> 8) << 3);
    }
    if (d > hw + 0.6) continue;
    if (def.faint) {
      if (d <= hw) {
        surface[i] = SurfaceId.Dirt;
        tint[i] = GroundTint.FaintTrack;
      }
      continue;
    }
    const sid =
      def.surface === 'gravel'
        ? SurfaceId.Gravel
        : def.surface === 'rock' || def.surface === 'concrete'
          ? SurfaceId.Rock
          : def.surface === 'clay'
            ? SurfaceId.Clay
            : def.surface === 'sand'
              ? SurfaceId.Sand
              : SurfaceId.Dirt;
    surface[i] = sid;
    // A dry creek bed the track runs through is soft sand, banks and all.
    if (def.sand) {
      const along = atParam(tracks[id].poly.s, trackParam[i]);
      if (def.sand.some(([from, to]) => along >= from && along <= to)) {
        surface[i] = SurfaceId.Sand;
        tint[i] = GroundTint.Sand;
        paint[i] = 0;
        continue;
      }
    }
    // A steep pinch the gravel has washed off is bare red clay.
    if (def.surface === 'gravel' && inStretch(def.clay, tracks[id].poly.s, trackParam[i])) {
      surface[i] = SurfaceId.Clay;
      tint[i] = d > hw - MUD_EDGE ? edgeTint : GroundTint.DirtTrack;
      continue;
    }
    if (def.surface === 'concrete') tint[i] = d > hw - 0.3 ? GroundTint.DirtEdge : GroundTint.Concrete;
    else if (def.surface === 'rock') {
      const x = (i % resX) - halfX;
      const z = Math.floor(i / resX) - halfZ;
      tint[i] = noise2.noise(x / 5, z / 5) > -0.15 ? GroundTint.Rock : GroundTint.Scree;
    } else if (def.surface === 'sand') tint[i] = GroundTint.Sand;
    else if (d > hw - MUD_EDGE) {
      // Water runs off the crown and lies along the edges, so after rain they are boggy mud.
      if (map.muddyEdges) surface[i] = SurfaceId.Mud;
      tint[i] = edgeTint;
    } else tint[i] = def.surface === 'gravel' ? GroundTint.Gravel : GroundTint.DirtTrack;
  }
  // Rocky steps show as rock, and so does the road under a band of bedrock: a ridge stone
  // is rock coming up through the track, unlike a boulder sitting loose beside it.
  for (const t of tracks) {
    const rockAt = [
      ...(t.def.rockySteps ?? []).map((st) => st.at),
      ...(t.def.stones ?? []).filter((st) => st.shape === 'ridge').map((st) => st.at),
    ];
    for (const at of rockAt) {
      const k = Math.min(t.poly.count - 1, Math.round(at));
      const cx = t.poly.xs[k];
      const cz = t.poly.zs[k];
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dz * dz > 9) continue;
          const i = (Math.round(cz + halfZ) + dz) * resX + Math.round(cx + halfX) + dx;
          surface[i] = SurfaceId.Rock;
          tint[i] = (dx + dz) & 1 ? GroundTint.Rock : GroundTint.Scree;
        }
    }
  }

  for (let i = 0; i < n; i++) {
    if (bogMask[i]) {
      // A deep bog's floor is sticky black soil.
      surface[i] = bogMask[i] === 2 ? SurfaceId.BlackSoil : SurfaceId.Mud;
    }
    if (gullyMask[i] && surface[i] !== SurfaceId.Mud) surface[i] = SurfaceId.Dirt;
  }

  const creekDistance = new Uint8Array(n).fill(255);
  // Where the nearest creek is drawn as clear water (only when a creek asks for it).
  const creekClear = creekLines.some((c) => c.def.clear) ? new Uint8Array(n) : undefined;
  for (let i = 0; i < n; i++) {
    const d = creekDist[i];
    if (d > 40) continue;
    const hw = creekHalfAt[i];
    creekDistance[i] = Math.min(255, Math.max(0, Math.round(d - hw)));
    const c = creekLines[creekOwner[i]];
    if (creekClear && c.def.clear) creekClear[i] = 1;
    const u = atParam(c.poly.u, creekParam[i]);
    const gravel = attrAt(c.gravel, u) > 0.5;
    // A sandy river's dry bed runs out either side of the water to its banks.
    const sand = attrAt(c.sand, u) > 0.5;
    const bank = hw + 1.6 + (sand ? (c.def.sandBank ?? 0) : 0);
    const wet = water[i] > NO_WATER;
    // A soft bed is firm on the creek's bars and where a track fords it (driven and packed).
    const forded = trackOwner[i] >= 0 && trackDist[i] <= tracks[trackOwner[i]].def.width / 2 + 0.5;
    if (wet) surface[i] = c.def.softBed && !firmBed[i] && !forded ? SurfaceId.SoftBed : SurfaceId.Water;
    else if (d <= bank) surface[i] = sand ? SurfaceId.Sand : gravel ? SurfaceId.Gravel : SurfaceId.Mud;
    // In clear water a bar's top is pale gravel, washed clean, and shows through the shallows.
    const paleBar = wet && !!c.def.clear && firmBed[i] === 1;
    const look = wet
      ? sand || paleBar
        ? GroundTint.Sand
        : gravel
          ? GroundTint.Gravel
          : GroundTint.CreekBed
      : sand
        ? GroundTint.Sand
        : gravel
          ? GroundTint.Gravel
          : GroundTint.Mud;
    addPatch(i, wet ? Math.min(d - bank, -0.1) : d - bank, look, look, 0, 3);
  }

  yield { progress: 0.8, label: 'Terrain ready' };

  // Keep smooth edges only where nothing painted over the track or the ground beside it.
  for (let i = 0; i < n; i++) {
    const p = paint[i];
    if (!p) continue;
    const t = tint[i];
    if (t !== p >> 3 && t !== edgeTint && t !== GroundTint.DirtEdge && t !== trackTint(p & 7)) paint[i] = 0;
  }
  // Patches are drawn over the track paint; the tint grid takes them at each sample.
  const packedOverlays = new Map<number, number>();
  for (const [i, p] of overlays) {
    const patch = { ...p, under: tint[i] as GroundTint };
    tint[i] = patchTint(patch);
    packedOverlays.set(i, packPatch(patch));
  }

  const terrain = new Terrain(map.width, map.length, heights, surface, tint, water);
  terrain.holes = holes;
  terrain.trackPaint = { edge: paintEdge, paint, offset: paintOffset };
  terrain.groundPatches = packedOverlays;
  terrain.clayBanks = clayBanks;
  terrain.muddyEdges = !!map.muddyEdges;
  // Fine ruts and drainage humps over the finished 1 m ground.
  const patches: DetailPatch[] = [];
  for (const t of tracks) {
    const patch = buildDetailPatch(t, halfX, halfZ, (x, z) => terrain.heightAt(x, z));
    if (patch) patches.push(patch);
  }
  terrain.setDetail(patches);
  return {
    terrain,
    features: {
      tracks,
      creeks,
      boxes,
      rocks: [],
      logs: [],
      timbers: [],
      gates: [],
      gullies,
      trackDistance,
      creekDistance,
      ...(creekClear ? { creekClear } : {}),
      mudHoles,
    },
  };
}

/**
 * Height of a ford at distance `d` out from the creek's wet channel: the bed at the water's
 * edge (the water level, where the carved channel comes up to meet the bank), then a bank
 * rising at `bankSlope`. A road above that bank is cut down to it; one below the creek's
 * own bank fill (the `lower` line of the carving, never under the water) is filled up to
 * that. Either way the ground meets the water's edge at the bed, with no step.
 *
 * v0.88 measured the ramp from the centre-line bed (water − depth), so just outside the
 * water the road was cut a creek's depth below the edge of the channel: a trench at the
 * water's edge, under water, a wheel dropped into on every ford (0.9 m at the Daintree).
 */
function fordRamp(water: number, halfWidth: number, d: number, bankSlope: number, road: number): number {
  const out = Math.max(0, d - halfWidth);
  const rise = out * bankSlope;
  // The fill fades out over the outer three quarters of the ramp, so a road that comes in
  // below the water level (the Bloomfield Track at the Little Annan runs 2 m under it 10 m
  // out) climbs onto the bank instead of meeting a wall at the ramp's edge.
  const bank = water + Math.min(CREEK_BANK_FILL, rise * 0.9);
  const fill = road + (bank - road) * (1 - smoothstep(CREEK_BANK_RAMP * 0.25, CREEK_BANK_RAMP, out));
  return Math.min(Math.max(road, fill), water + rise);
}

/** How rough a road's banks are at a ford, by default (m); see `CreekDef.bankRough`. */
const BANK_ROUGH = 0.22;

/**
 * Roughness on a ford's bank, `out` metres from the water's edge and `lat` metres from the
 * track's centreline (+ left): the water running off the road scours a rut under one wheel
 * line, then the other, so a vehicle lurches from side to side on the way in and out, and
 * rocks (`rock`, noise in −1..1) stand out of the bank. It fades in over the first two
 * metres from the water, so the water's edge itself stays a slope with no hidden step, and
 * out again at the top of the ramp.
 */
function bankRoughness(amp: number, out: number, lat: number, crossing: number, rock: number): number {
  if (amp <= 0 || out <= 0) return 0;
  const fade = smoothstep(0.3, 2.2, out) * (1 - smoothstep(CREEK_BANK_RAMP - 2.5, CREEK_BANK_RAMP, out));
  if (fade <= 0) return 0;
  // The rut swaps wheel lines every three metres or so, starting on a side set by the crossing.
  const side = Math.sin(out * 1.1 + crossing * 2.3) >= 0 ? 1 : -1;
  const rut = Math.max(0, 1 - Math.abs(lat - side * 0.8) / 0.75);
  return amp * fade * (0.7 * rock - rut);
}

/** Linear interpolation through [distance, value] pairs, holding the end values. */
function pairsAt(pairs: ReadonlyArray<readonly [number, number]>, s: number): number {
  if (s <= pairs[0][0]) return pairs[0][1];
  for (let i = 0; i + 1 < pairs.length; i++) {
    const [s0, v0] = pairs[i],
      [s1, v1] = pairs[i + 1];
    if (s <= s1) return v0 + ((v1 - v0) * (s - s0)) / Math.max(1e-6, s1 - s0);
  }
  return pairs[pairs.length - 1][1];
}

/**
 * Replace the profile between each [from, to] distance (widened by `margin` metres) with
 * a straight line between its values there.
 */
function linearise(
  profile: Float32Array,
  poly: DensePolyline,
  ranges: ReadonlyArray<readonly [number, number]>,
  margin = 0,
): Float32Array {
  const at = (s: number) => {
    const { i, f } = locate(poly, s);
    return profile[i] + (profile[Math.min(poly.count - 1, i + 1)] - profile[i]) * f;
  };
  for (const [from, to] of ranges) {
    const a = from - margin,
      b = to + margin;
    const ya = at(a),
      yb = at(b);
    for (let k = 0; k < poly.count; k++)
      if (poly.s[k] > a && poly.s[k] < b) profile[k] = ya + ((yb - ya) * (poly.s[k] - a)) / (b - a);
  }
  return profile;
}

/** Apply pinned heights (third value on track control points). */
function applyPins(def: TrackDef, poly: DensePolyline, profile: Float32Array): Float32Array {
  const pins: { k: number; y: number }[] = [];
  def.points.forEach((p, idx) => {
    if (p.length === 3) {
      let best = 0;
      for (let k = 0; k < poly.count; k++)
        if (Math.abs(poly.u[k] - idx) < Math.abs(poly.u[best] - idx)) best = k;
      pins.push({ k: best, y: p[2] as number });
    }
  });
  if (pins.length === 0) return profile;
  const out = Float32Array.from(profile);
  const follow = def.pinMode === 'follow';
  // Following the ground, the shift that meets the first and last pins fades out beyond them.
  if (follow) {
    const first = pins[0];
    const last = pins[pins.length - 1];
    const fade = (k: number, pin: { k: number }) =>
      1 - smoothstep(0, PIN_FADE, Math.abs(poly.s[k] - poly.s[pin.k]));
    for (let k = 0; k <= first.k; k++) out[k] += (first.y - profile[first.k]) * fade(k, first);
    for (let k = Math.max(first.k + 1, last.k); k < poly.count; k++)
      out[k] += (last.y - profile[last.k]) * fade(k, last);
  }
  for (let j = 0; j < pins.length - 1; j++) {
    const a = pins[j];
    const b = pins[j + 1];
    for (let k = a.k; k <= b.k; k++) {
      const t = (poly.s[k] - poly.s[a.k]) / Math.max(1e-6, poly.s[b.k] - poly.s[a.k]);
      out[k] = follow
        ? profile[k] + (a.y - profile[a.k]) * (1 - t) + (b.y - profile[b.k]) * t
        : a.y + (b.y - a.y) * t;
    }
  }
  if (!def.pinSmooth) return out;
  // Round the grade changes, then put the end pins back exactly (junctions must agree).
  const rounded = boxBlur(boxBlur(out, def.pinSmooth * 0.5), def.pinSmooth * 0.5);
  const ends = [pins[0], pins[pins.length - 1]];
  for (let k = 0; k < poly.count; k++) {
    const fade = (e: { k: number }) =>
      1 - smoothstep(0, def.pinSmooth ?? 1, Math.abs(poly.s[k] - poly.s[e.k]));
    const w = Math.max(fade(ends[0]), fade(ends[1]));
    rounded[k] += (out[k] - rounded[k]) * w;
  }
  return rounded;
}

/** Run all generation steps synchronously. */
export function generateTerrain(map: MapDef): GeneratedTerrain {
  const gen = generateTerrainSteps(map);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
