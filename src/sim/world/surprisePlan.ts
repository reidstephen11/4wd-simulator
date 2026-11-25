import { mulberry32 } from './rng';
import { boulderPoints } from './rockShape';
import { pointAt } from './polyline';
import { trailProgress } from './crawlTrail';
import type { TrackInfo } from './features';
import type { World } from './world';

/**
 * One-off events on the way (surprises): a dead tree comes down across the track ahead, or
 * rocks come off a cutting's bank onto it. Each run picks where they happen from its seed,
 * so the route isn't the same fixed course every time, and a restart from camp (which keeps
 * the seed) sees the same ones in the same places.
 */
export type SurpriseKind = 'treefall' | 'rockfall';

/** A stretch of track (metres along it, from its first point) where one kind can happen. */
export interface SurpriseSiteDef {
  id: string;
  kind: SurpriseKind;
  track: string;
  from: number;
  to: number;
}

/** An episode's surprises: the stretches, and how many of each kind a run gets. */
export interface SurpriseSetDef {
  sites: readonly SurpriseSiteDef[];
  treefalls: number;
  rockfalls: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PiecePose {
  x: number;
  y: number;
  z: number;
  q: Quat;
}

/** A dead tree standing at the roadside that topples across the track about its base. */
export interface TrunkPiece {
  kind: 'trunk';
  length: number;
  radius: number;
  mass: number;
  /** Mass of the root plate torn out with it (kg). */
  rootPlate: number;
  /** Bottom of the trunk where it stands (ground level). */
  base: { x: number; y: number; z: number };
  /** Horizontal direction it falls (unit). */
  fx: number;
  fz: number;
  /** Rise of the trunk's length once down (radians, + tip higher than the base). */
  rest: number;
  /** Height of the trunk's axis at the base once down (the ground plus its radius). */
  restY: number;
  delay: number;
  duration: number;
}

/** A rock that sits loose on the bank, then rolls and bounces down onto the track. */
export interface RockPiece {
  kind: 'rock';
  /** Points of its faceted shape (the collider is their convex hull). */
  points: number[];
  rx: number;
  ry: number;
  rz: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  delay: number;
  duration: number;
  /** Height of its bounces (m). */
  hop: number;
}

export type SurprisePiece = TrunkPiece | RockPiece;

export interface SurprisePlan {
  id: string;
  kind: SurpriseKind;
  /** The stretch it came from. */
  site: string;
  track: string;
  /** Metres along the track to where it lands. */
  at: number;
  x: number;
  z: number;
  /** It starts when the car is this far short of it along the track (more at speed). */
  triggerAhead: number;
  pieces: SurprisePiece[];
}

/** Tuning for the events (SPEC §3, surprises). */
export const surpriseTuning = {
  /** Trigger this far short of the spot (m), seeded per event between the two. */
  triggerMin: 45,
  triggerMax: 70,
  /** At speed, trigger early enough to stop: speed × (fall time + this) + the margin (m). */
  triggerLead: 2,
  triggerMargin: 18,
  /** Only while the car is this close to the track's centre line (m). */
  triggerLateral: 14,
  /** A fallen piece turns solid only once the car is this far clear of it (m). */
  carClearance: 3.2,
  /** Events keep at least this far apart, and from the map's fixed fallen trees (m). */
  spacing: 140,
  /** Clear of creeks and bridges by this much (m from the water's edge). */
  creekClearance: 22,
  /** No steeper than this (rise over run) from 30 m before an event to 15 m after. */
  maxGrade: 0.15,
  /** Clear of camps by this much (m beyond their radius). */
  campClearance: 30,
  /** The dead tree: length range (m), radius (m) and mass (kg). */
  trunkLength: [10, 14] as const,
  trunkRadius: [0.3, 0.38] as const,
  trunkMass: 420,
  rootPlate: 450,
  /** Seconds it takes to topple. */
  trunkFall: 2.6,
  /** A rockfall needs a bank rising at least this much (m) beside the track, 9 m out. */
  bankRise: 1.4,
  /**
   * A rock comes to rest only where the ground under it is this level (rise over run):
   * steeper, it rolls on once it is down, and a saved game, which puts it back where it
   * landed, would not match.
   */
  rockRestSlope: 0.15,
  /** Rock density (kg/m³); rapier works the mass out from the hull. */
  rockDensity: 2300,
} as const;

/** Lays a +y axis along the unit direction (dx, dy, dz). */
export function quatFromUp(dx: number, dy: number, dz: number): Quat {
  // Rotate +y towards d about the axis y × d.
  const ax = dz;
  const az = -dx;
  const s = Math.hypot(ax, az);
  const angle = Math.atan2(s, dy);
  if (s < 1e-9) return dy >= 0 ? { x: 0, y: 0, z: 0, w: 1 } : { x: 1, y: 0, z: 0, w: 0 };
  const h = Math.sin(angle / 2) / s;
  return { x: ax * h, y: 0, z: az * h, w: Math.cos(angle / 2) };
}

/** Rotation by `angle` about the unit axis (ax, ay, az). */
export function quatAxis(ax: number, ay: number, az: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(angle / 2) };
}

