import type {
  BoulderDef,
  BogDef,
  ClearingDef,
  CrawlTrailDef,
  PatchDef,
  PoiDef,
  PropDef,
  TrackDef,
  TrailDifficulty,
  TrailStoneDef,
  XZ,
} from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';
import { banks, boulder, endSign, gradedLine, headingOf, rockStep, tread } from './courseKit';

/**
 * Ironbark 4WD Park's tracks and obstacles (the map itself is in park.ts). A gravel loop
 * rings Ironbark Hill; eleven numbered stations hang off it, each with an easier and a
 * harder line that leave the loop and rejoin it (or the ring track round the hilltop),
 * so the loop is always the way round. Stones, logs, ruts and humps are placed `at`
 * metres along their line and `lateral` metres to its right.
 *
 * Sizes are against both vehicles: 0.38–0.4 m tyres, 2.3 and 2.8 m wheelbases and
 * roughly 0.44 m under the chassis.
 */

type Point = XZ | readonly [number, number, number];

const gravel = { width: 4.4, shoulder: 2, smooth: 6, surface: 'gravel' as const, ruts: 0.02, camber: 0.15 };
const loopLeg = (id: string, name: string, points: XZ[], routeHint: string): TrackDef => ({
  ...gravel,
  id,
  name,
  points,
  markerColor: 'green',
  routeHint,
});

/** The park loop in six legs, joined at Park HQ, the middle of the east and west sides and the north. */
export const parkLoop: TrackDef[] = [
  loopLeg(
    'loop-south-east',
    'Park loop · South',
    [
      [0, 165],
      [150, 165],
      [212, 159],
      [236, 132],
      [240, 60],
    ],
    'Park loop. Stations 3 and 4 are on the right, 8 comes down the hill on the left; Park HQ is behind you.',
  ),
  loopLeg(
    'loop-east',
    'Park loop · East',
    [
      [240, 60],
      [240, -60],
    ],
    'Park loop, east side. Station 9 runs along the hill’s east face on the left.',
  ),
  loopLeg(
    'loop-north-east',
    'Park loop · North',
    [
      [240, -60],
      [236, -138],
      [212, -165],
      [150, -172],
      [0, -172],
    ],
    'Park loop, north side. Station 11 climbs the hill on the left, then 7.',
  ),
  loopLeg(
    'loop-north-west',
    'Park loop · North',
    [
      [0, -172],
      [-150, -172],
      [-212, -165],
      [-236, -138],
      [-240, -60],
    ],
    'Park loop, north side. Station 6 crosses the creek on the right.',
  ),
  loopLeg(
    'loop-west',
    'Park loop · West',
    [
      [-240, -60],
      [-240, 60],
    ],
    'Park loop, west side. Station 10 climbs the hill’s west face on the left.',
  ),
  loopLeg(
    'loop-south-west',
    'Park loop · South',
    [
      [-240, 60],
      [-236, 132],
      [-212, 159],
      [-150, 165],
      [0, 165],
    ],
    'Park loop. Stations 1 and 2 are on the left, 5 on the right; Park HQ is just ahead.',
  ),
];

/** The ring track round the flat top of Ironbark Hill, as a point at `deg` (0 = east, -90 = north). */
const RING = { x: 0, z: -10, rx: 55, rz: 36 };
const ringAt = (deg: number): XZ => [
  RING.x + RING.rx * Math.cos((deg * Math.PI) / 180),
  RING.z + RING.rz * Math.sin((deg * Math.PI) / 180),
];
const ringArc = (from: number, to: number): XZ[] => {
  const count = Math.round(Math.abs(to - from) / 15) + 1;
  return Array.from({ length: count }, (_, i) => ringAt(from + ((to - from) * i) / (count - 1)));
};
export const parkRing: TrackDef[] = [
  {
    ...gravel,
    id: 'ring-north',
    name: 'Hilltop',
    points: ringArc(0, -180),
    markerColor: 'green',
    routeHint:
      'Hilltop ring. Station 7 (Hill Climb) and 11 (Whoa-boys) arrive from the north; 10 (Rock Steps) from the west.',
  },
  {
    ...gravel,
    id: 'ring-south',
    name: 'Hilltop',
    points: ringArc(180, 0),
    markerColor: 'green',
    routeHint:
      'Hilltop ring. Station 8 (Steep Descent) leaves to the south: both lines are one way, downhill.',
  },
];

