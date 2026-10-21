import type {
  BoulderDef,
  ClearingDef,
  CrawlTrailDef,
  PoiDef,
  TrackDef,
  TrackStepsDef,
  TrailStoneDef,
  XZ,
} from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';
import { boulder, headingOf } from './courseKit';

/**
 * Winch climbs: steep pitches too rocky or too greasy to drive, zig-zagging up a slope.
 * Each pitch ends on a gentle landing where the track turns for the next pitch, and a
 * marked anchor boulder stands straight ahead of the pitch just past the turn. Hook the
 * winch to it from the bottom of the pitch, reel in with a little throttle, stop on the
 * landing, turn and hook up to the next one. The pull is always straight up the pitch,
 * and the next anchor is always within reach of the 30 m cable.
 *
 * Rock climbs are granite with a bevelled riser 0.7 m tall every 5 m: too tall for a tyre
 * on a slope that steep, but the winch drags the car over and the ground behind each riser
 * stays up, so nothing hangs on its belly. Mud climbs are wet clay at about 26–29°: mud
 * grips about half as well as dirt and drags at the tyres, so nothing drives up more than
 * about 20° of it.
 */
export interface WinchClimbSpec {
  id: string;
  name: string;
  kind: 'rock' | 'mud';
  /** Bottom and top of the climb; the track zig-zags between them. */
  from: XZ;
  to: XZ;
  /** Number of pitches; each ends on a landing, the last one at the top. */
  pitches: number;
  /** Which way the first pitch angles off the line from bottom to top (+1: right). */
  firstSide?: 1 | -1;
  hint: string;
  /** Where the climb leads, for its place on the paper map. */
  leadsTo: string;
}

export interface WinchClimb extends WinchClimbSpec {
  track: TrackDef;
  trail: CrawlTrailDef;
  /** One per pitch, straight ahead of it past the landing at its top. */
  anchors: BoulderDef[];
  clearings: ClearingDef[];
  poi: PoiDef;
  /** [from, to] metres along the track of each pitch, bottom first. */
  pitchRanges: Array<readonly [number, number]>;
  /** Metres along the track of the turn in each landing (the last one at the top). */
  turns: number[];
}

const WIDTH = 3.8;
const SHOULDER = 2.4;
/**
 * Rock steps on the rock pitches: a riser every `spacing` metres, `vertical` metres
 * sheer then bevelled at `bevelDeg`. Measured headlessly: 0.7 m risers every 5 m on a
 * 24° tread stop every vehicle driving in low range with both lockers, and the winch
 * pulls each of them over.
 */
export const LEDGE = { rise: 0.7, spacing: 5, vertical: 0.2, bevelDeg: 75 };
/** Each pitch angles this far off the line from bottom to top, alternating sides (degrees). */
const ZIG = 24;
/** The level bay at the bottom, each landing, and the run-out at the top (m). */
export const RUN_IN = 6;
const LANDING = 7.5;
const RUN_OUT = 16;
/**
 * Anchors stand this far past the turn, straight on from the pitch below (m), on a knoll
 * high enough that the cable runs up the line of the pitch. From an anchor on the flat
 * the cable would pull the nose down into the rock steps.
 */
const ANCHOR_REACH = 5.5;
/** Rock climbs need the cable to lift the nose over the steps; mud climbs don't. */
const KNOLL = { radius: 4, height: { rock: 2.8, mud: 1.2 } };