const ease = (u: number) => u * u;

/**
 * Where a piece is `t` seconds after its event started (before its delay: where it began;
 * after its duration: where it comes to rest).
 */
export function piecePose(
  p: SurprisePiece,
  t: number,
  heightAt: (x: number, z: number) => number,
): PiecePose {
  const u = Math.max(0, Math.min(1, (t - p.delay) / p.duration));
  if (p.kind === 'trunk') {
    // Toppling under gravity: slow to start, fast at the end.
    const tilt = ease(u) * (Math.PI / 2 - p.rest);
    const dy = Math.cos(tilt);
    const h = Math.sin(tilt);
    const half = p.length / 2;
    // The foot lifts from the ground to the trunk's radius as it goes over.
    const footY = p.base.y + (p.restY - p.base.y) * ease(u);
    return {
      x: p.base.x + p.fx * h * half,
      y: footY + dy * half,
      z: p.base.z + p.fz * h * half,
      q: quatFromUp(p.fx * h, dy, p.fz * h),
    };
  }
  // A rock gathers speed down the bank, bouncing lower each time.
  const k = Math.pow(u, 1.5);
  const x = p.start.x + (p.end.x - p.start.x) * k;
  const z = p.start.z + (p.end.z - p.start.z) * k;
  const bounce = Math.abs(Math.sin(k * Math.PI * 3)) * p.hop * (1 - k);
  const y = heightAt(x, z) + p.ry * 0.92 + bounce;
  // Rolling: turned about the axis across its path by the distance over its radius.
  const lx = p.end.x - p.start.x;
  const lz = p.end.z - p.start.z;
  const len = Math.hypot(lx, lz) || 1;
  const r = (p.rx + p.ry) / 2;
  const q = quatAxis(lz / len, 0, -lx / len, (k * len) / r);
  return { x, y, z, q };
}

/** Seconds from an event's start until its last piece is down. */
export function planDuration(plan: SurprisePlan): number {
  return Math.max(...plan.pieces.map((p) => p.delay + p.duration));
}

/** Nearest distance from (px, pz) to the segment a–b. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/** No tree, boulder or rock stands within `pad` metres of the line a–b. */
function clearAlong(world: World, ax: number, az: number, bx: number, bz: number, pad: number): boolean {
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const reach = Math.hypot(bx - ax, bz - az) / 2 + pad + 2;
  for (const t of world.treeGrid.near(cx, cz, reach))
    if (segDist(t.x, t.z, ax, az, bx, bz) < t.trunkRadius + pad) return false;
  for (const r of world.rockGrid.near(cx, cz, reach))
    if (segDist(r.x, r.z, ax, az, bx, bz) < r.radius + pad) return false;
  for (const r of world.features.rocks) if (segDist(r.x, r.z, ax, az, bx, bz) < pad + 2) return false;
  for (const b of world.features.boxes)
    if (segDist(b.x, b.z, ax, az, bx, bz) < pad + Math.hypot(b.hx, b.hz)) return false;
  // Signposts, huts and the like.
  for (const p of world.map.props) if (segDist(p.x, p.z, ax, az, bx, bz) < pad + 1.5) return false;
  return true;
}

