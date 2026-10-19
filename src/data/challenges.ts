import type {
  BoulderDef,
  ClearingDef,
  CrawlTrailDef,
  HillDef,
  PoiDef,
  PropDef,
  RidgeDef,
  TorDef,
  TrackDef,
  TrailDifficulty,
  TrailStoneDef,
  XZ,
} from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';
import {
  banks,
  boulder,
  endSign,
  gradedLine,
  headingOf as heading,
  rockStep,
  slab,
  tread,
} from './courseKit';
import { graniteLinkTracks } from './crawlTrail';

/**
 * Granite Spur: a granite hill east of camp with eight 4WD obstacles modelled on real
 * tracks. The Victorian High Country gives the clay climbs with drainage humps, the
 * rock steps of Billy Goat Bluff, Blue Rag's shale sidlings and washed-out descents;
 * the Rubicon and Moab give the boulder-choked gully and the granite chute. A gravel
 * fire trail climbs the north face to the summit and rings the foot of the hill, so
 * both ends of every obstacle can be reached without lockers.
 *
 * Sizes are against the vehicle: 0.38 m tyres, 1.45 m track, 2.3 m wheelbase and
 * roughly 0.44 m under the chassis rails. Stones are placed `at` metres along their
 * track and `lateral` metres to its right.
 */
export const spurHill: HillDef = {
  id: 'granite-spur',
  x: 15,
  z: 218,
  radius: 80,
  height: 18,
  shape: 'dome',
  stretch: [1.15, 0.85, 0],
};
/** A gully below The Sidling, so its low side drops away steeply. */
export const spurRidges: RidgeDef[] = [
  {
    id: 'sidling-drop',
    points: [
      [63, 220],
      [64, 233],
      [60, 246],
    ],
    height: -5,
    width: 14,
  },
];
export const spurClearings: ClearingDef[] = [{ x: 16, z: 216, radius: 15 }];
export const spurTors: TorDef[] = [{ id: 'spur-tor', x: 40, z: 236, radius: 4, count: 3 }];

// Easy: a dry creek bed cut a metre into the foot of the hill, floored with rounded
// stones. Each tyre climbs a stone in turn and the body rocks, but nothing is big
// enough to need lockers.
const creekStones: TrailStoneDef[] = [
  ...(
    [
      [10, -0.7, 0.18, 0.9, 0.8, 0],
      [13, 0.75, 0.22, 1.0, 0.9, 30],
      [16, 0.1, 0.12, 0.8, 0.8, 0],
      [19, -0.8, 0.25, 1.1, 1.0, 20],
      [22, 0.7, 0.2, 0.9, 1.0, 0],
      [26, -0.5, 0.15, 1.2, 0.9, 60],
      [29, 0.8, 0.28, 1.1, 1.1, 0],
      [33, -0.75, 0.22, 1.0, 0.9, 45],
      [36, 0.3, 0.14, 0.9, 0.8, 0],
      [40, 0.75, 0.24, 1.0, 1.0, 15],
      [44, -0.8, 0.26, 1.1, 1.0, 0],
      [48, 0.6, 0.18, 0.9, 0.9, 70],
      [52, -0.3, 0.15, 1.0, 0.9, 0],
      [55, 0.8, 0.27, 1.1, 1.0, 25],
      [58, -0.75, 0.2, 1.0, 0.9, 0],
      [62, 0.5, 0.16, 0.9, 0.8, 0],
    ] as const
  ).map(([at, lateral, h, w, l, yaw]) => boulder(at, lateral, h * 1.25, w, l, yaw)),
  ...banks(11, 55, 5.5, 1.75, 0.7),
];

// Moderate: climbing the north face at about 17° over three earth drainage humps
// ("whoa-boys") with a ditch dug on the uphill side of each. The crests are sharp
// enough to touch the belly between the axles if taken fast, and the angled ones lift
// diagonal wheels.
const whoaBoyHumps = [
  { at: 5, height: 0.45, length: 4.6, ditch: 0.25, ditchSide: 1 as const },
  { at: 13, height: 0.55, length: 4.6, ditch: 0.25, ditchSide: 1 as const, angleDeg: 16 },
  { at: 21, height: 0.5, length: 4.6, ditch: 0.25, ditchSide: 1 as const, angleDeg: -14 },
];