export function winchClimb(spec: WinchClimbSpec): WinchClimb {
  const [bx, bz] = spec.from,
    [tx, tz] = spec.to;
  const D = Math.hypot(tx - bx, tz - bz);
  const ax = (tx - bx) / D,
    az = (tz - bz) / D;
  const phi = (ZIG * Math.PI) / 180;
  const n = spec.pitches;
  // Every leg angles phi off the line, so the path is D / cos(phi) long.
  const pitch = (D / Math.cos(phi) - RUN_IN - RUN_OUT - n * LANDING) / n;
  const side = (i: number) => (spec.firstSide ?? 1) * (i % 2 ? -1 : 1);
  // Leg i heads phi to the right (side +1) or left of the line; right is (-az, ax).
  const dir = (i: number) => [
    ax * Math.cos(phi) - az * Math.sin(phi) * side(i),
    az * Math.cos(phi) + ax * Math.sin(phi) * side(i),
  ];
  const raw: Array<[number, number]> = [[0, 0]];
  const at = (from: [number, number], d: number[], len: number): [number, number] => [
    from[0] + d[0] * len,
    from[1] + d[1] * len,
  ];
  let cursor = at([0, 0], dir(0), RUN_IN);
  raw.push(cursor);
  const turnsRaw: Array<[number, number]> = [];
  const anchorsRaw: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    cursor = at(cursor, dir(i), pitch);
    raw.push(cursor);
    const turn = at(cursor, dir(i), LANDING / 2);
    turnsRaw.push(turn);
    anchorsRaw.push(at(turn, dir(i), ANCHOR_REACH));
    raw.push(turn);
    cursor = at(turn, dir(i + 1), i < n - 1 ? LANDING / 2 : RUN_OUT);
    raw.push(cursor);
  }
  // Turn and stretch the zig-zag about its start so it ends exactly at the top.
  const [ex, ez] = cursor;
  const wantX = tx - bx,
    wantZ = tz - bz;
  const k = Math.hypot(wantX, wantZ) / Math.hypot(ex, ez);
  const rot = Math.atan2(wantZ, wantX) - Math.atan2(ez, ex);
  const place = ([x, z]: [number, number]): XZ => [
    bx + k * (x * Math.cos(rot) - z * Math.sin(rot)),
    bz + k * (x * Math.sin(rot) + z * Math.cos(rot)),
  ];
  const points = raw.map(place);
  const poly = densify(points, 1);
  const L = poly.length;
  // Distance along the track of each control point.
  const sOf = (index: number) => {
    let best = 0;
    for (let j = 0; j < poly.count; j++)
      if (Math.abs(poly.u[j] - index) < Math.abs(poly.u[best] - index)) best = j;
    return poly.s[best];
  };
  // Control points: start, then per pitch [pitch start, pitch end, turn, landing end].
  const pitchRanges: Array<readonly [number, number]> = [];
  const landings: Array<readonly [number, number]> = [[0, sOf(1)]];
  const turns: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = sOf(1 + 3 * i),
      end = sOf(2 + 3 * i);
    pitchRanges.push([start, end]);
    turns.push(sOf(3 + 3 * i));
    landings.push([end, i < n - 1 ? sOf(4 + 3 * i) : L]);
  }
  const steps: TrackStepsDef[] =
    spec.kind === 'rock'
      ? pitchRanges.map(([from, to]) => ({
          // The first riser waits until the car is right onto the pitch.
          from: from + 5,
          to: to - 2,
          spacing: LEDGE.spacing,
          rise: LEDGE.rise,
          stair: { vertical: LEDGE.vertical, bevelDeg: LEDGE.bevelDeg },
        }))
      : [];
  const anchors: BoulderDef[] = anchorsRaw.map((p) => {
    const [x, z] = place(p);
    return { x, z, radius: 1.4, sink: 0.25, anchor: true };
  });
  const track: TrackDef = {
    id: spec.id,
    name: spec.name,
    points,
    width: WIDTH,
    shoulder: SHOULDER,
    smooth: 3,
    surface: spec.kind,
    ruts: 0,
    camber: 0.1,
    landings,
    landingGrade: 2,
    steps,
    knolls: anchors.map((a, i) => ({
      x: a.x,
      z: a.z,
      at: turns[i],
      radius: KNOLL.radius,
      height: KNOLL.height[spec.kind],
    })),
  };
  // Loose rock beside the rock pitches, well clear of the line and off the landings.
  const stones: TrailStoneDef[] =
    spec.kind === 'rock'
      ? pitchRanges.flatMap(([from, to], i) => [
          boulder((from + to) / 2, (i % 2 ? -1 : 1) * (WIDTH / 2 + 2.6), 0.75, 1.3, 1.5, i * 41),
          boulder(to - 1.5, (i % 2 ? 1 : -1) * (WIDTH / 2 + 2.8), 0.6, 1.1, 1.3, i * 67),
        ])
      : [];
  const trail: CrawlTrailDef = {
    id: spec.id,
    name: spec.name,
    trackId: spec.id,
    difficulty: 'extreme',
    winchClimb: true,
    sections: [{ from: 0, to: L, name: 'Winch climb', hint: spec.hint, rocks: [], stones, logs: [] }],
  };
  const clearings: ClearingDef[] = [];
  for (let s = 0; s <= L; s += 8) {
    const p = pointAt(poly, s);
    clearings.push({ x: p.x, z: p.z, radius: 16 });
  }
  const mid = pointAt(poly, L * 0.45),
    start = pointAt(poly, 0);
  const poi: PoiDef = {
    id: spec.id,
    name: spec.name,
    kind: 'feature',
    x: mid.x,
    z: mid.z,
    radius: Math.min(28, D / 2 + 4),
    reset: { x: start.x, z: start.z, headingDeg: headingOf(start) },
    note: `WINCH · ${spec.kind === 'rock' ? 'Rocky' : 'Muddy'} climb to ${spec.leadsTo}. ${spec.hint}`,
  };
  return { ...spec, track, trail, anchors, clearings, poi, pitchRanges, turns };
}

