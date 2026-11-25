import type { TrackInfo } from './features';
import type { BogDef, TrackDef } from './mapTypes';
import type { Noise2D } from './noise';
import { mulberry32 } from './rng';

/** Keep potholes and washouts this far (m) from a track's ends, where it meets another. */
const CLEAR_ENDS = 10;
/** Bumps and dips repeat about this often along a track (m); swells about three times as far. */
const BUMP_SCALE = 3.2;
const SWELL_SCALE = 9.5;
/** The wheel lines are this far (m) either side of the centreline. */
const WHEEL_LINE = 0.75;

interface Pothole {
  s: number;
  /** Metres left of the centreline. */
  l: number;
  radius: number;
  depth: number;
}

interface Washout {
  s: number;
  /** Tangent of the channel's angle away from square across the track. */
  skew: number;
  /** Cosine of that angle (turns along-track distance into distance across the channel). */
  cos: number;
  half: number;
  depth: number;
}

/** The potholes and washouts on one track, placed once from the map's seed. */
export interface TrackRoughness {
  bumps: number;
  swells: number;
  potholes: Pothole[];
  washouts: Washout[];
}

/** Lay out a track's rough spots along its length (null if it is graded smooth). */
export function trackRoughness(def: TrackDef, length: number, seed: number): TrackRoughness | null {
  const r = def.rough;
  if (!r) return null;
  const rand = mulberry32(seed);
  const potholes: Pothole[] = [];
  const washouts: Washout[] = [];
  // Spots come every 100 / count metres on average, never evenly.
  const place = (perHundred: number, add: (s: number) => void) => {
    if (!perHundred) return;
    const gap = 100 / perHundred;
    for (let s = CLEAR_ENDS + rand() * gap; s < length - CLEAR_ENDS; s += gap * (0.4 + 1.2 * rand())) add(s);
  };
  place(r.potholes ?? 0, (s) =>
    potholes.push({
      s,
      l: (rand() < 0.5 ? -1 : 1) * (WHEEL_LINE + (rand() - 0.5) * 0.6),
      radius: 0.7 + rand() * 0.7,
      depth: (r.potholeDepth ?? 0.2) * (0.55 + 0.45 * rand()),
    }),
  );
  place(r.washouts ?? 0, (s) => {
    const angle = (rand() < 0.5 ? -1 : 1) * (15 + rand() * 35) * (Math.PI / 180);
    washouts.push({
      s,
      skew: Math.tan(angle),
      cos: Math.cos(angle),
      half: 0.6 + rand() * 0.35,
      depth: (r.washoutDepth ?? 0.25) * (0.6 + 0.4 * rand()),
    });
  });
  return { bumps: r.bumps, swells: r.swells ?? 0, potholes, washouts };
}

/** Inner share of a pothole or washout that counts as in it (for strikes and the tint). */
const INNER = 0.8;

/**
 * Height to add to the graded track at a point `s` metres along it and `l` metres left
 * of its centreline (world position x, z): bumps and swells, less any pothole or washout.
 */
export function roughOffset(
  rough: TrackRoughness,
  noise: Noise2D,
  x: number,
  z: number,
  s: number,
  l: number,
): number {
  let h = rough.bumps * noise.fbm(x / BUMP_SCALE, z / BUMP_SCALE, 2);
  if (rough.swells) h += rough.swells * noise.noise(x / SWELL_SCALE + 71.3, z / SWELL_SCALE - 19.7);
  for (const p of rough.potholes) {
    if (Math.abs(s - p.s) > p.radius) continue;
    const q = Math.hypot(s - p.s, l - p.l) / p.radius;
    if (q < 1) h -= p.depth * (1 - q * q);
  }
  for (const w of rough.washouts) {
    const d = washoutDistance(w, s, l);
    if (d < w.half) h -= w.depth * (1 - (d / w.half) ** 2);
  }
  return h;
}

/**
 * The pothole or washout a point is well inside, if any: its full depth (m) and which
 * kind. A wheel dropping in is judged by this depth, however near the edge it lands.
 */
export function roughHole(
  rough: TrackRoughness,
  s: number,
  l: number,
): { depth: number; kind: 'pothole' | 'washout' } | null {
  let hole: { depth: number; kind: 'pothole' | 'washout' } | null = null;
  for (const p of rough.potholes) {
    if (Math.abs(s - p.s) > p.radius) continue;
    if (Math.hypot(s - p.s, l - p.l) < p.radius * INNER && p.depth > (hole?.depth ?? 0))
      hole = { depth: p.depth, kind: 'pothole' };
  }
  for (const w of rough.washouts)
    if (washoutDistance(w, s, l) < w.half * INNER && w.depth > (hole?.depth ?? 0))
      hole = { depth: w.depth, kind: 'washout' };
  return hole;
}

