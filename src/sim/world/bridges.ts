import type { GateDef, TrackBridgeDef, TrackDef } from './mapTypes';
import type { GateInfo, StaticTimber, TrackInfo } from './features';
import { locate, pointAt, segmentDistance } from './polyline';
import type { Terrain } from './terrain';

/**
 * Timber bridges on tracks and the gates of a gate trail. A bridge's deck is a row of
 * box-shaped hulls whose vertices are both drawn and used as convex colliders, like the
 * trail rocks, so the tyres run on exactly the boards you see.
 */

/** The deck boards stand this far above the graded track at the abutments. */
export const DECK_LIFT = 0.05;
const DECK_THICKNESS = 0.2;
/** The deck runs this far onto the graded track at each end, ramping up from it. */
export const BEARING = 0.8;
/** Longest deck hull along the track; ramps and curves are made of these. */
const SEGMENT = 1.5;
const KERB_WIDTH = 0.14;
const POST_SPACING = 2.4;

/** The bridge carrying a track `s` metres along it, if there is one. */
export function onBridge(def: TrackDef, s: number): TrackBridgeDef | undefined {
  return def.bridges?.find((b) => s > b.from && s < b.to);
}

function profileAt(track: TrackInfo, s: number): number {
  const { i, f } = locate(track.poly, s);
  const p = track.profile;
  return p[i] + (p[Math.min(p.length - 1, i + 1)] - p[i]) * f;
}

/** Height of the top of the deck `s` metres along the track. */
export function deckTop(track: TrackInfo, b: TrackBridgeDef, s: number): number {
  const base = profileAt(track, s);
  if (s <= b.from) return base - 0.03 + (DECK_LIFT + 0.03) * Math.max(0, 1 - (b.from - s) / BEARING);
  if (s >= b.to) return base - 0.03 + (DECK_LIFT + 0.03) * Math.max(0, 1 - (s - b.to) / BEARING);
  const ramp = b.ramp ?? 0;
  const climb = b.rise && ramp > 0 ? b.rise * Math.min(1, (s - b.from) / ramp, (b.to - s) / ramp) : 0;
  return base + DECK_LIFT + climb;
}

/** Lateral extents [left, right] of the running surface (metres right of the centreline). */
function strips(b: TrackBridgeDef): Array<[number, number]> {
  if (b.kind === 'deck') return [[-b.width / 2, b.width / 2]];
  const g = (b.gauge ?? 1.48) / 2;
  return [
    [-g - b.width / 2, -g + b.width / 2],
    [g - b.width / 2, g + b.width / 2],
  ];
}

type V3 = [number, number, number];

/** A closed hull from eight corners: top a, b, c, d (start-left, start-right, end-right, end-left), then the same below. */
function hull(part: StaticTimber['part'], corners: V3[], keepTop = false): StaticTimber {
  const c = corners.reduce((m, p) => [m[0] + p[0] / 8, m[1] + p[1] / 8, m[2] + p[2] / 8], [0, 0, 0]);
  const rel = corners.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]] as V3);
  const faces = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [3, 2, 6, 7],
    [0, 3, 7, 4],
    [1, 5, 6, 2],
  ];
  const indices: number[] = [];
  for (const [a, b, cc, d] of faces)
    for (const [i, j, k] of [
      [a, b, cc],
      [a, cc, d],
    ]) {
      const [p, q, r] = [rel[i], rel[j], rel[k]];
      const n = [
        (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]),
        (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]),
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]),
      ];
      // Wind each face outwards from the middle of the hull.
      const out = n[0] * (p[0] + q[0] + r[0]) + n[1] * (p[1] + q[1] + r[1]) + n[2] * (p[2] + q[2] + r[2]);
      indices.push(...(out >= 0 ? [i, j, k] : [i, k, j]));
    }
  return {
    part,
    x: c[0],
    y: c[1],
    z: c[2],
    vertices: Float32Array.from(rel.flat()),
    indices: Uint32Array.from(indices),
    ...(keepTop ? { top: rel.slice(0, 4) } : {}),
  };
}

/** World point `s` metres along a track and `lateral` metres to its right. */
function at(track: TrackInfo, s: number, lateral: number): { x: number; z: number; dx: number; dz: number } {
  const p = pointAt(track.poly, s);
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, dx: p.dx, dz: p.dz };
}

/**
 * A slab between distances s0 and s1 and laterals l0..l1, its top `top(s)` and its
 * bottom `depth` below that.
 */
function slab(
  track: TrackInfo,
  part: StaticTimber['part'],
  s0: number,
  s1: number,
  l0: number,
  l1: number,
  top: (s: number) => number,
  depth: number,
): StaticTimber {
  const corner = (s: number, l: number, y: number): V3 => {
    const p = at(track, s, l);
    return [p.x, y, p.z];
  };
  const t0 = top(s0),
    t1 = top(s1);
  return hull(
    part,
    [
      corner(s0, l0, t0),
      corner(s0, l1, t0),
      corner(s1, l1, t1),
      corner(s1, l0, t1),
      corner(s0, l0, t0 - depth),
      corner(s0, l1, t0 - depth),
      corner(s1, l1, t1 - depth),
      corner(s1, l0, t1 - depth),
    ],
    part === 'deck',
  );
}

/** A vertical post `size` square at (s, lateral), from `bottom` up to `top`, squared to the track. */
function post(track: TrackInfo, s: number, lateral: number, bottom: number, top: number, size = 0.16) {
  const h = size / 2;
  return slab(track, 'post', s - h, s + h, lateral - h, lateral + h, () => top, top - bottom);
}