/** Too near water, a bridge, a bog, a camp or the map's own fallen trees for an event. */
function badSpot(world: World, x: number, z: number): boolean {
  const T = surpriseTuning;
  const { creekDistance } = world.features;
  const halfX = world.terrain.halfX;
  const halfZ = world.terrain.halfZ;
  const i = Math.round(z + halfZ) * world.terrain.resX + Math.round(x + halfX);
  if (creekDistance[i] < T.creekClearance) return true;
  for (const b of world.features.mudHoles)
    if (Math.hypot(b.x - x, b.z - z) < Math.max(b.radiusX, b.radiusZ) + 14) return true;
  for (const b of world.map.bogs)
    if (Math.hypot(b.x - x, b.z - z) < Math.max(b.radiusX, b.radiusZ) + 14) return true;
  for (const p of world.pois)
    if (p.kind === 'campsite' && Math.hypot(p.x - x, p.z - z) < p.radius + T.campClearance) return true;
  for (const f of world.map.fallenTrees) if (Math.hypot(f.x - x, f.z - z) < T.spacing) return true;
  // Where another track joins, the way round would be the other track.
  for (const t of world.features.tracks) {
    const n = t.poly.count - 1;
    for (const k of [0, n]) if (Math.hypot(t.poly.xs[k] - x, t.poly.zs[k] - z) < 25) return true;
  }
  return false;
}

/**
 * Too near one of the route's own obstacles (a washout, a rock ledge, a sideling, a steep pinch): each
 * stretch keeps its own challenge, and a surprise on top of one could leave no way past.
 */
function nearObstacle(world: World, track: TrackInfo, at: number): boolean {
  const p = pointAt(track.poly, at);
  for (const g of world.map.gullies) if (Math.hypot(g.x - p.x, g.z - p.z) < 50 + g.length / 2) return true;
  if (track.def.rockySteps?.some((r) => Math.abs(r.at - at) < 50)) return true;
  if (track.def.stones?.some((st) => st.shape === 'ridge' && Math.abs(st.at - at) < 50)) return true;
  const cant = track.def.cant;
  if (cant && cant.length > 0 && at > cant[0][0] - 40 && at < cant[cant.length - 1][0] + 40) return true;
  // On a steep pinch (Big Red, Bob's Hill, the ridge's clay pinch) the climb is the
  // challenge, stopping on it to winch is unfair, and fallen rocks would roll back down it.
  for (let s = at - 30; s < at + 15; s += 5)
    if (Math.abs(heightAlong(track, s + 5) - heightAlong(track, s)) / 5 > surpriseTuning.maxGrade)
      return true;
  return false;
}

/** The track's graded height `s` metres along it. */
function heightAlong(track: TrackInfo, s: number): number {
  const { s: arc, count } = track.poly;
  const c = Math.max(0, Math.min(track.poly.length, s));
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] <= c) lo = mid;
    else hi = mid;
  }
  const f = arc[hi] > arc[lo] ? (c - arc[lo]) / (arc[hi] - arc[lo]) : 0;
  return track.profile[lo] + (track.profile[hi] - track.profile[lo]) * f;
}

/** Track point and directions: along (tx, tz) and across (nx, nz), as `trailPoint` lays laterals. */
function frame(track: TrackInfo, at: number) {
  const p = pointAt(track.poly, at);
  return { x: p.x, z: p.z, tx: p.dx, tz: p.dz, nx: -p.dz, nz: p.dx };
}