/** Nearest point on a loop leg to (x, z), so a line can join it exactly. */
function onLoop(legId: string, x: number, z: number): XZ {
  const leg = parkLoop.find((l) => l.id === legId)!;
  const poly = densify(leg.points as XZ[], 0.5);
  let best = 0;
  for (let k = 0; k < poly.count; k++)
    if (Math.hypot(poly.xs[k] - x, poly.zs[k] - z) < Math.hypot(poly.xs[best] - x, poly.zs[best] - z))
      best = k;
  return [poly.xs[best], poly.zs[best]];
}

/**
 * A line that leaves the loop at `a`, runs `out` metres to one side (along the unit
 * normal n) for most of the way to `b`, and rejoins at `b`. Its straight middle runs
 * from control point 2 to control point 3.
 */
function uLine(a: XZ, b: XZ, out: number, n: XZ, ramp = 12): XZ[] {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    L = Math.hypot(dx, dz);
  const P = (s: number, o: number): XZ => [a[0] + (dx / L) * s + n[0] * o, a[1] + (dz / L) * s + n[1] * o];
  return [
    P(0, 0),
    P(ramp * 0.3, out * 0.55),
    P(ramp, out),
    P(L - ramp, out),
    P(L - ramp * 0.3, out * 0.55),
    P(L, 0),
  ];
}