// Moderate: five granite ledges up the steep pinch onto the summit, like the rock
// steps of Billy Goat Bluff. Each is a band of bedrock: a riser at its downhill edge,
// then a tread flatter than the hill that runs back into the slope. Two are split so
// one front tyre climbs before the other.
const rockSteps: TrailStoneDef[] = [
  rockStep(3.2, 0, 0.32, 4.4, tread(0.32), 3),
  rockStep(6.8, -1.1, 0.42, 2.2, tread(0.42), -4),
  rockStep(7.6, 1.1, 0.34, 2.2, tread(0.34), 5),
  rockStep(11.2, 0, 0.4, 4.4, tread(0.4), -3),
  rockStep(14.7, 1.1, 0.46, 2.2, tread(0.46), 4),
  rockStep(15.5, -1.1, 0.36, 2.2, tread(0.36), -5),
  rockStep(18.2, 0, 0.44, 3.9, tread(0.44), 2),
  ...banks(2, 17, 3.4, 2.7, 0.95),
];

// Moderate: fallen snow gums across the summit track. They stand about 0.43–0.48 m,
// right at the height of the chassis rails, so a square crossing high-centres.
const logStepLogs = [
  { at: 8, lateral: 0, length: 6.5, radius: 0.25 },
  { at: 14.5, lateral: 0, length: 7, radius: 0.28, angleDeg: 28 },
  { at: 21, lateral: 0, length: 6.5, radius: 0.27, angleDeg: -22 },
];
const logStepRocks: TrailStoneDef[] = [8, 14.5, 21].flatMap((at, k) => [
  boulder(at, -3.9, 0.7 + k * 0.08, 1.3, 1.5, k * 50, -0.1),
  boulder(at + 0.6, 3.9, 0.65 + k * 0.1, 1.2, 1.4, k * 70, -0.1),
]);

// Hard: a narrow side-cut across the east face on loose shale. The track keeps the
// hill's lean and tips further towards the drop; a washout under the low-side tyres
// and a rock shelf under the high side push it past 25° for a moment.
const sidlingRocks: TrailStoneDef[] = [
  slab(37.5, 0.85, 0.16, 1.3, 3.2, 8, 4),
  boulder(12, 2.3, 0.7, 1.3, 1.5, 20, -0.15),
  boulder(26, 2.4, 0.8, 1.4, 1.6, 60, -0.15),
  boulder(46, 2.3, 0.65, 1.2, 1.4, 10, -0.15),
];

// Hard: a gully cut up to three metres into the south face and choked with boulders bigger
// than the tyres, like the Rubicon's Little Sluice. Tall rocks alternate sides so
// diagonal wheels lift on the climb, over low stones in the middle.
const gullyRocks: TrailStoneDef[] = [
  ...(
    [
      [4.6, -0.75, 0.4, 1.2, 1.2, 10],
      [6.5, 0.8, 0.46, 1.3, 1.4, 70],
      [7.2, -0.1, 0.14, 0.8, 0.8, 0],
      [9.5, -0.8, 0.5, 1.4, 1.5, 25],
      [12, 0.75, 0.48, 1.4, 1.4, 0],
      [12.8, -0.05, 0.14, 0.9, 0.9, 40],
      [15, -0.75, 0.52, 1.5, 1.5, 60],
      [17.5, 0.8, 0.5, 1.4, 1.5, 15],
      [20, -0.7, 0.48, 1.4, 1.4, 0],
      [22.5, 0.75, 0.5, 1.5, 1.5, 35],
      [23.2, 0, 0.14, 0.9, 0.9, 0],
      [25.5, -0.6, 0.45, 1.3, 1.3, 50],
    ] as const
  ).map(([at, lateral, h, w, l, yaw]) => boulder(at, lateral, h + 0.06, w, l, yaw, -0.06)),
  ...banks(5, 26, 3, 2.15, 1.1, 0.5),
];