/** A dead tree that falls across the track at `at`, or null if it can't land clear there. */
function planTreefall(world: World, track: TrackInfo, at: number, rand: () => number): TrunkPiece | null {
  const T = surpriseTuning;
  const f = frame(track, at);
  if (badSpot(world, f.x, f.z) || nearObstacle(world, track, at)) return null;
  const hw = track.def.width / 2;
  const side = rand() < 0.5 ? -1 : 1;
  // It stands just off the edge and falls across, angled up to 25° along the track.
  const offset = hw + 1.3 + rand() * 0.6;
  const swing = ((rand() * 2 - 1) * 25 * Math.PI) / 180;
  const radius = T.trunkRadius[0] + rand() * (T.trunkRadius[1] - T.trunkRadius[0]);
  // Across: from the foot over the far edge by 1.5–4 m.
  const across = offset + hw + 1.5 + rand() * 2.5;
  const length = Math.min(T.trunkLength[1], Math.max(T.trunkLength[0], across / Math.cos(swing)));
  const bx = f.x + f.nx * side * offset;
  const bz = f.z + f.nz * side * offset;
  // Fall direction: back across the track, swung along it.
  const cx = -f.nx * side;
  const cz = -f.nz * side;
  const fx = cx * Math.cos(swing) + f.tx * Math.sin(swing);
  const fz = cz * Math.cos(swing) + f.tz * Math.sin(swing);
  const tipX = bx + fx * length;
  const tipZ = bz + fz * length;
  if (badSpot(world, tipX, tipZ)) return null;
  // Its own trunk stands clear of the scatter, and it lands clear of trees and rocks.
  if (!clearAlong(world, bx, bz, tipX, tipZ, radius + 0.7)) return null;
  // Winched round by its crown, it swings back towards a car coming along the track about
  // its root: the outer part of that sweep must be clear too, or it jams on a tree.
  for (let deg = 15; deg <= 60; deg += 15) {
    const a = (deg * Math.PI) / 180;
    const sx = fx * Math.cos(a) - f.tx * Math.sin(a);
    const sz = fz * Math.cos(a) - f.tz * Math.sin(a);
    const n = Math.hypot(sx, sz);
    const ex = bx + (sx / n) * length;
    const ez = bz + (sz / n) * length;
    if (!clearAlong(world, bx + (ex - bx) * 0.4, bz + (ez - bz) * 0.4, ex, ez, radius + 0.7)) return null;
  }
  const h = world.terrain.heightAt.bind(world.terrain);
  const hb = h(bx, bz);
  const ht = h(tipX, tipZ);
  if (Math.abs(ht - hb) > 2.5) return null;
  // Lie on the line between the ends, lifted over any hump between.
  let lift = 0;
  for (let i = 1; i < 20; i++) {
    const k = i / 20;
    const g = h(bx + fx * length * k, bz + fz * length * k);
    lift = Math.max(lift, g - (hb + (ht - hb) * k));
  }
  if (lift > 0.8) return null;
  return {
    kind: 'trunk',
    length,
    radius,
    mass: T.trunkMass * (radius / 0.34) ** 2 * (length / 12),
    rootPlate: T.rootPlate,
    base: { x: bx, y: hb, z: bz },
    fx,
    fz,
    rest: Math.atan2(ht - hb, length),
    restY: hb + radius + lift + 0.04,
    delay: 0,
    duration: T.trunkFall,
  };
}

/**
 * Rocks off the bank at `at`: two big ones land on the bank's half of the track, leaving a
 * squeeze past on the other, and a scatter of small ones that can be crawled over.
 */
function planRockfall(world: World, track: TrackInfo, at: number, rand: () => number): RockPiece[] | null {
  const T = surpriseTuning;
  const f = frame(track, at);
  if (badSpot(world, f.x, f.z) || nearObstacle(world, track, at)) return null;
  const h = world.terrain.heightAt.bind(world.terrain);
  const h0 = h(f.x, f.z);
  const rise = (side: number) => h(f.x + f.nx * side * 9, f.z + f.nz * side * 9) - h0;
  const side = rise(1) >= rise(-1) ? 1 : -1;
  if (rise(side) < T.bankRise) return null;
  const hw = track.def.width / 2;
  const at2 = (along: number, lateral: number) => ({
    x: f.x + f.tx * along + f.nx * side * lateral,
    z: f.z + f.tz * along + f.nz * side * lateral,
  });
  const rocks: RockPiece[] = [];
  const add = (r: number, along: number, lateral: number, delay: number): boolean => {
    const rx = r * (0.9 + rand() * 0.25);
    const ry = r * (0.7 + rand() * 0.2);
    const rz = r * (0.9 + rand() * 0.25);
    const end = at2(along, lateral);
    const slope = Math.hypot(
      h(end.x + 0.5, end.z) - h(end.x - 0.5, end.z),
      h(end.x, end.z + 0.5) - h(end.x, end.z - 0.5),
    );
    if (slope > T.rockRestSlope) return false;
    // From up the bank, 7–10 m out, a little up or down the track.
    const start = at2(along + (rand() * 2 - 1) * 2, 7 + rand() * 3);
    if (!clearAlong(world, start.x, start.z, end.x, end.z, Math.max(rx, rz) + 0.25)) return false;
    // Clear of the rocks already down.
    for (const o of rocks)
      if (Math.hypot(o.end.x - end.x, o.end.z - end.z) < Math.max(o.rx, o.rz) + Math.max(rx, rz) + 0.15)
        return false;
    rocks.push({
      kind: 'rock',
      points: boulderPoints(rx, ry, rz, Math.floor(rand() * 1e9)),
      rx,
      ry,
      rz,
      start,
      end,
      delay,
      duration: 1.6 + rand() * 0.8,
      hop: 0.3 + rand() * 0.4,
    });
    return true;
  };
  // The big ones, on the bank's half, keeping clear of the far half.
  for (let k = 0; k < 2; k++) {
    let placed = false;
    for (let attempt = 0; attempt < 6 && !placed; attempt++) {
      const r = 0.48 + rand() * 0.14;
      placed = add(r, (k === 0 ? -2.5 : 2.5) + (rand() * 2 - 1) * 1.5, r + 0.35 + rand() * 0.8, k * 0.5);
    }
    if (!placed) return null;
  }
  // Small ones anywhere across, low enough to crawl over.
  const small = 4 + Math.floor(rand() * 3);
  for (let k = 0; k < small; k++) {
    const r = 0.14 + rand() * 0.1;
    add(r, (rand() * 2 - 1) * 6, (rand() * 2 - 1) * (hw - 0.2), 0.2 + rand() * 1.2);
  }
  return rocks;
}