/** Arc length along a line at one of its control points. */
function arcAt(points: readonly Point[], index: number): number {
  const poly = densify(
    points.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  let best = 0;
  for (let k = 0; k < poly.count; k++)
    if (Math.abs(poly.u[k] - index) < Math.abs(poly.u[best] - index)) best = k;
  return poly.s[best];
}

/** A mud hole on a line: `at` metres along, `length` along the line and `width` across. */
interface BogSpot {
  at: number;
  lateral?: number;
  length: number;
  width: number;
  depth: number;
}

interface Line {
  grade: TrailDifficulty;
  /** What the line is, for the hint card under the station's name. */
  section: string;
  hint: string;
  points: Point[];
  track?: Partial<Omit<TrackDef, 'id' | 'name' | 'points'>>;
  stones?: TrailStoneDef[];
  logs?: NonNullable<CrawlTrailDef['sections'][number]['logs']>;
  bogs?: BogSpot[];
  /** Climbs and descents are signposted one way. */
  oneWay?: 'up' | 'down';
}

interface Station {
  n: number;
  id: string;
  name: string;
  /** Short description for the paper map. */
  note: string;
  easier: Line;
  harder: Line;
}

const DIRT = { width: 3.6, shoulder: 1.6, smooth: 3, surface: 'dirt' as const, ruts: 0.02, camber: 0.3 };
const SOUTH: XZ = [0, 1];
const NORTH: XZ = [0, -1];

// ---------------------------------------------------------------------------------------
// 1 · Mud Pits: bog holes on the flat south of the loop. Shallow ones on the easier line;
// on the harder line three deep holes in a row, the last longest, where wheelspin digs in.
function mudPits(): Station {
  const easy = uLine(onLoop('loop-south-west', -105, 165), onLoop('loop-south-west', -55, 165), 15, SOUTH);
  const hard = uLine(onLoop('loop-south-west', -115, 165), onLoop('loop-south-west', -45, 165), 31, SOUTH);
  const e = arcAt(easy, 2),
    h = arcAt(hard, 2);
  return {
    n: 1,
    id: 'mud-pits',
    name: 'Mud Pits',
    note: 'Bog holes. The easier line has two shallow ones; the harder line three deep ones in a row.',
    easier: {
      grade: 'easy',
      section: 'Shallow bog holes',
      hint: 'Two shallow bog holes. Keep a steady pace in second, straight through; don’t stop in the middle.',
      points: easy,
      bogs: [
        { at: e + 5, length: 5, width: 3.2, depth: 0.28 },
        { at: e + 17, length: 5, width: 3.2, depth: 0.3 },
      ],
    },
    harder: {
      grade: 'hard',
      section: 'Deep bog holes',
      hint: 'Three deep bog holes. Lock both diffs before you go in, keep momentum and steer gently; if the wheels dig in, back out and try a new line.',
      points: hard,
      bogs: [
        { at: h + 5, length: 5.5, width: 3.6, depth: 0.6 },
        { at: h + 18, length: 6, width: 3.6, depth: 0.68 },
        { at: h + 32, length: 7, width: 3.8, depth: 0.72 },
      ],
      // Wheel ruts churned through each hole, deeper on one side, then the other.
      track: {
        erosion: [
          { at: h + 5, side: -1, length: 6 },
          { at: h + 18, side: 1, length: 6.5 },
          { at: h + 32, side: -1, length: 8 },
        ].map(({ at, side, length }) => ({
          path: [
            [at - length / 2, side * 0.8],
            [at, side * 0.65],
            [at + length / 2, side * 0.8],
          ] as const,
          width: 1,
          depth: 0.42,
        })),
      },
    },
  };
}

// 2 · Axle Twisters: holes dug under alternate wheels so diagonal tyres drop and lift; on
// the harder line each hole has an earth mound beside it under the other wheel.
function twisterPits(from: number, count: number, spacing: number, depth: number, width: number, mound = 0) {
  return Array.from({ length: count }, (_, k) => {
    const side = k % 2 ? 1 : -1;
    const at = from + k * spacing;
    const spot = (lateral: number, d: number) => ({
      path: [
        [at - 0.85, lateral],
        [at + 0.85, lateral],
      ] as const,
      width,
      depth: d,
    });
    // A negative depth raises a mound.
    return mound > 0 ? [spot(side * 0.8, depth), spot(-side * 0.8, -mound)] : [spot(side * 0.8, depth)];
  }).flat();
}
function axleTwisters(): Station {
  const easy = uLine(onLoop('loop-south-west', -190, 163), onLoop('loop-south-west', -135, 165), 15, SOUTH);
  const hard = uLine(onLoop('loop-south-west', -200, 162), onLoop('loop-south-west', -125, 165), 31, SOUTH);
  return {
    n: 2,
    id: 'axle-twisters',
    name: 'Axle Twisters',
    note: 'Holes under alternate wheels that lift diagonal tyres. Shallow on the easier line, deep on the harder.',
    easier: {
      grade: 'moderate',
      section: 'Shallow holes',
      hint: 'Shallow holes under alternate wheels. Crawl through in low range and let the suspension twist; open diffs will do.',
      points: easy,
      track: { erosion: twisterPits(arcAt(easy, 2) + 4, 8, 2.9, 0.26, 1.3) },
    },
    harder: {
      grade: 'hard',
      section: 'Holes and mounds',
      hint: 'Deep holes under alternate wheels lift a front and the opposite rear tyre off the ground. Lock the rear (or both) and crawl.',
      points: hard,
      track: { erosion: twisterPits(arcAt(hard, 2) + 4, 14, 2.4, 0.55, 1.6, 0.3) },
    },
  };
}

// 3 · Log Crossing: logs across the line, small and angled on the easier one, big and
// square on the harder one, with a pair laid together as a step.
function logCrossing(): Station {
  const easy = uLine(onLoop('loop-south-east', 55, 165), onLoop('loop-south-east', 105, 165), 15, SOUTH);
  const hard = uLine(onLoop('loop-south-east', 45, 165), onLoop('loop-south-east', 115, 165), 31, SOUTH);
  const e = arcAt(easy, 2),
    h = arcAt(hard, 2);
  return {
    n: 3,
    id: 'log-crossing',
    name: 'Log Crossing',
    note: 'Logs across the track. Small and angled on the easier line; big, square and doubled on the harder.',
    easier: {
      grade: 'easy',
      section: 'Small logs',
      hint: 'Small logs laid at an angle. Roll over them slowly one wheel at a time.',
      points: easy,
      logs: [
        { at: e + 5, lateral: 0, length: 6, radius: 0.15, angleDeg: 22 },
        { at: e + 13, lateral: 0, length: 6, radius: 0.17, angleDeg: -25 },
        { at: e + 21, lateral: 0, length: 6, radius: 0.16, angleDeg: 18 },
      ],
      stones: [e + 5, e + 13, e + 21].flatMap((at, k) => [
        boulder(at, -3.6, 0.5 + k * 0.05, 1.0, 1.2, k * 40, -0.1),
        boulder(at + 0.5, 3.6, 0.45 + k * 0.06, 1.0, 1.1, k * 60, -0.1),
      ]),
    },
    harder: {
      grade: 'hard',
      section: 'Big logs',
      hint: 'Logs as tall as the chassis rails, and a doubled pair. Cross at a slight angle so one wheel climbs at a time; square on, the belly hangs up.',
      points: hard,
      logs: [
        { at: h + 6, lateral: 0, length: 6.5, radius: 0.27 },
        { at: h + 15, lateral: 0, length: 6.5, radius: 0.3, angleDeg: 12 },
        { at: h + 26, lateral: 0, length: 6.5, radius: 0.24 },
        { at: h + 26.55, lateral: 0, length: 6.5, radius: 0.24 },
        { at: h + 37, lateral: 0, length: 7, radius: 0.31, angleDeg: -15 },
      ],
      stones: [h + 6, h + 15, h + 26, h + 37].flatMap((at, k) => [
        boulder(at, -3.9, 0.6 + k * 0.05, 1.2, 1.4, k * 50, -0.1),
        boulder(at + 0.6, 3.9, 0.55 + k * 0.07, 1.1, 1.3, k * 70, -0.1),
      ]),
    },
  };
}

// 4 · Ditch Crossing: V-ditches dug across the track. A broad dip on the easier line;
// short steep ditches on the harder one that test approach and departure angles.
const ditch = (at: number, depth: number, half: number): Array<readonly [number, number]> => [
  [at - half, 0],
  [at - half * 0.45, depth * 0.8],
  [at, depth],
  [at + half * 0.45, depth * 0.8],
  [at + half, 0],
];
function ditchCrossing(): Station {
  const easy = uLine(onLoop('loop-south-east', 135, 165), onLoop('loop-south-east', 190, 162), 15, SOUTH);
  const hard = uLine(onLoop('loop-south-east', 125, 165), onLoop('loop-south-east', 200, 161), 31, SOUTH);
  const e = arcAt(easy, 2),
    h = arcAt(hard, 2);
  return {
    n: 4,
    id: 'ditch-crossing',
    name: 'Ditch Crossing',
    note: 'Ditches across the track: two broad dips on the easier line, three short steep ones on the harder.',
    easier: {
      grade: 'moderate',
      section: 'Broad dips',
      hint: 'Two broad dips. Roll in slowly so the bumper doesn’t dig in, and power out gently.',
      points: easy,
      track: { cut: [[0, 0], ...ditch(e + 6, 0.6, 4.5), ...ditch(e + 19, 0.7, 4.5), [e + 40, 0]] },
    },
    harder: {
      grade: 'hard',
      section: 'Steep ditches',
      hint: 'Short, steep ditches. Take each one at an angle so one wheel drops in at a time; straight in, the bull bar or tow bar digs into the far wall.',
      points: hard,
      track: {
        cut: [
          [0, 0],
          ...ditch(h + 6, 1.2, 3),
          ...ditch(h + 20, 1.35, 2.8),
          ...ditch(h + 34, 1.3, 2.9),
          [h + 60, 0],
        ],
      },
    },
  };
}

// 5 · Rock Garden: boulders strewn over the flat inside the loop. Small stones on the
// easier line; a packed field of tyre-high boulders on the harder.
function rockGarden(): Station {
  const easy = uLine(onLoop('loop-south-west', -150, 165), onLoop('loop-south-west', -95, 165), 15, NORTH);
  const hard = uLine(onLoop('loop-south-west', -160, 165), onLoop('loop-south-west', -85, 165), 31, NORTH);
  const e = arcAt(easy, 2),
    h = arcAt(hard, 2);
  const small: Array<readonly [number, number, number, number]> = [
    [3, -0.7, 0.2, 0.8],
    [5.5, 0.8, 0.24, 0.9],
    [8, -0.1, 0.14, 0.7],
    [10.5, 0.75, 0.26, 1.0],
    [13, -0.8, 0.22, 0.9],
    [15.5, 0.3, 0.16, 0.8],
    [18, -0.6, 0.27, 1.0],
    [20.5, 0.8, 0.22, 0.9],
    [23, -0.75, 0.18, 0.8],
    [25.5, 0.5, 0.25, 1.0],
  ];
  const big: Array<readonly [number, number, number, number]> = [
    [3, -0.75, 0.38, 1.2],
    [5, 0.8, 0.44, 1.3],
    [5.8, -0.05, 0.13, 0.8],
    [8, -0.8, 0.48, 1.4],
    [10.5, 0.75, 0.46, 1.4],
    [11.3, -0.1, 0.14, 0.9],
    [13.5, -0.75, 0.5, 1.5],
    [16, 0.8, 0.48, 1.4],
    [18.5, -0.7, 0.46, 1.4],
    [21, 0.75, 0.5, 1.5],
    [21.8, 0, 0.14, 0.9],
    [24, -0.6, 0.44, 1.3],
    [26.5, 0.7, 0.42, 1.3],
    [29, -0.75, 0.47, 1.4],
    [31.5, 0.6, 0.4, 1.2],
  ];
  return {
    n: 5,
    id: 'rock-garden',
    name: 'Rock Garden',
    note: 'Boulders on the flat. Small stones on the easier line; tyre-high boulders packed tight on the harder.',
    easier: {
      grade: 'easy',
      section: 'Scattered stones',
      hint: 'Scattered stones. Low range, slow, and put your tyres on the rocks rather than between them.',
      points: easy,
      track: { surface: 'rock', camber: 0.2 },
      stones: [
        ...small.map(([at, lat, hgt, w], k) => boulder(e + at, lat, hgt + 0.05, w, w * 1.1, k * 37, -0.05)),
        ...banks(e + 2, e + 26, 4, 2.3, 0.8),
      ],
    },
    harder: {
      grade: 'extreme',
      section: 'Boulder field',
      hint: 'A packed field of boulders as tall as your tyres. Both lockers, low range, and climb the big rocks with your tyres; keep the belly off the small ones in the middle.',
      points: hard,
      track: { surface: 'rock', camber: 0.2 },
      stones: [
        ...big.map(([at, lat, hgt, w], k) => boulder(h + at, lat, hgt * 1.25 + 0.06, w, w, k * 41, -0.06)),
        ...banks(h + 3, h + 31, 3.5, 2.2, 1.1, 0.4),
      ],
    },
  };
}

// 6 · Water Crossing: two crossings of Ironbark Creek north of the loop, joined on the far
// bank. A wide gravel ford, and a deep hole between steep banks.
const FAR_BANK = -252;
function waterCrossing(): Station {
  const ford = onLoop('loop-north-west', -135, -172),
    deep = onLoop('loop-north-west', -65, -172);
  return {
    n: 6,
    id: 'water-crossing',
    name: 'Water Crossing',
    note: 'Two crossings of Ironbark Creek joined on the far bank: a wide gravel ford and a deep hole between steep banks.',
    easier: {
      grade: 'easy',
      section: 'Gravel ford',
      hint: 'A wide, shallow gravel ford. Ease in, keep a steady walking pace and drive out the far side.',
      points: [ford, [ford[0], -195], [-135, -224], [-135, FAR_BANK]],
      track: { width: 4, smooth: 6, surface: 'gravel', camber: 0.2 },
    },
    harder: {
      grade: 'hard',
      section: 'Deep hole',
      hint: 'Deep water between steep banks. Drop in slowly, then a steady push to make a small bow wave; don’t stop until you’re out. Too fast and water reaches the engine’s air intake.',
      points: [deep, [deep[0], -195], [-65, -220], [-65, FAR_BANK]],
      track: { smooth: 2 },
    },
  };
}
export const farBankTrack: TrackDef = {
  ...gravel,
  width: 3.8,
  shoulder: 1.6,
  id: 'creek-far-bank',
  name: 'Water Crossing · Far bank',
  points: [
    [-135, FAR_BANK],
    [-100, FAR_BANK - 4],
    [-65, FAR_BANK],
  ],
  markerColor: 'green',
  routeHint: 'Far bank of Ironbark Creek: the ford is to the west, the deep crossing to the east.',
};

// 7 · Hill Climb: up the steep north face of Ironbark Hill to the hilltop ring. The
// easier line slants across the face; the harder one goes straight up it.
function hillClimb(): Station {
  return {
    n: 7,
    id: 'hill-climb',
    name: 'Hill Climb',
    note: 'Up the north face. The easier line slants across it at about 18°; the harder goes straight up at 30°. One way, uphill.',
    easier: {
      grade: 'moderate',
      section: 'Slanting climb',
      oneWay: 'up',
      hint: 'A slanting climb at about 18°. Low range, second or third, steady throttle. Never turn across the slope.',
      points: [
        onLoop('loop-north-west', -50, -172),
        [-50, -140],
        [-47, -104],
        [-40, -88],
        [-33, -82],
        [-24, -77],
        [-15, -72],
        [-8, -65],
        ringAt(-100),
      ],
    },
    harder: {
      grade: 'hard',
      section: 'Straight up',
      oneWay: 'up',
      hint: 'Straight up a 30° face with rocky steps. Low range, both lockers, and keep the wheels straight. If it stalls, brake, select reverse and back down straight.',
      points: [
        onLoop('loop-north-east', 14, -172),
        [14, -140],
        [14, -110],
        [14, -80],
        [14, -60],
        ringAt(-75),
      ],
      track: { rockySteps: [] },
    },
  };
}

// 8 · Steep Descent: down the south face. The easier line slants down; the harder goes
// straight down through erosion ruts.
function steepDescent(): Station {
  return {
    n: 8,
    id: 'steep-descent',
    name: 'Steep Descent',
    note: 'Down the south face. The easier line slants across it at about 18°; the harder goes straight down at 28° through erosion ruts. One way, downhill.',
    easier: {
      grade: 'moderate',
      section: 'Slanting descent',
      oneWay: 'down',
      hint: 'A slanting descent at about 18°. Low range first gear and crawl control; stay off the brakes and let the engine hold you.',
      points: [
        ringAt(100),
        [-5, 45],
        [-7, 48],
        [-15, 55],
        [-24, 59],
        [-33, 63],
        [-40, 70],
        [-46, 85],
        [-46, 120],
        onLoop('loop-south-west', -40, 165),
      ],
    },
    harder: {
      grade: 'hard',
      section: 'Straight down',
      oneWay: 'down',
      hint: 'Straight down 28° through erosion ruts. Low range first, crawl control on, wheels straight; straddle the ruts and never brake hard enough to lock the wheels.',
      points: [ringAt(70), [20, 40], [22, 60], [22, 85], [22, 120], onLoop('loop-south-east', 22, 165)],
      track: {
        erosion: [
          {
            path: [
              [16, 0.1],
              [30, 0],
              [38, -0.5],
              [50, -1.3],
              [60, -1.35],
            ],
            width: 0.9,
            depth: 0.45,
          },
          {
            path: [
              [22, 1.45],
              [44, 1.4],
            ],
            width: 0.8,
            depth: 0.38,
          },
        ],
      },
    },
  };
}

// 9 · Side Slope: an earth bank inside the east side of the loop. Both lines run straight
// along its east flank: the easier one low down, the harder one high up where the flank
// is steepest, with a little extra lean dug in. The bank tapers at its ends, so the lean
// builds up and eases off again.
export const sideSlopeBank = { x: 182, from: -22, to: 22, height: 5.5, width: 34 };
const WEST: XZ = [-1, 0];
function sideSlope(): Station {
  const flank = (d: number) => 240 - (sideSlopeBank.x + d);
  return {
    n: 9,
    id: 'side-slope',
    name: 'Side Slope',
    note: 'Along the flank of an earth bank. The easier line leans you about 15°; the harder about 25°.',
    easier: {
      grade: 'moderate',
      section: 'Low on the bank',
      hint: 'Leans you about 15° towards the low side. Crawl, steer smoothly and never turn downhill.',
      points: uLine(onLoop('loop-east', 240, 40), onLoop('loop-east', 240, -40), flank(20), WEST),
      track: { camber: 1, smooth: 4 },
    },
    harder: {
      grade: 'hard',
      section: 'High on the bank',
      hint: 'Leans you about 25° towards the low side, past where it feels safe. Crawl, steer smoothly, never turn downhill; if the lean passes 28°, stop and back out.',
      points: uLine(onLoop('loop-east', 240, 52), onLoop('loop-east', 240, -52), flank(9.6), WEST),
      track: { camber: 1, smooth: 4, width: 3.2 },
    },
  };
}

// 10 · Rock Steps: granite ledges up the west face. Small full-width steps on the easier
// line; tall split ledges on the harder, so one front tyre climbs before the other.
function rockSteps(): Station {
  // The easier line slants north-east across the face at about 13°.
  const easy: Point[] = [
    onLoop('loop-west', -240, -30),
    [-185, -30],
    [-140, -30],
    [-128, -30],
    [-119, -29],
    [-109, -32],
    [-100, -35],
    [-91, -39],
    [-81, -43],
    [-71, -45],
    ringAt(-150),
  ];
  const hard: Point[] = [
    onLoop('loop-west', -240, 10),
    [-185, 10],
    [-140, 8],
    [-105, 4],
    [-80, 1],
    ringAt(165),
  ];
  const e = arcAt(easy, 3),
    h = arcAt(hard, 2);
  return {
    n: 10,
    id: 'rock-steps',
    name: 'Rock Steps',
    note: 'Granite ledges up the west face: low steps on the easier line, which slants across the face, and tall split ones straight up it on the harder. One way, uphill.',
    easier: {
      grade: 'moderate',
      section: 'Low ledges',
      oneWay: 'up',
      hint: 'Low granite steps on a slanting climb. Square up to each one, let the tyre touch, then feed in throttle.',
      points: easy,
      track: { surface: 'rock' },
      stones: [6, 14, 22, 30].map((at, k) =>
        rockStep(e + at, 0, 0.2 + (k % 2) * 0.04, 4.2, tread(0.22), k % 2 ? 3 : -3),
      ),
    },
    harder: {
      grade: 'hard',
      section: 'Split ledges',
      oneWay: 'up',
      hint: 'Tall split ledges. One front tyre climbs before the other: lock the rear, keep steady throttle and let the car rock up each step.',
      points: hard,
      track: { surface: 'rock' },
      stones: [
        rockStep(h + 8, 0, 0.36, 4.2, tread(0.36), 3),
        rockStep(h + 15, -1.1, 0.44, 2.2, tread(0.44), -4),
        rockStep(h + 15.8, 1.1, 0.36, 2.2, tread(0.36), 5),
        rockStep(h + 23, 0, 0.42, 4.2, tread(0.42), -3),
        rockStep(h + 30, 1.1, 0.46, 2.2, tread(0.46), 4),
        rockStep(h + 30.8, -1.1, 0.38, 2.2, tread(0.38), -5),
        ...banks(h + 6, h + 32, 3.6, 2.8, 0.95),
      ],
    },
  };
}

// 11 · Whoa-boys: drainage humps up the north-east face to the hilltop. Low rounded humps
// on the easier line; tall ones with ditches behind, some angled, on the harder.
function whoaBoys(): Station {
  const easy: Point[] = [
    onLoop('loop-north-east', 150, -172),
    [140, -145],
    [110, -90],
    [95, -62],
    [85, -61],
    [75, -62],
    [65, -63],
    [55, -64],
    [45, -62],
    [39, -56],
    ringAt(-50),
  ];
  const hard: Point[] = [
    onLoop('loop-north-east', 178, -170),
    [165, -140],
    [122, -72],
    [105, -55],
    [96, -52],
    [86, -52],
    [76, -52],
    [66, -51],
    [60, -45],
    ringAt(-25),
  ];
  const e = arcAt(easy, 3),
    h = arcAt(hard, 3);
  return {
    n: 11,
    id: 'whoa-boys',
    name: 'Whoa-boys',
    note: 'Drainage humps slanting up the north-east face: low ones on the easier line, tall ones with ditches behind on the harder.',
    easier: {
      grade: 'moderate',
      section: 'Low humps',
      hint: 'Low drainage humps on a slanting climb. Take each one square and slow, in low range.',
      points: easy,
      track: {
        humps: [0, 12, 24, 36].map((at) => ({ at: e + at, height: 0.3, length: 5.4 })),
      },
    },
    harder: {
      grade: 'hard',
      section: 'Tall humps',
      hint: 'Tall humps with a ditch behind each. Take each one square and slow, keep rolling over the crest so the belly doesn’t hang up, and ease into the ditch.',
      points: hard,
      track: {
        humps: [
          { at: h + 2, height: 0.55, length: 4.6, ditch: 0.3, ditchSide: 1 as const },
          { at: h + 13, height: 0.62, length: 4.6, ditch: 0.3, ditchSide: 1 as const, angleDeg: 16 },
          { at: h + 24, height: 0.58, length: 4.6, ditch: 0.3, ditchSide: 1 as const, angleDeg: -14 },
          { at: h + 35, height: 0.6, length: 4.6, ditch: 0.3, ditchSide: 1 as const },
        ],
      },
    },
  };
}

export const parkStations: Station[] = [
  mudPits(),
  axleTwisters(),
  logCrossing(),
  ditchCrossing(),
  rockGarden(),
  waterCrossing(),
  hillClimb(),
  steepDescent(),
  sideSlope(),
  rockSteps(),
  whoaBoys(),
];

const lineId = (s: Station, which: 'easier' | 'harder') => `${s.id}-${which}`;
const gradeName = (g: TrailDifficulty) => g[0].toUpperCase() + g.slice(1);
const lines = parkStations.flatMap((s) =>
  (['easier', 'harder'] as const).map((which) => ({
    station: s,
    which,
    line: s[which],
    id: lineId(s, which),
  })),
);

export const parkTracks: TrackDef[] = [
  ...lines.map(({ station, line, id }) => ({
    ...DIRT,
    ...line.track,
    id,
    name: `${station.n} ${station.name} · ${gradeName(line.grade)}`,
    points: line.points,
  })),
  farBankTrack,
  ...parkRing,
];

export const parkTrails: CrawlTrailDef[] = lines.map(({ station, line, id }) => ({
  id,
  name: `${station.n} ${station.name} · ${gradeName(line.grade)}`,
  trackId: id,
  difficulty: line.grade,
  sections: [
    {
      from: 0,
      to: 400,
      name: line.section,
      hint: line.hint,
      rocks: [],
      stones: line.stones ?? [],
      logs: line.logs ?? [],
    },
  ],
}));

const polyOf = (points: readonly Point[]) =>
  densify(
    points.map((p) => [p[0], p[1]] as XZ),
    1,
  );

export const parkBogs: BogDef[] = lines.flatMap(({ line, id }) => {
  const poly = polyOf(line.points);
  return (line.bogs ?? []).map((b, k) => {
    const p = pointAt(poly, b.at),
      lat = b.lateral ?? 0;
    return {
      id: `${id}-bog-${k}`,
      x: p.x - p.dz * lat,
      z: p.z + p.dx * lat,
      radiusX: b.length / 2,
      radiusZ: b.width / 2,
      rotationDeg: (Math.atan2(p.dz, p.dx) * 180) / Math.PI,
      depth: b.depth,
    };
  });
});

const middleOf = (points: readonly Point[]) => {
  const poly = polyOf(points);
  return pointAt(poly, poly.length / 2);
};

export const parkPatches: PatchDef[] = [
  ...parkBogs.map((b) => ({
    id: `${b.id}-mud`,
    kind: 'mud' as const,
    x: b.x,
    z: b.z,
    radius: b.radiusX + 1.5,
    ragged: 0.5,
  })),
  { id: 'ford-gravel', kind: 'gravel', x: -135, z: -224, radius: 14, ragged: 0.3 },
];

export const parkPois: PoiDef[] = parkStations.map((s) => {
  const a = middleOf(s.easier.points),
    b = middleOf(s.harder.points);
  const start = pointAt(polyOf(s.easier.points), 0);
  return {
    id: s.id,
    name: `${s.n}. ${s.name}`,
    kind: 'feature',
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    radius: Math.max(16, Math.hypot(a.x - b.x, a.z - b.z) / 2 + 8),
    reset: { x: start.x, z: start.z, headingDeg: headingOf(start) },
    note: `Station ${s.n} · ${gradeName(s.easier.grade)} and ${s.harder.grade}. ${s.note}`,
  };
});

/** Every graded centreline, so signs and anchors stand clear of them all. */
const graded = [
  ...parkLoop.map((t) => gradedLine(t.points, t.width / 2 + t.shoulder)),
  ...parkTracks.map((t) => gradedLine(t.points, t.width / 2 + t.shoulder)),
];
const gradedById = new Map(parkTracks.map((t, i) => [t.id, graded[parkLoop.length + i]]));

export const parkSigns: PropDef[] = lines.flatMap(({ station, line, id }) => {
  const g = gradedById.get(id)!;
  const label = `${station.n} ${station.name} · ${line.grade.toUpperCase()}`;
  // One-way lines are only signed at their entrance.
  if (line.oneWay === 'up' || line.oneWay === 'down') return [endSign(g, 0, label, graded)];
  return [endSign(g, 0, label, graded), endSign(g, 1, label, graded)];
});

/** Marked winch anchors beside the harder lines, clear of every track. */
export const parkAnchors: BoulderDef[] = (
  [
    ['mud-pits-harder', 0.55, 6],
    ['axle-twisters-harder', 0.5, 6],
    ['log-crossing-harder', 0.5, 6.5],
    ['rock-garden-harder', 0.5, -6],
    ['water-crossing-harder', 0.75, 6],
    ['hill-climb-harder', 0.75, 7],
    ['side-slope-harder', 0.5, -6],
    ['rock-steps-harder', 0.7, 6],
    ['whoa-boys-harder', 0.65, -6.5],
  ] as const
).map(([id, frac, lateral]) => {
  const poly = gradedById.get(id)!.poly,
    p = pointAt(poly, poly.length * frac);
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, radius: 1.15, sink: 0.4, anchor: true };
});

export const parkClearings: ClearingDef[] = parkStations.map((s) => {
  const a = middleOf(s.easier.points),
    b = middleOf(s.harder.points);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius: 30 };
});

/** The loop's legs in driving order from Park HQ, all the way round. */
export const parkLoopRoute = [
  'loop-south-east',
  'loop-east',
  'loop-north-east',
  'loop-north-west',
  'loop-west',
  'loop-south-west',
];