// Extreme: a granite V-notch chute climbing out of the gully onto the summit, after
// Moab's Escalator. It rises about 10 m in 20 m. The walls lean in towards a crack
// and swap from high to low every wheelbase, so the car is always cross-axled: one
// front and the opposite rear tyre lift, and open diffs spin out.
const chuteWall = (
  from: number,
  to: number,
  side: number,
  before: number,
  height: number,
): TrailStoneDef => ({
  shape: 'ridge',
  at: (from + to) / 2,
  lateral: side * 0.85,
  width: 1.3,
  length: to - from,
  height,
  // Heights are at the wall's centre; it leans 14° in towards the crack.
  // Each section ramps up from the one below over its first 0.9 m.
  rollDeg: side * 14,
  profile: [
    [-(to - from) / 2, before],
    [-(to - from) / 2 + 0.9, height],
    [(to - from) / 2, height],
  ],
});
const CHUTE_SECTION = 2.3;
const chuteHeight = (k: number, side: number) => (k < 0 ? 0.1 : (k + (side > 0 ? 1 : 0)) % 2 ? 0.2 : 0.62);
const chuteRocks: TrailStoneDef[] = [
  ...Array.from({ length: 6 }, (_, k) => {
    const from = 3 + k * CHUTE_SECTION,
      to = from + CHUTE_SECTION;
    return [-1, 1].map((side) =>
      chuteWall(
        from,
        to,
        side,
        Math.min(chuteHeight(k - 1, side), chuteHeight(k, side)),
        chuteHeight(k, side),
      ),
    );
  }).flat(),
];

// Hard: a steep clay descent off the west of the summit, gouged by erosion ruts. The
// main rut runs down the middle for a while (straddle it), then cuts across the left
// wheel path; side ruts and a pothole catch tyres that wander.
const rutChannels = [
  {
    path: [
      [3, 1.4],
      [8, 0.3],
      [10, 0],
      [24, 0.1],
      [28, -0.6],
      [33, -1.35],
      [46, -1.45],
    ] as const,
    width: 0.95,
    depth: 0.48,
  },
  {
    path: [
      [6, -1.55],
      [19, -1.6],
    ] as const,
    width: 0.8,
    depth: 0.4,
  },
  {
    path: [
      [29, 1.45],
      [47, 1.35],
    ] as const,
    width: 0.85,
    depth: 0.42,
  },
  {
    path: [
      [38.4, 0.6],
      [39.6, 0.62],
    ] as const,
    width: 0.9,
    depth: 0.3,
  },
];

interface Obstacle {
  id: string;
  name: string;
  difficulty: TrailDifficulty;
  section: string;
  hint: string;
  track: Omit<TrackDef, 'id' | 'name'>;
  stones?: TrailStoneDef[];
  logs?: typeof logStepLogs;
  /** Where along the line its map place sits (fraction; default the middle). */
  poiAt?: number;
}