/**
 * Pick this run's surprises from an episode's stretches: `treefalls` tree falls and
 * `rockfalls` rockfalls, each from a different stretch, at a seeded spot along it where it
 * lands clear (of trees, rocks, bogs, water, camps and junctions) and can be got past.
 */
export function planSurprises(world: World, set: SurpriseSetDef, seed: number): SurprisePlan[] {
  const T = surpriseTuning;
  const rand = mulberry32((seed ^ 0x5eed) >>> 0);
  const out: SurprisePlan[] = [];
  const tracks = new Map(world.features.tracks.map((t) => [t.def.id, t]));
  // Rockfalls first: they need a bank, so there are fewer spots for them.
  for (const kind of ['rockfall', 'treefall'] as const) {
    const want = kind === 'treefall' ? set.treefalls : set.rockfalls;
    const sites = set.sites.filter((s) => s.kind === kind);
    // Shuffle the stretches.
    for (let i = sites.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [sites[i], sites[j]] = [sites[j], sites[i]];
    }
    let n = 0;
    for (const site of sites) {
      if (n >= want) break;
      const track = tracks.get(site.track);
      if (!track) throw new Error(`Surprise ${site.id}: no track ${site.track}`);
      const span = Math.min(site.to, track.poly.length) - site.from;
      const first = rand() * span;
      // Its own generator, so one stretch's tries don't shift the next stretch's spot.
      const local = mulberry32(Math.floor(rand() * 2 ** 32));
      for (let step = 0; step < span; step += 6) {
        const at = site.from + ((first + step) % span);
        const p = pointAt(track.poly, at);
        if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < T.spacing)) continue;
        const pieces =
          kind === 'treefall'
            ? [planTreefall(world, track, at, local)]
            : planRockfall(world, track, at, local);
        if (!pieces || pieces.some((q) => q === null)) continue;
        out.push({
          id: `${kind}-${site.id}`,
          kind,
          site: site.id,
          track: site.track,
          at,
          x: p.x,
          z: p.z,
          triggerAhead: T.triggerMin + local() * (T.triggerMax - T.triggerMin),
          pieces: pieces as SurprisePiece[],
        });
        n++;
        break;
      }
    }
  }
  return out;
}

/**
 * How far short of a plan's spot the car is along its track (m), or null when it is off
 * that track's line near there or already past.
 */
export function distanceShort(plan: SurprisePlan, track: TrackInfo, x: number, z: number): number | null {
  if (Math.hypot(x - plan.x, z - plan.z) > surpriseTuning.triggerMax * 3) return null;
  const { distance, along } = trailProgress(track, x, z);
  if (distance > surpriseTuning.triggerLateral) return null;
  const ahead = plan.at - along;
  return ahead >= 0 ? ahead : null;
}
