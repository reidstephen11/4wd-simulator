import { SurfaceId } from '../../data/surfaces';
import type { FlatDef, MapDef, ScarpDef, HillDef, TrackDef } from './mapTypes';
import { Noise2D, clamp, smoothstep } from './noise';
import { attrAt, densify, locate, type DensePolyline } from './polyline';
import { GroundTint, NO_WATER, Terrain } from './terrain';
import type { CreekInfo, GullyInfo, StaticBox, TerrainFeatures, TrackInfo } from './features';
import { buildDetailPatch, type DetailPatch } from './detail';
import { onBridge } from './bridges';

/** Macro relief is evaluated on a coarser grid and upsampled. */
const MACRO_STEP = 2;
/** Distance from the creek centreline over which the banks are carved. */
const CREEK_BANK_REACH = 34;
/** Steepest rise (height per metre) of the valley sides beyond the carved banks. */
const CREEK_WALL_SLOPE = 1.5;

interface Grid {
  res: number;
  step: number;
  origin: number;
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
  const { res, step, origin } = grid;
  for (let k = 0; k < poly.count - 1; k++) {
    const ax = poly.xs[k];
    const az = poly.zs[k];
    const bx = poly.xs[k + 1];
    const bz = poly.zs[k + 1];
    const minX = Math.max(0, Math.floor((Math.min(ax, bx) - radius - origin) / step));
    const maxX = Math.min(res - 1, Math.ceil((Math.max(ax, bx) + radius - origin) / step));
    const minZ = Math.max(0, Math.floor((Math.min(az, bz) - radius - origin) / step));
    const maxZ = Math.min(res - 1, Math.ceil((Math.max(az, bz) + radius - origin) / step));
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const invLen = len2 > 0 ? 1 / Math.sqrt(len2) : 0;
    for (let iz = minZ; iz <= maxZ; iz++) {
      const pz = origin + iz * step;
      for (let ix = minX; ix <= maxX; ix++) {
        const px = origin + ix * step;
        const wx = px - ax;
        const wz = pz - az;
        let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + vx * t - px;
        const cz = az + vz * t - pz;
        const d = Math.sqrt(cx * cx + cz * cz);
        if (d > radius) continue;
        const i = iz * res + ix;
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

function hillValue(h: HillDef, x: number, z: number): number {
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

function bilinear(src: Float32Array, res: number, fx: number, fz: number): number {
  const ix = Math.min(res - 2, Math.max(0, Math.floor(fx)));
  const iz = Math.min(res - 2, Math.max(0, Math.floor(fz)));
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * res + ix;
  const a = src[i] + (src[i + 1] - src[i]) * tx;
  const b = src[i + res] + (src[i + res + 1] - src[i + res]) * tx;
  return a + (b - a) * tz;
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
  const size = map.size;
  const half = size / 2;
  const res = size + 1;
  const n = res * res;
  const noise = new Noise2D(map.seed);
  const noise2 = new Noise2D(map.seed + 101);
  const noise3 = new Noise2D(map.seed + 202);

  // --- Creek centreline (needed early to calm the noise near water) ---
  const creekPts = map.creek.points.map((p) => [p.x, p.z] as const);
  const creekPoly = densify(creekPts, 1);
  const creekU = (p: number) => atParam(creekPoly.u, p);
  const creekCols = {
    water: map.creek.points.map((p) => p.water),
    halfWidth: map.creek.points.map((p) => p.halfWidth),
    depth: map.creek.points.map((p) => p.depth),
  };
  const creekAttr = (key: keyof typeof creekCols, u: number) => attrAt(creekCols[key], u);
  const creekBankSlope = map.creek.points.map((p) => p.bankSlope ?? 0.55);
  const creekGravel = map.creek.points.map((p) => (p.bed === 'gravel' ? 1 : 0));

  yield { progress: 0.02, label: 'Shaping hills' };

  // --- Macro relief on a coarse grid ---
  const mres = size / MACRO_STEP + 1;
  const mgrid: Grid = { res: mres, step: MACRO_STEP, origin: -half };
  const macro = new Float32Array(mres * mres);
  const mCreekDist = new Float32Array(mres * mres).fill(1e9);
  const mCreekParam = new Float32Array(mres * mres);
  stampPolyline(creekPoly, map.noise.creekCalm, mgrid, mCreekDist, mCreekParam);

  const ridgeDist = new Float32Array(mres * mres);
  const ridgeParam = new Float32Array(mres * mres);
  const ridgeAdd = new Float32Array(mres * mres);
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
  for (let iz = 0; iz < mres; iz++) {
    const z = -half + iz * MACRO_STEP;
    for (let ix = 0; ix < mres; ix++) {
      const x = -half + ix * MACRO_STEP;
      const i = iz * mres + ix;
      let h = floorAt(map.floor, x);
      const calm = 0.22 + 0.78 * smoothstep(8, map.noise.creekCalm, mCreekDist[i]);
      h +=
        calm *
        (map.noise.macroAmplitude * noise.fbm(x / map.noise.macroScale, z / map.noise.macroScale, 3) +
          map.noise.midAmplitude * noise2.fbm(x / map.noise.midScale, z / map.noise.midScale, 2));
      for (const s of map.scarps) h += scarpValue(s, x, z, noise3);
      for (const hill of map.hills) h += hillValue(hill, x, z);
      h += ridgeAdd[i];
      // Border mountains close off the map edge.
      const e = half - Math.max(Math.abs(x), Math.abs(z)) + noise3.fbm(x / 160, z / 160, 2) * 40;
      let b = smoothstep(border.width, 0, e);
      if (b > 0) {
        for (const g of border.gaps) {
          const gd = Math.hypot(x - g.x, z - g.z);
          b *= smoothstep(g.radius * 0.4, g.radius * 2.6, gd);
        }
        h +=
          b *
          border.height *
          (0.75 + 0.35 * noise3.fbm(x / 240, z / 240, 3) + 0.2 * noise2.ridged(x / 130, z / 130, 2));
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
  let lowBank = Infinity;
  for (let k = 0; k < map.creek.points.length; k++) {
    const p = map.creek.points[k];
    lowBank = Math.min(lowBank, p.water + (CREEK_BANK_REACH - p.halfWidth) * creekBankSlope[k]);
  }
  const wallReach = CREEK_BANK_REACH + Math.max(0, top - lowBank) / CREEK_WALL_SLOPE + MACRO_STEP;
  const wallPoly = densify(creekPts, 4);
  const mWallDist = new Float32Array(mres * mres).fill(1e9);
  const mWallParam = new Float32Array(mres * mres);
  stampPolyline(wallPoly, wallReach, mgrid, mWallDist, mWallParam);
  for (let i = 0; i < macro.length; i++) {
    const d = mWallDist[i];
    if (d > wallReach) continue;
    const u = atParam(wallPoly.u, mWallParam[i]);
    const bankTop =
      creekAttr('water', u) + (CREEK_BANK_REACH - creekAttr('halfWidth', u)) * attrAt(creekBankSlope, u);
    const wall = bankTop + Math.max(0, d - CREEK_BANK_REACH) * CREEK_WALL_SLOPE;
    if (macro[i] > wall) macro[i] = wall;
  }

  yield { progress: 0.18, label: 'Adding detail' };

  // --- Full resolution heights ---
  const heights = new Float32Array(n);
  const { detailAmplitude, detailScale } = map.noise;
  for (let iz = 0; iz < res; iz++) {
    const z = -half + iz;
    const fz = iz / MACRO_STEP;
    for (let ix = 0; ix < res; ix++) {
      const x = -half + ix;
      const h = bilinear(macro, mres, ix / MACRO_STEP, fz);
      heights[iz * res + ix] =
        h +
        detailAmplitude * noise2.fbm(x / detailScale, z / detailScale, 2) +
        detailAmplitude * 0.25 * noise3.noise(x / 2.3, z / 2.3);
    }
  }

  const sampleH = (x: number, z: number) => bilinear(heights, res, x + half, z + half);

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
      let iz = Math.max(0, Math.floor(f.z - R + half));
      iz <= Math.min(res - 1, Math.ceil(f.z + R + half));
      iz++
    )
      for (
        let ix = Math.max(0, Math.floor(f.x - R + half));
        ix <= Math.min(res - 1, Math.ceil(f.x + R + half));
        ix++
      ) {
        const d = Math.hypot(ix - half - f.x, iz - half - f.z);
        if (d >= R) continue;
        const w = 1 - smoothstep(f.radius, R, d);
        const i = iz * res + ix;
        heights[i] += (target - heights[i]) * w;
      }
  }

  yield { progress: 0.3, label: 'Carving the creek' };

  // --- Creek channel ---
  const grid: Grid = { res, step: 1, origin: -half };
  const water = new Float32Array(n).fill(NO_WATER);
  const creekDist = new Float32Array(n).fill(1e9);
  const creekParam = new Float32Array(n);
  stampPolyline(creekPoly, CREEK_BANK_REACH, grid, creekDist, creekParam);
  const creekHalfAt = new Float32Array(n); // half width at the nearest creek point (0 if far)
  const surface = new Uint8Array(n).fill(SurfaceId.Grass);
  const tint = new Uint8Array(n).fill(GroundTint.GrassDry);
  for (let i = 0; i < n; i++) {
    const d = creekDist[i];
    if (d > CREEK_BANK_REACH) continue;
    const u = creekU(creekParam[i]);
    const W = creekAttr('water', u);
    const hw = creekAttr('halfWidth', u);
    const depth = creekAttr('depth', u);
    const bankSlope = attrAt(creekBankSlope, u);
    creekHalfAt[i] = hw;
    if (d <= hw) {
      const q = d / hw;
      heights[i] = W - depth * (1 - q * q);
      water[i] = W;
    } else {
      const upper = W + (d - hw) * bankSlope;
      const lower = W + Math.min(0.35, (d - hw) * bankSlope * 0.9);
      let h = heights[i];
      if (h > upper) h = upper;
      if (d < hw + 8 && h < lower) h = lower;
      heights[i] = h;
    }
  }
  const creekWater = new Float32Array(creekPoly.count);
  const creekHalf = new Float32Array(creekPoly.count);
  for (let k = 0; k < creekPoly.count; k++) {
    creekWater[k] = creekAttr('water', creekPoly.u[k]);
    creekHalf[k] = creekAttr('halfWidth', creekPoly.u[k]);
  }
  const creek: CreekInfo = { def: map.creek, poly: creekPoly, water: creekWater, halfWidth: creekHalf };

  yield { progress: 0.45, label: 'Grading tracks' };

  // --- Tracks ---
  const tracks: TrackInfo[] = [];
  const trackDist = new Float32Array(n).fill(1e9);
  const trackParam = new Float32Array(n);
  const trackSide = new Float32Array(n);
  const trackOwner = new Int16Array(n).fill(-1);
  const rawProfiles: Float32Array[] = [];
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
    tracks.push({ def, poly, profile });
    rawProfiles.push(raw);
    stampPolyline(poly, def.width / 2 + def.shoulder, grid, trackDist, trackParam, trackSide, trackOwner, id);
  });

  for (let i = 0; i < n; i++) {
    const id = trackOwner[i];
    if (id < 0) continue;
    const t = tracks[id];
    const def = t.def;
    const d = trackDist[i];
    const p = trackParam[i];
    // Leave the creek channel alone; the profile already dips to the bed.
    const inCreek = creekDist[i] <= creekHalfAt[i] + 0.5;
    if (inCreek) continue;
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
    const w = d <= hw ? 1 : 1 - smoothstep(hw, hw + def.shoulder, d);
    heights[i] = h + (target - h) * w;
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

  // --- Bogs ---
  const bogMask = new Uint8Array(n);
  for (const b of map.bogs) {
    const a = (b.rotationDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const R = Math.max(b.radiusX, b.radiusZ) * 1.6;
    for (let iz = Math.floor(b.z - R + half); iz <= Math.ceil(b.z + R + half); iz++)
      for (let ix = Math.floor(b.x - R + half); ix <= Math.ceil(b.x + R + half); ix++) {
        const x = ix - half - b.x;
        const z = iz - half - b.z;
        const rx = (x * c + z * s) / b.radiusX;
        const rz = (-x * s + z * c) / b.radiusZ;
        const r = Math.sqrt(rx * rx + rz * rz) + noise3.noise((ix - half) / 4, (iz - half) / 4) * 0.18;
        if (r > 1.5) continue;
        const i = iz * res + ix;
        const dip = b.depth * (1 - smoothstep(0.35, 1.05, r));
        heights[i] -= dip - 0.06 * noise2.noise((ix - half) / 1.7, (iz - half) / 1.7) * (r < 1 ? 1 : 0);
        if (r < 1.12) bogMask[i] = 1;
      }
  }

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
    for (let iz = Math.floor(g.z - R + half); iz <= Math.ceil(g.z + R + half); iz++)
      for (let ix = Math.floor(g.x - R + half); ix <= Math.ceil(g.x + R + half); ix++) {
        if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
        const x = ix - half - g.x;
        const z = iz - half - g.z;
        const along = x * dirX + z * dirZ;
        const lat = Math.abs(-x * dirZ + z * dirX);
        const endFade = smoothstep(L + 1.5, L - 3, Math.abs(along));
        if (endFade <= 0 || lat > rampOut) continue;
        const i = iz * res + ix;
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

  // --- Surfaces and tints ---
  for (let iz = 2; iz < res - 2; iz++) {
    for (let ix = 2; ix < res - 2; ix++) {
      const i = iz * res + ix;
      // Wide stencil so small bumps don't speckle the slope classes.
      const gx = (heights[i + 2] - heights[i - 2]) * 0.25;
      const gz = (heights[i + 2 * res] - heights[i - 2 * res]) * 0.25;
      const slope = Math.atan(Math.sqrt(gx * gx + gz * gz)) * (180 / Math.PI);
      const x = ix - half;
      const z = iz - half;
      const nz = noise2.noise(x / 16, z / 16);
      // Border mountains: steep but forested so the map edge reads as closed scrub.
      const edge = half - Math.max(Math.abs(x), Math.abs(z)) + noise3.fbm(x / 160, z / 160, 2) * 40;
      if (edge < border.width && slope < 52 + nz * 6) {
        surface[i] = slope > 32 ? SurfaceId.Gravel : SurfaceId.Grass;
        tint[i] = nz > 0.45 && slope > 36 ? GroundTint.Scree : GroundTint.ForestFloor;
        continue;
      }
      if (slope > 39 + nz * 4) {
        surface[i] = SurfaceId.Rock;
        tint[i] = nz > 0.1 ? GroundTint.Rock : GroundTint.Scree;
      } else if (slope > 31.5 + nz * 5) {
        surface[i] = SurfaceId.Gravel;
        tint[i] = GroundTint.Scree;
      } else {
        surface[i] = SurfaceId.Grass;
        const wet = creekDist[i] - creekHalfAt[i];
        tint[i] = creekDist[i] < 1e8 && wet < 14 + nz * 6 ? GroundTint.GrassSage : GroundTint.GrassDry;
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
              : SurfaceId.Grass;
    for (let iz = Math.floor(p.z - R + half); iz <= Math.ceil(p.z + R + half); iz++)
      for (let ix = Math.floor(p.x - R + half); ix <= Math.ceil(p.x + R + half); ix++) {
        if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
        const x = ix - half;
        const z = iz - half;
        const r =
          Math.hypot(x - p.x, z - p.z) / p.radius + (p.ragged ?? 0) * noise3.noise(x / 6, z / 6) * 0.5;
        if (r > 1) continue;
        const i = iz * res + ix;
        surface[i] = sid;
        if (kind === 'rock')
          tint[i] = noise2.noise(x / 6, z / 6) > -0.25 ? GroundTint.Rock : GroundTint.Scree;
        else if (kind === 'gravel') tint[i] = GroundTint.Gravel;
        else if (kind === 'dirt') tint[i] = GroundTint.DirtTrack;
        else if (kind === 'mud') tint[i] = GroundTint.Mud;
      }
  }

  const trackDistance = new Uint8Array(n).fill(255);
  for (let i = 0; i < n; i++) {
    const id = trackOwner[i];
    if (id < 0) continue;
    const def = tracks[id].def;
    const hw = def.width / 2;
    const d = trackDist[i];
    trackDistance[i] = Math.min(255, Math.max(0, Math.round(d - hw)));
    if (d > hw + 0.6) continue;
    if (def.faint) {
      if (d <= hw) {
        surface[i] = SurfaceId.Dirt;
        tint[i] = GroundTint.FaintTrack;
      }
      continue;
    }
    const sid =
      def.surface === 'gravel' ? SurfaceId.Gravel : def.surface === 'rock' ? SurfaceId.Rock : SurfaceId.Dirt;
    surface[i] = sid;
    if (def.surface === 'rock') {
      const x = (i % res) - half;
      const z = Math.floor(i / res) - half;
      tint[i] = noise2.noise(x / 5, z / 5) > -0.15 ? GroundTint.Rock : GroundTint.Scree;
    } else if (def.surface === 'gravel') tint[i] = d > hw - 0.4 ? GroundTint.DirtEdge : GroundTint.Gravel;
    else tint[i] = d > hw - 0.4 ? GroundTint.DirtEdge : GroundTint.DirtTrack;
  }
  // Rocky steps on tracks show as rock.
  for (const t of tracks) {
    for (const st of t.def.rockySteps ?? []) {
      const k = Math.min(t.poly.count - 1, Math.round(st.at));
      const cx = t.poly.xs[k];
      const cz = t.poly.zs[k];
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dz * dz > 9) continue;
          const i = (Math.round(cz + half) + dz) * res + Math.round(cx + half) + dx;
          surface[i] = SurfaceId.Rock;
          tint[i] = (dx + dz) & 1 ? GroundTint.Rock : GroundTint.Scree;
        }
    }
  }

  for (let i = 0; i < n; i++) {
    if (bogMask[i]) {
      surface[i] = SurfaceId.Mud;
      tint[i] = GroundTint.Mud;
    }
    if (gullyMask[i]) {
      if (surface[i] !== SurfaceId.Mud) surface[i] = SurfaceId.Dirt;
      tint[i] = GroundTint.DirtEdge;
    }
  }

  const creekDistance = new Uint8Array(n).fill(255);
  for (let i = 0; i < n; i++) {
    const d = creekDist[i];
    if (d > 40) continue;
    const hw = creekHalfAt[i];
    creekDistance[i] = Math.min(255, Math.max(0, Math.round(d - hw)));
    const u = creekU(creekParam[i]);
    const gravel = attrAt(creekGravel, u) > 0.5;
    if (water[i] > NO_WATER) {
      surface[i] = SurfaceId.Water;
      tint[i] = gravel ? GroundTint.Gravel : GroundTint.CreekBed;
    } else if (d <= hw + 1.6) {
      surface[i] = gravel ? SurfaceId.Gravel : SurfaceId.Mud;
      tint[i] = gravel ? GroundTint.Gravel : GroundTint.Mud;
    }
  }

  yield { progress: 0.8, label: 'Terrain ready' };

  const terrain = new Terrain(size, heights, surface, tint, water);
  // Fine ruts and drainage humps over the finished 1 m ground.
  const patches: DetailPatch[] = [];
  for (const t of tracks) {
    const patch = buildDetailPatch(t, half, (x, z) => terrain.heightAt(x, z));
    if (patch) patches.push(patch);
  }
  terrain.setDetail(patches);
  return {
    terrain,
    features: {
      tracks,
      creek,
      boxes,
      rocks: [],
      logs: [],
      timbers: [],
      gates: [],
      gullies,
      trackDistance,
      creekDistance,
    },
  };
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
  for (let j = 0; j < pins.length - 1; j++) {
    const a = pins[j];
    const b = pins[j + 1];
    for (let k = a.k; k <= b.k; k++) {
      const t = (poly.s[k] - poly.s[a.k]) / Math.max(1e-6, poly.s[b.k] - poly.s[a.k]);
      out[k] = a.y + (b.y - a.y) * t;
    }
  }
  return out;
}

/** Run all generation steps synchronously. */
export function generateTerrain(map: MapDef): GeneratedTerrain {
  const gen = generateTerrainSteps(map);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