const obstacles: Obstacle[] = [
  {
    id: 'creek-bed',
    name: 'Creek Bed',
    difficulty: 'easy',
    section: 'Dry stony creek',
    hint: 'A dry creek bed along the foot of the hill. Low range and a steady crawl; put the tyres on the flat stones and let the car rock. Open diffs will do.',
    track: {
      points: [
        [-57, 213],
        [-58, 199],
        [-50, 184],
        [-38, 170],
        [-25, 161],
        [-14, 163],
      ],
      width: 4,
      shoulder: 1.6,
      smooth: 3,
      surface: 'gravel',
      ruts: 0,
      camber: 0,
      cut: [
        [0, 0],
        [8, 1.0],
        [54, 1.1],
        [64, 0],
      ],
    },
    stones: creekStones,
  },
  {
    id: 'whoa-boys',
    name: 'Whoa-boys',
    difficulty: 'moderate',
    section: 'Drainage humps',
    hint: 'A steep clay climb over earth drainage humps. Take each one square and slow, keep rolling over the crest so the belly doesn’t hang up, and ease into the ditch behind it.',
    track: {
      points: [
        [-4, 162],
        [-4.5, 174],
        [-4, 187],
      ],
      width: 3.4,
      shoulder: 1.6,
      smooth: 2,
      surface: 'dirt',
      ruts: 0.02,
      camber: 0.3,
      humps: whoaBoyHumps,
    },
    stones: banks(3, 24, 4, 2.7, 0.8),
  },
  {
    id: 'rock-steps',
    name: 'Rock Steps',
    difficulty: 'moderate',
    section: 'Granite ledges',
    hint: 'Granite ledges up a steep pinch. Square up to each step, let the tyre touch, then feed in throttle; lock the rear when the split ledges lift a wheel. Coming down is harder: one step at a time on crawl control.',
    track: {
      points: [
        [-4, 187],
        [0, 197],
        [4, 207],
      ],
      width: 3.4,
      shoulder: 1.4,
      smooth: 2,
      surface: 'rock',
      ruts: 0,
      camber: 0.3,
    },
    stones: rockSteps,
  },
  {
    id: 'log-step',
    name: 'Log Step',
    difficulty: 'moderate',
    section: 'Fallen snow gums',
    hint: 'Fallen trees across the track, as tall as your chassis rails. Cross at a slight angle so one wheel climbs at a time; straight on, the log hangs the belly between the axles.',
    track: {
      points: [
        [4, 207],
        [12, 211.5],
        [24, 214],
        [32, 213],
      ],
      width: 3.4,
      shoulder: 1.5,
      smooth: 3,
      surface: 'dirt',
      ruts: 0.03,
      camber: 0.3,
    },
    stones: logStepRocks,
    logs: logStepLogs,
  },
  {
    id: 'sidling',
    name: 'The Sidling',
    difficulty: 'hard',
    poiAt: 0.3,
    section: 'Shale side-cut',
    hint: 'A narrow side-cut on loose shale that leans you over 20° towards the drop. Crawl, steer smoothly and never turn downhill. If the lean passes 28°, stop and back out.',
    track: {
      points: [
        [32, 213],
        [45, 214],
        [52, 226],
        [52, 241],
        [45, 254],
      ],
      width: 3,
      shoulder: 0.9,
      smooth: 3,
      surface: 'gravel',
      ruts: 0,
      camber: 1,
      cant: [
        [0, 0],
        [8, 4],
        [18, 8],
        [44, 8],
        [52, 3],
        [57, 0],
      ],
      erosion: [
        {
          path: [
            [21, -0.85],
            [30, -0.8],
          ],
          width: 1,
          depth: 0.35,
        },
      ],
    },
    stones: sidlingRocks,
  },
  {
    id: 'boulder-gully',
    name: 'Boulder Gully',
    difficulty: 'hard',
    section: 'Boulder choke',
    hint: 'A narrow gully packed with boulders bigger than your tyres. Lock both axles, climb the big rocks with your tyres and keep the belly off the small ones in the middle.',
    track: {
      points: [
        [24, 270],
        [20, 256],
        [16, 243],
      ],
      width: 3.4,
      shoulder: 1.2,
      smooth: 2,
      surface: 'rock',
      ruts: 0,
      camber: 0.3,
      cut: [
        [0, 0],
        [4, 1.2],
        [14, 2.2],
        [28, 3],
      ],
    },
    stones: gullyRocks,
  },
  {
    id: 'the-chute',
    name: 'The Chute',
    difficulty: 'extreme',
    section: 'Granite V-notch',
    hint: 'A steep granite V-notch onto the summit. Keep a tyre on each wall and out of the crack, and expect a front wheel to lift at the ledges. Low range, both lockers and steady throttle; a wheel off the wall can roll the car.',
    track: {
      points: [
        [16, 243],
        [13, 233],
        [11, 224],
      ],
      width: 3.2,
      shoulder: 1.2,
      smooth: 2,
      surface: 'rock',
      ruts: 0,
      camber: 0.2,
      cut: [
        [0, 3],
        [4, 2.7],
        [10, 1.9],
        [16, 0.9],
        [19.7, 0],
      ],
    },
    stones: chuteRocks,
  },
  {
    id: 'washout-ruts',
    name: 'Washout Ruts',
    difficulty: 'hard',
    poiAt: 0.75,
    section: 'Erosion ruts',
    hint: 'A steep clay descent gouged by erosion ruts. Straddle the middle rut with a wheel on each side, cross ruts at an angle one wheel at a time, and let crawl control hold you back.',
    track: {
      points: [
        [2, 216],
        [-14, 214],
        [-30, 213],
        [-48, 212],
      ],
      width: 3.8,
      shoulder: 1.6,
      smooth: 3,
      surface: 'dirt',
      ruts: 0,
      camber: 0.4,
      erosion: rutChannels,
    },
  },
];

