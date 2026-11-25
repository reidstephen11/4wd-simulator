import type {
  BogDef,
  BoulderDef,
  FlatDef,
  HillDef,
  PoiDef,
  PropDef,
  TrackDef,
  TrailStoneDef,
  XZ,
} from '../../sim/world/mapTypes';
import { densify, pointAt } from '../../sim/world/polyline';
import {
  banks,
  boulder,
  endSign,
  gradedLine,
  headingOf,
  rockStep,
  slab,
  tread,
  type GradedLine,
} from '../courseKit';

/** A track control point; an optional third value pins the track height there. */
export type Waypoint = readonly [number, number] | readonly [number, number, number];

/**
 * The knoll at Ironbark Creek: a 25 m top east of the creek with a loop track right round
 * it. Lines leave the loop for the summit or come back down to it, and two more hang off
 * the loop on the flat. The lines are the ones built for Over the Cape's knoll play area
 * (its v1.47 to v1.57), moved here; the heights where they join the loop are measured on
 * this map (scripts/level-heights.ts).
 *   - Rock climb: straight up the south face on rock all the way: ledges, slab, notch
 *   - Switchbacks: up the east face in tight hairpins
 *   - Side slope: round the west flank, leaning out over the drop, and down to the loop
 *   - The drop: down the north-west face and off a near-vertical lip into a mud hole
 *   - Steep descent: straight down the north face through erosion ruts
 *   - Axle twisters: holes and mounds under alternate wheels, south of the top
 *   - Bog trench: a long bog sunk between high clay walls, on the flat north-east of the top
 * Coordinates in metres: x = east, z = south (north is -z).
 */

/** The top. */
const TOP = { x: 50, z: 10 };
const TOP_RADIUS = 88;
const TOP_HEIGHT = 25;
/** Radius of the level ground on the summit, where the lines meet. */
const SUMMIT = 12;

export const knollHills: HillDef[] = [
  { id: 'knoll-east-top', x: TOP.x, z: TOP.z, radius: TOP_RADIUS, height: TOP_HEIGHT, shape: 'dome' },
];

/** A point `r` metres from the top's centre, on a bearing `az` degrees clockwise from north. */
const polar = (r: number, az: number): XZ => {
  const a = (az * Math.PI) / 180;
  return [Math.round((TOP.x + r * Math.sin(a)) * 10) / 10, Math.round((TOP.z - r * Math.cos(a)) * 10) / 10];
};

/**
 * The loop round the top, clockwise from its south-west corner: east along the south side,
 * north up the east side, west along the north side, then south down the creek's east bank
 * (where the three crossings leave it) and back to the start.
 */
export const knollLoop: Waypoint[] = [
  [-85, 183],
  [-35, 175],
  [15, 165],
  [65, 157],
  [115, 145],
  [158, 117],
  [179, 67],
  [183, 5],
  [177, -53],
  [151, -95],
  [95, -115],
  [35, -118],
  [-25, -118],
  [-62, -112],
  [-84, -90],
  [-90, -60],
  [-91, -20],
  [-92, 40],
  [-90, 90],
  [-90, 140],
  [-92, 165],
  [-85, 183],
];