/**
 * Potholes and washouts this deep (m) or deeper can pinch a tyre at road speeds (from
 * about 60 km/h squarely, 45 km/h at their deepest), so they are marked to be seen: dark
 * inside and ringed with pale gravel kicked out of them, out to this share of their size.
 */
const MARKED_DEPTH = 0.2;
const MARK_RIM = 1.7;

/** How the ground shows a pothole or washout near a point (see `roughPatch`). */
export interface RoughPatch {
  /** Distance (m) out from its painted edge, negative inside. */
  edge: number;
  kind: 'pothole' | 'washout';
  /** Width (m) of the pale rim of a marked one; 0 when unmarked. */
  rim: number;
  /** A pothole's centre: metres along the track and left of the point. */
  centre?: readonly [number, number];
}

/** The pothole or washout nearest a point, or null when none comes within `reach` (m). */
export function roughPatch(rough: TrackRoughness, s: number, l: number, reach: number): RoughPatch | null {
  let best: RoughPatch | null = null;
  const consider = (dist: number, size: number, depth: number, patch: Omit<RoughPatch, 'edge' | 'rim'>) => {
    const marked = depth >= MARKED_DEPTH;
    const edge = dist - size * (marked ? MARK_RIM : INNER);
    if (edge < reach && edge < (best?.edge ?? Infinity))
      best = { ...patch, edge, rim: marked ? size * (MARK_RIM - 0.9) : 0 };
  };
  for (const p of rough.potholes) {
    if (Math.abs(s - p.s) > p.radius * MARK_RIM + reach) continue;
    consider(Math.hypot(s - p.s, l - p.l), p.radius, p.depth, {
      kind: 'pothole',
      centre: [p.s - s, p.l - l],
    });
  }
  for (const w of rough.washouts) consider(washoutDistance(w, s, l), w.half, w.depth, { kind: 'washout' });
  return best;
}

/** Mud holes stretch this far along the track (m)... */
const BOG_LENGTH = [7, 12] as const;
/** ...settle into the lowest spot within this far (m) of where they fall... */
const BOG_SNAP = 6;
/** ...and lie only where the track climbs less than this (rise per metre). */
const BOG_MAX_GRADE = 0.06;
/**
 * A mud hole is a deep bog when the ground all round it this far (m) out stands at least
 * this much (m) higher: a hollow the water runs into and can't drain out of.
 */
const SUMP_RING = 18;
const SUMP_RIM = 0.25;
/** A deep bog stretches this far along the track (m), and comes no sooner than this (m) after another. */
const SUMP_LENGTH = [12, 18] as const;
const SUMP_SPACING = 300;
/**
 * A long boggy stretch runs this far (m), as a chain of hollows this far apart, each this
 * long, following the track while it climbs less than this (rise per metre over 8 m).
 */
const LONG_BOG_LENGTH = [25, 45] as const;
const LONG_BOG_STEP = 7;
const LONG_BOG_LINK = 11;
const LONG_BOG_MAX_GRADE = 0.05;

/**
 * Mud holes in a rough track's dips: hollows across the track's width, deepest in the
 * middle, laid along it, in the lowest spot of the graded ground (`heightAt`) nearby on the
 * flatter stretches. One in a hollow the ground all round drains into is a deep bog with a
 * sticky floor; a share of the others are long boggy stretches. Both have trees to winch
 * from. `skip` rules out a point (by a creek, on a bridge).
 */