const rockHint =
  'Granite too steep to drive, with ledges taller than your tyres can climb. Hook the winch to the marked boulder straight ahead (E), reel in (R) with a little throttle in low range, stop on the landing, turn and hook up to the next one.';
const mudHint =
  'Wet clay too steep and greasy to drive: the tyres just spin. Hook the winch to the marked boulder straight ahead (E), reel in (R) with a little throttle, stop on the landing, turn and hook up to the next one.';

export const winchClimbs: WinchClimb[] = (
  [
    {
      id: 'granite-steps',
      name: 'Granite Steps',
      kind: 'rock',
      from: [-420, 108],
      to: [-345, -26],
      firstSide: -1,
      pitches: 8,
      hint: rockHint,
      leadsTo: 'The Shelf',
    },
    {
      id: 'slippery-dip',
      name: 'Slippery Dip',
      kind: 'mud',
      from: [380, 104],
      to: [440, -25],
      firstSide: -1,
      pitches: 6,
      hint: mudHint,
      leadsTo: 'The Shelf',
    },
    {
      id: 'greasy-pole',
      name: 'Greasy Pole',
      kind: 'mud',
      from: [690, 127],
      to: [690, -42],
      firstSide: -1,
      pitches: 8,
      hint: mudHint,
      leadsTo: 'The Shelf',
    },
    {
      id: 'devils-ladder',
      name: "Devil's Ladder",
      kind: 'rock',
      from: [50, -341],
      to: [163, -472],
      pitches: 8,
      firstSide: -1,
      hint: rockHint,
      leadsTo: 'the range top',
    },
    {
      id: 'goat-track',
      name: 'Goat Track',
      kind: 'rock',
      from: [-770, -346],
      to: [-667, -468],
      pitches: 8,
      firstSide: -1,
      hint: rockHint,
      leadsTo: 'the range top',
    },
    {
      id: 'eagle-rock-climb',
      name: 'Eagle Rock',
      kind: 'rock',
      from: [360, -578],
      to: [424, -655],
      firstSide: -1,
      pitches: 5,
      hint: `${rockHint} The only way onto Eagle Rock.`,
      leadsTo: 'the Eagle Rock lookout',
    },
    {
      id: 'hut-spur',
      name: 'Hut Spur',
      kind: 'mud',
      from: [-538, -86],
      to: [-596, -160],
      pitches: 4,
      hint: `${mudHint} Clay Knoll is greasy all round; this is the marked way up to the old hut.`,
      leadsTo: 'Stockman’s Hut',
    },
    {
      id: 'bullock-track',
      name: 'Bullock Track',
      kind: 'mud',
      from: [222, 448],
      to: [248, 560],
      pitches: 5,
      hint: mudHint,
      leadsTo: 'the top of Wombat Hill',
    },
  ] as const satisfies readonly WinchClimbSpec[]
).map(winchClimb);