/** The fire trail: graded gravel that needs no lockers, joining both ends of every obstacle. */
const fireTrail: Array<{ id: string; name: string; points: XZ[]; hint: string }> = [
  {
    id: 'ft-west',
    name: 'Granite Spur · Fire trail',
    points: [
      [-57, 213],
      [-45, 204],
      [-38, 191],
      [-29, 181],
      [-19, 173],
      [-14, 163],
    ],
    hint: 'Gravel fire trail along the foot of Granite Spur, beside the Creek Bed. It climbs the north face to the summit; the obstacles leave it marked blue, amber, red and black.',
  },
  {
    id: 'ft-whoa-boys',
    name: 'Fire trail · Summit',
    points: [
      [-14, 163],
      [-4, 162],
    ],
    hint: 'Whoa-boys climbs straight up the hill from here. The fire trail carries on east and round to the summit without needing lockers.',
  },
  {
    id: 'ft-north',
    name: 'Fire trail · Summit',
    points: [
      [-4, 162],
      [10, 161],
      [30, 168],
      [40, 182],
      [32, 195],
      [18, 201],
      [4, 207],
    ],
    hint: 'The easy way to the summit, no lockers needed. Whoa-boys and Rock Steps are the direct line up the north face.',
  },
  {
    id: 'ft-summit-west',
    name: 'Summit',
    points: [
      [4, 207],
      [2, 212],
      [2, 216],
    ],
    hint: 'Summit of Granite Spur. Washout Ruts drops off the west side, The Chute arrives from the south and The Sidling leaves to the east.',
  },
  {
    id: 'ft-summit-south',
    name: 'Summit',
    points: [
      [11, 224],
      [7, 221],
      [2, 216],
    ],
    hint: 'Summit of Granite Spur. Washout Ruts drops off the west side; the fire trail back down is on the north face.',
  },
  {
    id: 'ft-summit-east',
    name: 'Summit',
    points: [
      [11, 224],
      [24, 224.5],
      [33, 220],
      [32, 213],
    ],
    hint: 'Summit of Granite Spur. The Sidling leaves to the east; the Log Step crosses the north side of the top.',
  },
  {
    id: 'ft-southeast',
    name: 'Fire trail · Foot of the hill',
    points: [
      [45, 254],
      [38, 266],
      [24, 270],
    ],
    hint: 'Boulder Gully climbs the south face from just ahead, and The Chute carries on to the summit. Follow the green markers west to get back to Granite Link.',
  },
  {
    id: 'ft-south',
    name: 'Fire trail · Foot of the hill',
    points: [
      [24, 270],
      [5, 272],
      [-20, 262],
      [-40, 240],
    ],
    hint: 'Fire trail around the south of Granite Spur, back to Granite Link and camp.',
  },
  {
    id: 'ft-return',
    name: 'Fire trail · Granite Link',
    points: [
      [-40, 240],
      [-45, 231],
      [-48, 225],
    ],
    hint: 'The Granite Link bypass is just ahead: left for camp, right for Granite Link. Washout Ruts comes down the hill to the east.',
  },
  {
    id: 'ft-ruts-end',
    name: 'Fire trail · Granite Link',
    points: [
      [-48, 212],
      [-57, 213],
    ],
    hint: 'Granite Link and camp are just ahead; the fire trail climbs Granite Spur from the Creek Bed.',
  },
];

const gravel = { width: 4.2, shoulder: 1.8, smooth: 3, surface: 'gravel' as const, ruts: 0.02, camber: 0.15 };
export const challengeTracks: TrackDef[] = [
  ...obstacles.map((o) => ({ ...o.track, id: o.id, name: o.name })),
  ...fireTrail.map((f) => ({
    ...gravel,
    id: f.id,
    name: f.name,
    points: f.points,
    markerColor: 'green' as const,
    routeHint: f.hint,
  })),
];

export const challengeTrails: CrawlTrailDef[] = obstacles.map((o) => ({
  id: o.id,
  name: o.name,
  trackId: o.id,
  difficulty: o.difficulty,
  sections: [
    {
      from: 0,
      to: 80,
      name: o.section,
      hint: o.hint,
      rocks: [],
      stones: o.stones ?? [],
      logs: o.logs ?? [],
    },
  ],
}));