export function trackMudHoles(
  track: TrackInfo,
  seed: number,
  heightAt: (x: number, z: number) => number,
  skip: (x: number, z: number, s: number) => boolean,
): BogDef[] {
  const r = track.def.rough;
  if (!r?.bogs) return [];
  const rand = mulberry32(seed);
  // Which holes stay in is drawn separately, so leaving some out moves none of the others.
  const keepRand = mulberry32(seed * 7 + 3);
  const keep = (share: number | undefined) => keepRand() < (share ?? 1);
  const { poly } = track;
  const out: BogDef[] = [];
  let count = 0;
  const gap = 100 / r.bogs;
  const last = poly.count - 1;
  // The graded profile, without its bumps and potholes, so how rough a track is never moves its bogs.
  const centre = (k: number) => track.profile[k];
  const grade = (a: number, b: number) =>
    Math.abs(track.profile[Math.min(last, b)] - track.profile[Math.max(0, a)]) /
    Math.max(1, poly.s[Math.min(last, b)] - poly.s[Math.max(0, a)]);
  const hole = (k: number, length: number, depth: number, deep: boolean, winchTrees: boolean): BogDef => {
    const half = Math.round(Math.max(5, length / 4));
    const [a, b] = [Math.max(0, k - half), Math.min(last, k + half)];
    const heading = Math.atan2(poly.xs[b] - poly.xs[a], -(poly.zs[b] - poly.zs[a]));
    return {
      id: `${track.def.id}-mud-${count++}`,
      x: poly.xs[k],
      z: poly.zs[k],
      // Across the track (the bog's x) and along it (its z), turned to the track's heading.
      radiusX: track.def.width / 2 + (deep ? 0.8 : 0.3),
      radiusZ: length / 2,
      rotationDeg: (heading * 180) / Math.PI,
      depth,
      deep: deep || undefined,
      winchTrees: winchTrees || undefined,
    };
  };
  let lastDeep = -Infinity;
  let [sumps, longs] = [0, 0];
  for (let s = CLEAR_ENDS + 6 + rand() * gap; s < poly.length - CLEAR_ENDS - 6; s += gap * (0.5 + rand())) {
    // Settle into the lowest spot nearby.
    let k = Math.round(s);
    for (let j = Math.max(1, k - BOG_SNAP); j <= Math.min(last - 1, k + BOG_SNAP); j++)
      if (centre(j) < centre(k)) k = j;
    const x = poly.xs[k];
    const z = poly.zs[k];
    const [pickLength, pickDepth, pickLong] = [rand(), rand(), rand()];
    if (grade(k - 5, k + 5) > BOG_MAX_GRADE || skip(x, z, poly.s[k])) continue;
    // In a hollow the ground all round drains into, it's a deep bog.
    let rim = Infinity;
    for (let q = 0; q < 16; q++) {
      const angle = (q / 16) * Math.PI * 2;
      rim = Math.min(rim, heightAt(x + Math.cos(angle) * SUMP_RING, z + Math.sin(angle) * SUMP_RING));
    }
    if (r.sumpDepth !== undefined && rim > centre(k) + SUMP_RIM && poly.s[k] - lastDeep > SUMP_SPACING) {
      lastDeep = poly.s[k];
      // Past the track's quota a hollow is left as firm ground.
      if (++sumps > (r.sumps ?? Infinity)) continue;
      const length = SUMP_LENGTH[0] + pickLength * (SUMP_LENGTH[1] - SUMP_LENGTH[0]);
      out.push(hole(k, length, r.sumpDepth * (0.85 + 0.15 * pickDepth), true, true));
      continue;
    }
    const depth = (r.bogDepth ?? 0.25) * (0.7 + 0.3 * pickDepth);
    if (pickLong < (r.longBogs ?? 0)) {
      // A chain of hollows along the track either way from here while it stays flat and clear.
      const want = LONG_BOG_LENGTH[0] + pickLength * (LONG_BOG_LENGTH[1] - LONG_BOG_LENGTH[0]);
      const ok = (j: number) =>
        poly.s[j] > CLEAR_ENDS + 6 &&
        poly.s[j] < poly.length - CLEAR_ENDS - 6 &&
        grade(j - 4, j + 4) < LONG_BOG_MAX_GRADE &&
        !skip(poly.xs[j], poly.zs[j], poly.s[j]);
      let [from, to] = [k, k];
      while (to - from < want - LONG_BOG_LINK) {
        const grew = [to + LONG_BOG_STEP, from - LONG_BOG_STEP].find((j) => j >= 0 && j <= last && ok(j));
        if (grew === undefined) break;
        if (grew > to) to = grew;
        else from = grew;
      }
      if (to - from + LONG_BOG_LINK >= LONG_BOG_LENGTH[0]) {
        const kept = ++longs <= (r.longBogsKept ?? Infinity);
        for (let j = from; j <= to; j += LONG_BOG_STEP) {
          const h = hole(
            j,
            LONG_BOG_LINK,
            depth * (0.85 + 0.3 * rand()),
            false,
            j === from || j + LONG_BOG_STEP > to,
          );
          if (kept) out.push(h);
        }
        s = Math.max(s, poly.s[to] + LONG_BOG_LINK);
        continue;
      }
    }
    const plain = hole(k, BOG_LENGTH[0] + pickLength * (BOG_LENGTH[1] - BOG_LENGTH[0]), depth, false, false);
    if (keep(r.plainBogs)) out.push(plain);
  }
  return out;
}

/** Distance across a washout's channel, which runs over the track at its angle. */
function washoutDistance(w: Washout, s: number, l: number): number {
  return Math.abs(s - w.s - l * w.skew) * w.cos;
}