/** Nearest point on the loop to (x, z), so a line can leave or join it exactly. */
function onLoop(x: number, z: number): XZ {
  const poly = densify(
    knollLoop.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  let best = 0;
  for (let k = 0; k < poly.count; k++)
    if (Math.hypot(poly.xs[k] - x, poly.zs[k] - z) < Math.hypot(poly.xs[best] - x, poly.zs[best] - z))
      best = k;
  return [Math.round(poly.xs[best] * 100) / 100, Math.round(poly.zs[best] * 100) / 100];
}

/**
 * A line's end on the loop, pinned to the loop's graded height there (measured), so the
 * line's own grading does not leave a ridge across the loop where they meet.
 */
const joinLoop = (x: number, z: number, height: number): Waypoint => [...onLoop(x, z), height];

/** Metres along a line to its control point `index`. */
function arcAt(points: readonly Waypoint[], index: number): number {
  const poly = densify(
    points.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  let best = 0;
  for (let k = 0; k < poly.count; k++)
    if (Math.abs(poly.u[k] - index) < Math.abs(poly.u[best] - index)) best = k;
  return poly.s[best];
}

// ---------------------------------------------------------------------------------------
// Rock climb: straight up the south face, on rock from the loop to the summit, the way a
// real rock hill climb is (v1.57): broken granite at the foot, a staircase of ledges, an
// off-camber slab, a V-notch between two whalebacks, then the steep pitch of tall split
// ledges and one full-width crux below the top. Boulders line both sides the whole way.
export const rockClimb: Waypoint[] = [
  joinLoop(63, 157, 11.84),
  [61, 130],
  [57, 100],
  [54, 73],
  [52, 47],
  polar(SUMMIT, 180),
];
const pitch = arcAt(rockClimb, 3);

/** Granite bedded in the track: rows of low rocks across it, staggered so no wheel runs clear. */
function brokenGranite(from: number, to: number): TrailStoneDef[] {
  const out: TrailStoneDef[] = [];
  for (let at = from, k = 0; at <= to; at += 1.7, k++) {
    const lanes = k % 2 ? [-1.2, 0, 1.2] : [-0.6, 0.6];
    lanes.forEach((lateral, j) => {
      const n = k * 3 + j;
      const h = 0.14 + ((n * 7) % 5) * 0.045;
      const w = 0.8 + ((n * 5) % 3) * 0.2;
      out.push(boulder(at + ((n * 3) % 4) * 0.15, lateral, h + 0.15, w, w * 1.2, n * 41, -0.15));
    });
  }
  return out;
}

/** Low flat sheets of bedrock in two lanes, so no smooth track shows between the ledges. */
function bedrock(from: number, to: number): TrailStoneDef[] {
  const out: TrailStoneDef[] = [];
  for (let at = from, k = 0; at <= to; at += 2, k++)
    for (const lateral of [-0.85, 0.85]) {
      const n = k * 2 + (lateral > 0 ? 1 : 0);
      out.push(slab(at + (n % 2) * 0.6, lateral, 0.03 + (n % 3) * 0.01, 1.5, 1.8, 0, ((n * 23) % 30) - 15));
    }
  return out;
}

const rockClimbStones: TrailStoneDef[] = [
  // Broken granite: the foot of the face, rough everywhere but no single big step.
  ...brokenGranite(5, 30),
  // The staircase: a ledge every 3.5 m, some full width, some split so one wheel goes first.
  rockStep(32, 0, 0.28, 4, tread(0.28), 2),
  rockStep(35.5, -1.05, 0.34, 2.1, tread(0.34), -4),
  rockStep(36.2, 1.05, 0.26, 2.1, tread(0.26), 5),
  rockStep(39.5, 0, 0.32, 4, tread(0.32), -3),
  rockStep(43, 1.05, 0.38, 2.1, tread(0.38), 5),
  rockStep(43.8, -1.05, 0.28, 2.1, tread(0.28), -5),
  rockStep(47, 0, 0.34, 4, tread(0.34), 3),
  rockStep(50.5, -1.05, 0.4, 2.1, tread(0.4), -4),
  rockStep(51.3, 1.05, 0.3, 2.1, tread(0.3), 6),
  rockStep(54.5, 0, 0.36, 4, tread(0.36), -2),
  boulder(41.3, 0.8, 0.3, 0.7, 0.8, 20),
  boulder(49, -0.7, 0.3, 0.7, 0.8, 70),
  // The off-camber slab: a long sheet of granite tipped to the left across the track.
  {
    shape: 'ridge',
    at: 64,
    lateral: 0.3,
    width: 4.2,
    length: 12,
    height: 0.45,
    rollDeg: -13,
    profile: [
      [-6, 0.15],
      [-5, 0.45],
      [5, 0.45],
      [6, 0.1],
    ],
  },
  boulder(61, -0.9, 0.28, 0.8, 0.9, 15, 0.3),
  boulder(67, 0.9, 0.24, 0.7, 0.8, 60, 0.38),
  // The V-notch: two whalebacks either side, sloping in, so the wheels ride their flanks.
  {
    shape: 'ridge',
    at: 76,
    lateral: -1.55,
    width: 1.9,
    length: 7,
    height: 0.6,
    rollDeg: 15,
    profile: [
      [-3.5, 0.15],
      [-2, 0.55],
      [2.5, 0.6],
      [3.5, 0.2],
    ],
  },
  {
    shape: 'ridge',
    at: 76.5,
    lateral: 1.55,
    width: 1.9,
    length: 7,
    height: 0.55,
    rollDeg: -15,
    profile: [
      [-3.5, 0.15],
      [-2, 0.5],
      [2.5, 0.55],
      [3.5, 0.2],
    ],
  },

  // Bedrock between the notch and the pitch.
  ...bedrock(81, pitch),
  // The pitch: tall split ledges near 27°, loose rocks on the treads.
  rockStep(pitch + 2, 0, 0.36, 4, tread(0.36), 3),
  rockStep(pitch + 8, -1.05, 0.5, 2.1, tread(0.5), -5),
  rockStep(pitch + 8.8, 1.05, 0.38, 2.1, tread(0.38), 6),
  rockStep(pitch + 15, 1.05, 0.52, 2.1, tread(0.52), 5),
  rockStep(pitch + 15.8, -1.05, 0.4, 2.1, tread(0.4), -6),
  rockStep(pitch + 22, 0, 0.44, 4, tread(0.44), -3),
  rockStep(pitch + 28, -1.05, 0.52, 2.1, tread(0.52), -4),
  rockStep(pitch + 28.8, 1.05, 0.42, 2.1, tread(0.42), 5),
  boulder(pitch + 5, -0.7, 0.3, 0.8, 0.9, 10),
  boulder(pitch + 11.5, 0.8, 0.34, 0.8, 1),
  boulder(pitch + 19, -0.8, 0.32, 0.8, 0.9, 50),
  boulder(pitch + 25, -0.8, 0.34, 0.8, 1),
  // The crux: one full-width ledge below the summit.
  rockStep(pitch + 34, 0, 0.48, 4, tread(0.48), 2),
  // Boulders bank the line from the loop to the summit, so it reads as a rock gully.
  ...banks(6, pitch + 36, 3, 2.7, 1.15),
  ...banks(7.5, pitch + 36, 3, 3.9, 1.5, 0.4),
];

// Switchbacks: up the east face in four legs across the slope, joined by tight hairpins
// that climb from the downhill lane to the uphill one: the turns are the steep part.
const HAIRPIN = 7;
function hairpin(r: number, az: number, turn: 1 | -1): XZ[] {
  // A half circle round a point `r` from the top, from the outer lane (r + 7) to the inner one.
  const a = (az * Math.PI) / 180;
  const out: XZ = [Math.sin(a), -Math.cos(a)];
  const on: XZ = [turn * Math.cos(a), turn * Math.sin(a)];
  const [cx, cz] = polar(r, az);
  return [0, 45, 90, 135, 180].map((deg) => {
    const t = (deg * Math.PI) / 180;
    const k = HAIRPIN;
    return [
      Math.round((cx + k * (Math.cos(t) * out[0] + Math.sin(t) * on[0])) * 10) / 10,
      Math.round((cz + k * (Math.cos(t) * out[1] + Math.sin(t) * on[1])) * 10) / 10,
    ] as XZ;
  });
}
export const switchbacks: Waypoint[] = [
  joinLoop(183, 25, 12.51),
  polar(102, 95),
  polar(88, 105),
  ...hairpin(74, 148, 1),
  polar(66, 95),
  ...hairpin(52, 40, -1),
  polar(44, 95),
  ...hairpin(30, 145, 1),
  polar(20, 115),
  polar(SUMMIT, 90),
];
/** Each hairpin's climb spread along the legs either side, so the turn itself is not a pinch. */
const hairpinGrades = [3, 9, 15].map(
  (k) => [arcAt(switchbacks, k) - 15, arcAt(switchbacks, k + 4) + 25] as const,
);

// Side slope: off the loop below the saddle, round the west flank with the hill on the
// right, leaning the car out towards the knoll, then down the knoll's east flank to the
// loop on its north side.
export const sideSlope: Waypoint[] = [
  joinLoop(-17, 173, 12.68),
  [-9, 137],
  polar(66, 222),
  polar(60, 240),
  polar(56, 258),
  polar(55, 276),
  polar(58, 292),
  [-27, -30],
  [-41, -70],
  joinLoop(-53, -117, 12.55),
];
const flankFrom = arcAt(sideSlope, 2);
const flankTo = arcAt(sideSlope, 5);
/** Coming down the knoll's own east flank it leans the other way, eased back to about 20°. */
const knollFlank = arcAt(sideSlope, 7);

// The drop: off the summit to the north-west, a steep run down the face, then a
// near-vertical lip about two and a half metres high into a mud hole, and out to the loop.
// The ground is pinned at the lip and dropped about 2.3 m in the next 2.5 m, and a band of
// rock across the lip stands 0.7 m above it: the nose goes over a face about 3 m high.
const LIP_HEIGHT = 17.9;
const LIP_FALL = 1.8;
export const theDrop: Waypoint[] = [
  polar(SUMMIT, 318),
  polar(30, 318),
  polar(46, 316),
  [...polar(58, 314), LIP_HEIGHT],
  [...polar(60.5, 313.3), LIP_HEIGHT - 0.5 - LIP_FALL],
  polar(70, 310),
  [-11, -72],
  joinLoop(-19, -118, 11.64),
];
const lip = arcAt(theDrop, 3);

// Steep descent: straight down the north face, through erosion ruts the rain has cut.
export const steepDescent: Waypoint[] = [
  polar(SUMMIT, 0),
  polar(30, 0),
  polar(55, 1),
  polar(80, 2),
  joinLoop(53, -118, 12.13),
];

// Axle twisters: a loop off the loop on the flat south of the top. Holes dug under
// alternate wheels, each with a mound beside it under the other wheel.
export const axleTwisters: Waypoint[] = [
  joinLoop(85, 153, 11.76),
  [89, 173],
  [105, 181],
  [133, 173],
  [151, 157],
  joinLoop(155, 120, 12.44),
];
const twistFrom = arcAt(axleTwisters, 2) - 4;
function twisterPits(from: number, count: number, spacing: number, depth: number, mound: number) {
  return Array.from({ length: count }, (_, k) => {
    const side = k % 2 ? 1 : -1;
    const at = from + k * spacing;
    const spot = (lateral: number, d: number) => ({
      path: [
        [at - 0.85, lateral],
        [at + 0.85, lateral],
      ] as const,
      width: 1.5,
      depth: d,
    });
    // A negative depth raises a mound.
    return [spot(side * 0.8, depth), spot(-side * 0.8, -mound)];
  }).flat();
}

// Bog trench: a long bog sunk a metre and a half between clay walls, off the loop on the
// flat north-east of the top. There is no way round once you are in it.
export const bogTrench: Waypoint[] = [
  joinLoop(179, -30, 13.08),
  [160, -57],
  [127, -70],
  [97, -83],
  joinLoop(83, -116, 11.76),
];
const trenchLength = (() => {
  const poly = densify(
    bogTrench.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  return poly.length;
})();
const TRENCH_DEPTH = 1.4;

const BATTER = 0.5;
const noMud = {
  bumps: 0.12,
  swells: 0.12,
  potholes: 3,
  potholeDepth: 0.25,
  washouts: 3,
  washoutDepth: 0.28,
} as const;

export const knollTracks: TrackDef[] = [
  {
    id: 'knoll-loop',
    name: 'Knoll track',
    points: knollLoop,
    width: 4,
    shoulder: 3,
    batter: BATTER,
    smooth: 8,
    surface: 'clay',
    ruts: 0.06,
    camber: 0.3,
    pinMode: 'follow',
    routeHint: 'Right round the knoll: every line off this track comes back to it',
    rough: noMud,
  },
  {
    id: 'knoll-rock-climb',
    name: 'Rock climb',
    points: rockClimb,
    width: 3.6,
    shoulder: 2,
    batter: BATTER,
    smooth: 4,
    surface: 'rock',
    ruts: 0,
    camber: 0.3,
    pinMode: 'follow',
    pinSmooth: 6,
    stones: rockClimbStones,
    routeHint:
      '8 scored gates uphill. Red flag left, blue right. Start at gate 1; low range, both lockers and crawl. 1000 points: flag −25, missed gate −100, reverse/knock −5, winch −50. Time breaks ties',
  },
  {
    id: 'knoll-switchbacks',
    name: 'Switchbacks',
    points: switchbacks,
    width: 3.4,
    shoulder: 2,
    batter: BATTER,
    smooth: 4,
    surface: 'clay',
    ruts: 0.06,
    camber: 0.4,
    pinMode: 'follow',
    pinSmooth: 6,
    even: hairpinGrades,
    routeHint: 'Tight hairpins: swing wide, use full lock, and back up for a second go if you must',
    rough: { bumps: 0.1, washouts: 4, washoutDepth: 0.26 },
  },
  {
    id: 'knoll-side-slope',
    name: 'Side slope',
    points: sideSlope,
    width: 3.4,
    shoulder: 2,
    batter: BATTER,
    smooth: 4,
    // Hard-packed dirt, not clay: on wet clay at this lean a car only slides off the flank.
    surface: 'dirt',
    ruts: 0.05,
    // It keeps most of the hill's own lean, and a little more is dug in round the flank.
    camber: 1,
    pinMode: 'follow',
    cant: [
      [flankFrom - 10, 0],
      [flankFrom, -5],
      [flankTo, 3],
      [flankTo + 10, 0],
      [knollFlank - 22, 0],
      [knollFlank - 12, -8],
      [knollFlank + 14, -8],
      [knollFlank + 26, 0],
    ],
    routeHint:
      'Leans you out towards the knoll, then down to the loop. Crawl, steer smoothly, never turn downhill',
  },
  {
    id: 'knoll-drop',
    name: 'The drop',
    points: theDrop,
    width: 3.6,
    shoulder: 2,
    batter: BATTER,
    smooth: 2,
    surface: 'clay',
    ruts: 0.04,
    camber: 0.3,
    pinMode: 'follow',
    pinSmooth: 2,
    // The lip: a band of rock across the face, its riser on the downhill side.
    stones: [
      {
        shape: 'ridge',
        at: lip - 1.3,
        lateral: 0,
        width: 4.4,
        length: 3,
        height: 0.7,
        profile: [
          [-1.5, 0.04],
          [1.25, 0.7],
          [1.5, 0.5],
        ],
      },
      boulder(lip - 1, -3, 0.9, 1.6),
      boulder(lip + 0.5, 3.1, 1, 1.7),
    ],
    routeHint:
      'Hard. Low range first, wheels straight, crawl off the lip and let the nose drop. Not a way up',
  },
  {
    id: 'knoll-steep-descent',
    name: 'Steep descent',
    points: steepDescent,
    width: 3.6,
    shoulder: 2,
    batter: BATTER,
    smooth: 4,
    surface: 'clay',
    ruts: 0.05,
    camber: 0.3,
    pinMode: 'follow',
    pinSmooth: 6,
    erosion: [
      {
        path: [
          [14, 0.2],
          [28, 0],
          [40, -0.6],
          [52, -1.3],
          [64, -1.35],
        ],
        width: 0.9,
        depth: 0.45,
      },
      {
        path: [
          [22, 1.45],
          [46, 1.4],
        ],
        width: 0.8,
        depth: 0.38,
      },
    ],
    routeHint:
      'Low range first, crawl, wheels straight. Straddle the ruts; never lock the wheels on the clay',
  },
  {
    id: 'knoll-axle-twisters',
    name: 'Axle twisters',
    points: axleTwisters,
    width: 3.6,
    shoulder: 2,
    batter: BATTER,
    smooth: 4,
    surface: 'dirt',
    ruts: 0.02,
    // Dug level across, so the twist is the holes' and not the hillside's.
    camber: 0.1,
    pinMode: 'follow',
    erosion: twisterPits(twistFrom, 14, 2.5, 0.5, 0.3),
    routeHint:
      'Holes under alternate wheels lift a front and the opposite rear. Lock the rear, or both, and crawl',
  },
  {
    id: 'knoll-bog-trench',
    name: 'Bog trench',
    points: bogTrench,
    width: 3.4,
    shoulder: 0.6,
    // Steep clay walls: once in, there is no way out but along it.
    batter: 1.6,
    smooth: 4,
    surface: 'clay',
    ruts: 0.1,
    camber: 0.2,
    pinMode: 'follow',
    cut: [
      [0, 0],
      [22, TRENCH_DEPTH],
      [trenchLength - 22, TRENCH_DEPTH],
      [trenchLength, 0],
    ],
    routeHint:
      'A long bog between high walls. Lock both, keep moving; the winch is the way out if it stops you',
  },
];

/** The mud hole at the foot of the drop. */
const dropHole: BogDef = (() => {
  const poly = densify(
    theDrop.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  const p = pointAt(poly, lip + 8);
  return {
    id: 'knoll-drop-mud',
    x: Math.round(p.x * 100) / 100,
    z: Math.round(p.z * 100) / 100,
    radiusX: 3.4,
    radiusZ: 4.5,
    rotationDeg: (Math.atan2(p.dx, -p.dz) * 180) / Math.PI,
    depth: 0.35,
  };
})();

/** The bogs in the trench, end to end, deepest in the middle, and the hole below the drop. */
export const knollBogs: BogDef[] = (() => {
  const poly = densify(
    bogTrench.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  const spots: Array<readonly [number, number, number]> = [
    // [metres along, half-length, depth]
    [32, 7, 0.62],
    [46, 8, 0.66],
    [62, 9, 0.72],
    [78, 8, 0.64],
  ];
  return spots
    .map(([at, half, depth], k): BogDef => {
      const p = pointAt(poly, at);
      return {
        id: `knoll-bog-trench-mud-${k}`,
        x: Math.round(p.x * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        radiusX: 3.2,
        radiusZ: half,
        rotationDeg: (Math.atan2(p.dx, -p.dz) * 180) / Math.PI,
        depth,
        deep: true,
        winchTrees: true,
      };
    })
    .concat(dropHole);
})();

export const knollFlats: FlatDef[] = [{ id: 'knoll-top', x: TOP.x, z: TOP.z, radius: SUMMIT, blend: 10 }];

const lines = knollTracks.map((t) => ({ id: t.id, line: gradedLine(t.points, t.width / 2 + t.shoulder) }));
const graded: GradedLine[] = lines.map((l) => l.line);
/** Every knoll line's grading, for placing other things clear of them. */
export const knollGraded: readonly GradedLine[] = graded;
const lineOf = (id: string) => lines.find((l) => l.id === id)!.line;

/**
 * A sign at both ends of each line: the start names it, and the far end says which way it
 * goes, so a player arriving there knows whether it is a way through (v1.50).
 */
const bothEnds = (id: string, start: string, far: string): PropDef[] => [
  endSign(lineOf(id), 0, start, graded),
  endSign(lineOf(id), 1, far, graded),
];
export const knollProps: PropDef[] = [
  endSign(lineOf('knoll-loop'), 0, 'Knoll track', graded),
  ...bothEnds('knoll-rock-climb', 'Rock climb · 8 gates · start uphill', 'Rock climb · finish · up only'),
  ...bothEnds('knoll-switchbacks', 'Switchbacks — up', 'Switchbacks — either way'),
  ...bothEnds('knoll-side-slope', 'Side slope', 'Side slope — either way'),
  ...bothEnds('knoll-drop', 'The drop — down, hard', 'The drop — down only'),
  ...bothEnds('knoll-steep-descent', 'Steep descent — down', 'Steep descent — down only'),
  ...bothEnds('knoll-axle-twisters', 'Axle twisters', 'Axle twisters — either way'),
  ...bothEnds('knoll-bog-trench', 'Bog trench — winch', 'Bog trench — either way'),
];

/**
 * Marked rocks to winch from: above the rock climb's pitch, below the drop and on the
 * trench's bank beside each bog.
 */
export const knollAnchors: BoulderDef[] = (
  [
    ['knoll-rock-climb', 0.92 * 136, 5.5],
    ['knoll-drop', 0.75 * 145, 5.5],
    ['knoll-steep-descent', 0.85 * 116, -5.5],
    ['knoll-axle-twisters', 65, 5.5],
    ['knoll-bog-trench', 34, 5],
    ['knoll-bog-trench', 50, -5],
    ['knoll-bog-trench', 66, 5],
    ['knoll-bog-trench', 84, -5],
  ] as const
).map(([id, along, lateral]) => {
  const poly = lineOf(id).poly;
  const p = pointAt(poly, along);
  return {
    x: Math.round((p.x - p.dz * lateral) * 100) / 100,
    z: Math.round((p.z + p.dx * lateral) * 100) / 100,
    radius: 0.9,
    sink: 0.4,
    anchor: true,
  };
});

const middle = (id: string) => {
  const poly = lineOf(id).poly;
  return pointAt(poly, poly.length / 2);
};
const lineStart = (id: string, along = 4): NonNullable<PoiDef['reset']> => {
  const p = pointAt(lineOf(id).poly, along);
  return { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, headingDeg: Math.round(headingOf(p)) };
};
const poi = (
  id: string,
  name: string,
  note: string,
  at: XZ = [middle(id).x, middle(id).z],
  radius = 22,
): PoiDef => ({
  id,
  name,
  kind: 'feature',
  x: Math.round(at[0] * 10) / 10,
  z: Math.round(at[1] * 10) / 10,
  radius,
  // Where test mode's "Start from" puts the car: a little way along the line, facing along it
  // (the summit has no line of its own).
  ...(lines.some((l) => l.id === id) ? { reset: lineStart(id) } : {}),
  note,
});

export const knollPois: PoiDef[] = [
  poi('knoll-top', 'Knoll summit', 'The top of the play area; the lines down start here', [TOP.x, TOP.z], 16),
  poi(
    'knoll-rock-climb',
    'Rock climb · 8 gates',
    'Optional scored climb: start at gate 1, finish all eight uphill. 1000 points before penalties; personal best per vehicle',
  ),
  poi('knoll-switchbacks', 'Switchbacks', 'Tight hairpins up the east face'),
  poi('knoll-side-slope', 'Side slope', 'Round the west flank, leaning out'),
  poi(
    'knoll-drop',
    'The drop',
    'Off a near-vertical lip into a mud hole',
    [theDrop[3][0], theDrop[3][1]],
    18,
  ),
  poi('knoll-steep-descent', 'Steep descent', 'Straight down the north face'),
  poi('knoll-axle-twisters', 'Axle twisters', 'Holes under alternate wheels'),
  poi('knoll-bog-trench', 'Bog trench', 'A long bog between high clay walls'),
];

/** Open ground round the top, so the lines can be seen from the loop. */
export const knollClearings = [
  { x: TOP.x, z: TOP.z, radius: 70 },
  { x: 125, z: -75, radius: 50 },
  { x: 120, z: 170, radius: 40 },
];