const polys = obstacles.map((o) =>
  densify(
    o.track.points.map((p) => [p[0], p[1]] as const),
    1,
  ),
);
export const challengePois: PoiDef[] = [
  ...obstacles.map((o, i) => {
    // Centred on the obstacle, or nearer the end on the fire trail for the long ones,
    // and big enough that driving past on the fire trail finds it.
    const poly = polys[i],
      p = pointAt(poly, poly.length * (o.poiAt ?? 0.5)),
      start = pointAt(poly, 0);
    return {
      id: o.id,
      name: o.name,
      kind: 'feature' as const,
      x: p.x,
      z: p.z,
      radius: Math.min(16, poly.length / 2 + 2),
      reset: { x: start.x, z: start.z, headingDeg: heading(start) },
      note: `${o.difficulty.toUpperCase()} · Granite Spur. ${o.hint}`,
    };
  }),
  {
    id: 'spur-summit',
    name: 'Granite Spur',
    kind: 'viewpoint',
    x: 16,
    z: 216,
    radius: 12,
    note: 'Summit of a granite hill with eight 4WD obstacles. A gravel fire trail climbs the north face.',
  },
];

/** Marked winch anchors beside the harder obstacles, clear of every track. */
export const challengeAnchors: BoulderDef[] = (
  [
    ['whoa-boys', 0.6, -6],
    ['rock-steps', 0.55, -5.5],
    ['sidling', 0.5, 4.8],
    ['boulder-gully', 0.55, -5.2],
    ['the-chute', 0.6, 5.2],
    ['washout-ruts', 0.55, 6],
  ] as const
).map(([id, frac, lateral]) => {
  const poly = polys[obstacles.findIndex((o) => o.id === id)],
    p = pointAt(poly, poly.length * frac);
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, radius: 1.15, sink: 0.4, anchor: true };
});

/** Track centrelines here and how far their grading reaches, so signs stand clear of every one. */
const spurLines = [
  ...obstacles.map((o) => gradedLine(o.track.points, o.track.width / 2 + o.track.shoulder)),
  ...fireTrail.map((f) => gradedLine(f.points, gravel.width / 2 + gravel.shoulder)),
  ...graniteLinkTracks.map((t) => gradedLine(t.points, t.width / 2 + t.shoulder)),
];
export const challengeSigns: PropDef[] = [
  { kind: 'signpost', x: -143, z: 252, headingDeg: 270, text: 'Granite Spur →' },
  { kind: 'signpost', x: -64, z: 207, headingDeg: 210, text: 'Granite Spur 4WD' },
  ...obstacles.flatMap((o, i) => {
    const label = `${o.difficulty.toUpperCase()} · ${o.name}`;
    return [endSign(spurLines[i], 0, label, spurLines), endSign(spurLines[i], 1, label, spurLines)];
  }),
];

/** The suggested order: easy to extreme, round the hill and back to Granite Link. */
export const challengeLoopRoute = [
  'creek-bed',
  'ft-whoa-boys',
  'whoa-boys',
  'rock-steps',
  'log-step',
  'sidling',
  'ft-southeast',
  'boulder-gully',
  'the-chute',
  'ft-summit-south',
  'washout-ruts',
  'ft-ruts-end',
];
/**
 * The no-lockers way round, as [track, driven backwards] legs: the foot of the hill
 * from the Granite Link bypass, and the climb from Granite Link to the summit.
 */
export const challengeEasyRoutes: ReadonlyArray<ReadonlyArray<readonly [string, boolean]>> = [
  [
    ['ft-return', true],
    ['ft-south', true],
    ['ft-southeast', true],
  ],
  [
    ['ft-west', false],
    ['ft-whoa-boys', false],
    ['ft-north', false],
    ['ft-summit-west', false],
    ['ft-summit-south', true],
    ['ft-summit-east', false],
  ],
];

/** Optional scored runs on the crawl trails (src/sim/crawlRuns.ts). */
export const crawlScoring = {
  /** Penalty points: backing up, the chassis knocking a rock, hooking up the winch. */
  reverse: 1,
  knock: 1,
  winch: 5,
  /** A run starts within this distance (m) of either end of the technical line. */
  startZone: 2.5,
  /** And finishes this close to the far end (m). */
  finishZone: 2.5,
  /** Dropping back this far (m) from the furthest point counts as backing up... */
  reverseDistance: 0.5,
  /** ...and the car must move forward this far again before the next one counts. */
  rearmDistance: 0.4,
  /** Knocks closer together than this (s) count once. */
  knockSpacing: 0.8,
  /** Further than this outside the line's edge (m) ends the run. */
  offLine: 1.5,
  /** Leaving within this time (s) of starting, near the start, just cancels it. */
  falseStartSeconds: 4,
  rolledTiltDeg: 75,
};