/** Deck, kerbs, stringers, posts, headstocks and sills of every bridge on a track. */
export function bridgeTimbers(track: TrackInfo, terrain: Terrain): StaticTimber[] {
  const out: StaticTimber[] = [];
  for (const b of track.def.bridges ?? []) {
    const ramp = b.ramp ?? 0;
    // Break the deck where its slope changes, then into short pieces.
    const marks = [b.from - BEARING, b.from, b.to, b.to + BEARING];
    if (b.rise && ramp > 0) marks.push(b.from + ramp, b.to - ramp);
    marks.sort((p, q) => p - q);
    const cuts: number[] = [];
    for (let i = 0; i + 1 < marks.length; i++) {
      const n = Math.max(1, Math.ceil((marks[i + 1] - marks[i]) / SEGMENT));
      for (let k = 0; k < n; k++) cuts.push(marks[i] + ((marks[i + 1] - marks[i]) * k) / n);
    }
    cuts.push(marks[marks.length - 1]);
    const top = (s: number) => deckTop(track, b, s);
    const lanes = strips(b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [s0, s1] = [cuts[i], cuts[i + 1]];
      const inSpan = s0 >= b.from - 1e-6 && s1 <= b.to + 1e-6;
      for (const [l0, l1] of lanes) {
        out.push(slab(track, 'deck', s0, s1, l0, l1, top, DECK_THICKNESS));
        if (!inSpan) continue;
        // Two stringers under each lane carry the boards between the posts.
        for (const l of l1 - l0 > 1.2 ? [l0 + 0.35, l1 - 0.35] : [(l0 + l1) / 2])
          out.push(slab(track, 'beam', s0, s1, l - 0.1, l + 0.1, (s) => top(s) - DECK_THICKNESS, 0.24));
      }
      if (inSpan && b.kerb) {
        const outer: Array<[number, number]> = [
          [lanes[0][0], lanes[0][0] + KERB_WIDTH],
          [lanes[lanes.length - 1][1] - KERB_WIDTH, lanes[lanes.length - 1][1]],
        ];
        for (const [l0, l1] of outer)
          out.push(slab(track, 'kerb', s0, s1, l0, l1, (s) => top(s) + b.kerb!, b.kerb + 0.02));
      }
    }
    // Sills under each end, dug into the abutment.
    const left = lanes[0][0] - 0.15,
      right = lanes[lanes.length - 1][1] + 0.15;
    for (const s of [b.from, b.to])
      out.push(slab(track, 'beam', s - 0.18, s + 0.18, left, right, () => top(s) - DECK_THICKNESS, 0.9));
    // Posts on headstocks wherever the deck stands clear of the ground.
    const span = b.to - b.from;
    const n = Math.max(1, Math.round(span / POST_SPACING));
    for (let k = 1; k < n; k++) {
      const s = b.from + (span * k) / n;
      const under = top(s) - DECK_THICKNESS - 0.24;
      const legs = lanes.flatMap(([l0, l1]) => (l1 - l0 > 1.2 ? [l0 + 0.2, l1 - 0.2] : [(l0 + l1) / 2]));
      let lowest = Infinity;
      for (const l of legs) {
        const p = at(track, s, l);
        lowest = Math.min(lowest, terrain.heightAt(p.x, p.z));
      }
      if (under - lowest < 0.15) continue;
      out.push(slab(track, 'beam', s - 0.1, s + 0.1, left, right, () => under, 0.2));
      for (const l of legs) {
        const p = at(track, s, l);
        out.push(post(track, s, l, terrain.heightAt(p.x, p.z) - 0.4, under - 0.2));
      }
    }
  }
  return out;
}

/** Height of the bridge deck at (x, z), or null where there is no deck. */
export function deckAt(tracks: readonly TrackInfo[], x: number, z: number): number | null {
  let best: number | null = null;
  for (const track of tracks) {
    if (!track.def.bridges) continue;
    const poly = track.poly;
    let near = { d: Infinity, s: 0, lateral: 0 };
    for (let i = 0; i + 1 < poly.count; i++) {
      const hit = segmentDistance(x, z, poly.xs[i], poly.zs[i], poly.xs[i + 1], poly.zs[i + 1]);
      // The side is positive to the right of the direction of travel.
      if (hit.d < near.d)
        near = {
          d: hit.d,
          s: poly.s[i] + (poly.s[i + 1] - poly.s[i]) * hit.t,
          lateral: Math.sign(hit.side) * hit.d,
        };
    }
    for (const b of track.def.bridges) {
      if (near.s < b.from - BEARING || near.s > b.to + BEARING) continue;
      if (!strips(b).some(([l0, l1]) => near.lateral >= l0 && near.lateral <= l1)) continue;
      const y = deckTop(track, b, near.s);
      best = best === null ? y : Math.max(best, y);
    }
  }
  return best;
}

/** Where each gate's two flags stand: square across its track, at ground height. */
export function gateInfos(
  gates: readonly GateDef[],
  tracks: readonly TrackInfo[],
  terrain: Terrain,
): GateInfo[] {
  return gates.map((g) => {
    const track = tracks.find((t) => t.def.id === g.trackId);
    if (!track) throw new Error(`Gate ${g.n} is on a missing track ${g.trackId}`);
    const lateral = g.lateral ?? 0;
    const flag = (l: number) => {
      const p = at(track, g.at, l);
      return { x: p.x, y: terrain.heightAt(p.x, p.z), z: p.z };
    };
    const p = pointAt(track.poly, g.at);
    return {
      n: g.n,
      trackId: g.trackId,
      headingDeg: (Math.atan2(p.dx, -p.dz) * 180) / Math.PI,
      left: flag(lateral - g.width / 2),
      right: flag(lateral + g.width / 2),
    };
  });
}
