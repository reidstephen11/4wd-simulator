import type {
  BogDef,
  BoulderDef,
  ClearingDef,
  CrawlTrailDef,
  GateDef,
  PatchDef,
  PoiDef,
  PropDef,
  TrackBridgeDef,
  TrackDef,
  TrailDifficulty,
  TrailStoneDef,
  XZ,
} from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';
import { banks, boulder, endSign, gradedLine, headingOf, rockStep, slab, tread } from './courseKit';

/**
 * Crawler Creek's gate trail (the map itself is in crawlerCreek.ts): one loop from the
 * Trailhead, laid out like an RC crawler course at full size. Numbered gates (a red
 * flag on the left, a blue one on the right) mark the line through twelve sections:
 * a slalom, mud holes, a bridge over the creek, logs, switchbacks up Knuckle Ridge,
 * summit rocks, a steep drop, a two-plank bridge over a bog, a ford, a ramp bridge, a
 * rock garden in a dry creek bed and a last mud hole back to the start. Every section
 * is a crawl trail of its own, so the scored runs work on each one.
 *
 * Stones, logs and bogs are placed `at` metres along their section and `lateral`
 * metres to its right; a negative `at` counts back from the section's end.
 */

type Point = XZ | readonly [number, number, number];

/** Knuckle Ridge: an escarpment whose south face carries the switchbacks. */
export const knuckleRidge = {
  /** The face's centre line, its width (foot to top) and height. */
  z: -110,
  width: 90,
  height: 26,
  /** It rises from the valley west of here and drops off steeply east of here. */
  westFoot: -250,
  westTop: -175,
  eastTop: 92,
  eastFoot: 155,
};

interface BogSpot {
  at: number;
  lateral?: number;
  length: number;
  width: number;
  depth: number;
}

/** A gate `at` metres along its section: [at, lateral, width]. */
type GateSpot = readonly [number, number?, number?];

interface Section {
  id: string;
  name: string;
  grade: TrailDifficulty;
  hint: string;
  /** Short description for the paper map. */
  note: string;
  points: Point[];
  track?: Partial<Omit<TrackDef, 'id' | 'name' | 'points'>>;
  stones?: TrailStoneDef[];
  logs?: NonNullable<CrawlTrailDef['sections'][number]['logs']>;
  bogs?: BogSpot[];
  gates: GateSpot[];
}

const TRAIL = { width: 3.4, shoulder: 1.6, smooth: 3, surface: 'dirt' as const, ruts: 0.02, camber: 0.3 };
const GATE_WIDTH = 3.6;

const polyOf = (points: readonly Point[]) =>
  densify(
    points.map((p) => [p[0], p[1]] as XZ),
    1,
  );
const lengthOf = (points: readonly Point[]) => polyOf(points).length;
/** `at` from the start, or counted back from the end when negative. */
const along = (points: readonly Point[], at: number) => (at < 0 ? lengthOf(points) + at : at);

/** Where a section's centreline first crosses a line through the given points. */
function crossing(points: readonly Point[], line: readonly XZ[]): number {
  const poly = polyOf(points),
    other = densify(line, 1);
  for (let k = 0; k + 1 < poly.count; k++)
    for (let j = 0; j + 1 < other.count; j++) {
      const [ax, az, bx, bz] = [poly.xs[k], poly.zs[k], poly.xs[k + 1], poly.zs[k + 1]];
      const [cx, cz, dx, dz] = [other.xs[j], other.zs[j], other.xs[j + 1], other.zs[j + 1]];
      const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
      const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return poly.s[k] + (poly.s[k + 1] - poly.s[k]) * t;
    }
  throw new Error('Section does not cross the line');
}

/**
 * Switchbacks across a hill face that climbs towards -z: straight legs alternating east
 * and west, each joined to the next by a hairpin of radius `turn` that bulges out past
 * the leg's end. `legs` are [x at the start, x at the end, z at the start, z at the end].
 */
function switchbacks(legs: ReadonlyArray<readonly [number, number, number, number]>, turn: number): XZ[] {
  const out: XZ[] = [];
  legs.forEach(([x0, x1, z0, z1], k) => {
    const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 8));
    for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
    if (k + 1 === legs.length) return;
    const east = x1 > x0 ? 1 : -1;
    const zNext = legs[k + 1][2];
    const r = (z1 - zNext) / 2;
    for (let i = 1; i < 6; i++) {
      const t = (Math.PI * i) / 6;
      out.push([x1 + east * turn * Math.sin(t), z1 - r + r * Math.cos(t)]);
    }
  });
  return out;
}

/** The creek's centreline near the trail (shared with the map's creek). */
export const creekLine: XZ[] = [
  [-430, -18],
  [-300, -8],
  [-200, -16],
  [-131, -22],
  [-60, -28],
  [20, -20],
  [90, -14],
  [152, -20],
  [230, -30],
  [320, -24],
  [430, -28],
];

// ---------------------------------------------------------------------------------------
const startChute: Section = {
  id: 'start-chute',
  name: 'Start Chute',
  grade: 'easy',
  hint: 'A slalom through the first gates. Keep the red flag on your left and the blue one on your right, and use the whole track.',
  note: 'The first gates: a slalom between boulders north of the Trailhead.',
  points: [
    [-150, 156],
    [-147, 138],
    [-153, 121],
    [-147, 104],
    [-153, 87],
    [-149, 70],
  ],
  gates: [[6, 0, 4], [17, 0.9, 3], [34, -0.9, 3], [51, 0.9, 3], [68, -0.9, 3], [-4]],
  stones: [
    ...[17, 34, 51, 68].map((at, k) =>
      boulder(at, k % 2 ? 3.4 : -3.4, 0.55 + (k % 2) * 0.1, 1.1, 1.3, k * 47, -0.1),
    ),
    ...banks(10, 80, 9, 3.6, 0.8, 0.25),
  ],
};

const mudHoles: Section = {
  id: 'mud-holes',
  name: 'Mud Holes',
  grade: 'moderate',
  hint: 'Three mud holes, each deeper than the last, with a gate in front of every one. Second gear in low range, steady throttle, straight through; lock the diffs if the wheels start to dig.',
  note: 'Three mud holes in a row on the creek flat, a gate before each.',
  points: [
    [-149, 70],
    [-148, 54],
    [-145, 38],
    [-140, 22],
    [-136, 10],
  ],
  bogs: [
    { at: 13, length: 5, width: 3.6, depth: 0.3 },
    { at: 28, length: 5.5, width: 3.8, depth: 0.38 },
    { at: 44, length: 6.5, width: 4, depth: 0.46 },
  ],
  track: {
    erosion: [
      { at: 28, side: 1 },
      { at: 44, side: -1 },
    ].map(({ at, side }) => ({
      path: [
        [at - 3, side * 0.75],
        [at, side * 0.7],
        [at + 3, side * 0.75],
      ] as const,
      width: 0.9,
      depth: 0.24,
    })),
  },
  gates: [[7], [21, 0, 3.4], [36, 0, 3.4], [-3]],
};

// The creek bridge: a deck with kerbs, a little above the water on raised approaches.
const creekBridgePoints: Point[] = [
  [-136, 10],
  [-134, -2],
  [-131, -14],
  [-130, -26],
  [-128, -38],
  [-124, -50],
];
const creekAt = crossing(creekBridgePoints, creekLine);
const creekBridge: Section = {
  id: 'creek-bridge',
  name: 'Creek Bridge',
  grade: 'easy',
  hint: 'A timber bridge over Crawler Creek, gated narrow at both ends. Line up straight before the first gate and crawl across.',
  note: 'A timber bridge over Crawler Creek with narrow gates at either end.',
  points: creekBridgePoints,
  track: {
    width: 3.6,
    smooth: 4,
    bridges: [{ kind: 'deck', from: creekAt - 7, to: creekAt + 7, width: 3.8, kerb: 0.18 }],
  },
  gates: [[creekAt - 10, 0, 3.3], [creekAt + 10, 0, 3.3], [-3]],
};

const logRun: Section = {
  id: 'log-run',
  name: 'Log Run',
  grade: 'moderate',
  hint: 'Logs across the track along the foot of Knuckle Ridge. Cross each one at an angle so one wheel climbs at a time; square on, the belly can hang up.',
  note: 'Fallen logs across the track along the foot of Knuckle Ridge.',
  points: [
    [-124, -50],
    [-112, -56],
    [-98, -60],
    [-84, -62],
    [-70, -63],
  ],
  logs: [
    { at: 9, lateral: 0, length: 6, radius: 0.2, angleDeg: 20 },
    { at: 18, lateral: 0, length: 6, radius: 0.24, angleDeg: -18 },
    { at: 27, lateral: 0, length: 6, radius: 0.22, angleDeg: 14 },
    { at: 36, lateral: 0, length: 6.5, radius: 0.27, angleDeg: -22 },
    { at: 45, lateral: 0, length: 6, radius: 0.24 },
  ],
  stones: [9, 18, 27, 36, 45].flatMap((at, k) => [
    boulder(at, -3.7, 0.55 + k * 0.04, 1.1, 1.3, k * 53, -0.1),
    boulder(at + 0.6, 3.7, 0.5 + k * 0.05, 1.0, 1.2, k * 61, -0.1),
  ]),
  gates: [[4], [13.5, 0, 3.4], [31.5, 0, 3.4], [-3]],
};

// Switchbacks: five legs and four hairpins up the south face of Knuckle Ridge.
const switchbackPoints = switchbacks(
  [
    [-70, -18, -63, -69],
    [-18, -66, -85, -91],
    [-66, -18, -107, -113],
    [-18, -66, -129, -135],
    [-66, -26, -151, -156],
  ],
  8,
);
const switchbackLength = lengthOf(switchbackPoints);
/** Arc lengths of the hairpin apexes, found as the points furthest east and west on each leg pair. */
const hairpinApexes = (() => {
  const poly = polyOf(switchbackPoints);
  const out: number[] = [];
  for (let k = 1; k + 1 < poly.count; k++) {
    const x = poly.xs[k];
    if ((x > poly.xs[k - 1] && x >= poly.xs[k + 1]) || (x < poly.xs[k - 1] && x <= poly.xs[k + 1]))
      out.push(poly.s[k]);
  }
  return out;
})();
const switchbacksSection: Section = {
  id: 'switchbacks',
  name: 'Switchbacks',
  grade: 'hard',
  hint: 'Four tight hairpins up the face of Knuckle Ridge. Swing wide into each turn, keep the gate flags either side of you, and if the nose won’t come round, stop, back up a little and turn again. One way, uphill.',
  note: 'Five legs and four tight hairpins up the south face of Knuckle Ridge. One way, uphill.',
  points: switchbackPoints,
  track: { width: 4.2, shoulder: 3.5, smooth: 4, camber: 0.2, even: [[0, switchbackLength]] },
  gates: [
    [5],
    // Every hairpin is gated just before and just after its apex, towards the outside of
    // the turn: the east ones turn left and the west ones right.
    ...hairpinApexes.flatMap((s, k) => {
      const out = k % 2 ? -0.4 : 0.4;
      return [[s - 7, out, 3.6] as const, [s + 7, out, 3.6] as const];
    }),
    [-4],
  ],
};

const summitRocks: Section = {
  id: 'summit-rocks',
  name: 'Summit Rocks',
  grade: 'moderate',
  hint: 'Granite ledges and boulders along the top of the ridge. Low range, crawl control, and put a tyre on each rock rather than dropping between them. Lock the rear if a wheel lifts.',
  note: 'Granite ledges and boulders along the top of Knuckle Ridge.',
  points: [
    [-26, -156],
    [-6, -162],
    [16, -167],
    [40, -170],
    [64, -171],
    [80, -172],
  ],
  track: { surface: 'rock', camber: 0.2 },
  stones: [
    rockStep(12, 0, 0.3, 4.2, tread(0.3), 3),
    ...(
      [
        [22, -0.75, 0.32, 1.2],
        [25, 0.8, 0.38, 1.3],
        [28.5, -0.7, 0.42, 1.4],
        [32, 0.75, 0.36, 1.3],
        [35.5, -0.8, 0.4, 1.4],
        [39, 0.7, 0.34, 1.2],
      ] as const
    ).map(([at, lat, h, w], k) => boulder(at, lat, h + 0.06, w, w * 1.05, k * 43, -0.06)),
    slab(50, -1.0, 0.3, 2.0, 3.2, 8),
    slab(54, 1.0, 0.34, 2.0, 3.0, -8),
    rockStep(64, -1.1, 0.34, 2.2, tread(0.34), -4),
    rockStep(64.8, 1.1, 0.28, 2.2, tread(0.28), 4),
    ...banks(18, 70, 4.5, 2.6, 1.0, 0.35),
  ],
  gates: [[4], [17, 0, 3.4], [44, 0, 3.4], [-6]],
};

const theDrop: Section = {
  id: 'the-drop',
  name: 'The Drop',
  grade: 'hard',
  hint: 'Straight down the steep east end of Knuckle Ridge through erosion ruts. Low range first gear and crawl control, wheels straight; straddle the ruts and never brake hard enough to lock the wheels. One way, downhill.',
  note: 'A steep, rutted descent off the east end of Knuckle Ridge. One way, downhill.',
  points: [
    [80, -172],
    [96, -173],
    [114, -174],
    [132, -175],
    [150, -174],
    [160, -168],
  ],
  track: {
    smooth: 4,
    camber: 0.4,
    erosion: [
      {
        path: [
          [16, 0.1],
          [26, 0],
          [34, -0.4],
          [44, -1.2],
          [52, -1.3],
        ],
        width: 0.9,
        depth: 0.42,
      },
      {
        path: [
          [22, 1.4],
          [40, 1.35],
        ],
        width: 0.8,
        depth: 0.34,
      },
    ],
  },
  gates: [[4], [-6, 0, 3.4]],
};

// The two-plank bridge over a bog at the foot of the ridge.
const skinnyBridgePoints: Point[] = [
  [160, -168],
  [166, -156],
  [168, -142],
  [168, -128],
  [166, -112],
];
const skinnyMiddle = 29;
const skinnyBridge: Section = {
  id: 'skinny-bridge',
  name: 'Skinny Bridge',
  grade: 'hard',
  hint: 'Two planks over a bog, one under each wheel track. Line up dead straight between the gates, then crawl over and steer as little as you can. Slip off and it’s lockers and the winch.',
  note: 'Two planks across a bog, one under each wheel track.',
  points: skinnyBridgePoints,
  track: {
    bridges: [
      {
        kind: 'wheelTracks',
        from: skinnyMiddle - 6,
        to: skinnyMiddle + 6,
        width: 0.62,
        gauge: 1.48,
        kerb: 0.1,
      },
    ],
  },
  bogs: [{ at: skinnyMiddle, length: 10, width: 6, depth: 0.55 }],
  gates: [[skinnyMiddle - 10, 0, 3], [skinnyMiddle + 10, 0, 3.2], [-3]],
};

const waterCrossingPoints: Point[] = [
  [166, -112],
  [161, -88],
  [156, -62],
  [154, -38],
  [153, -12],
  [151, 6],
];
const fordAt = crossing(waterCrossingPoints, creekLine);
const waterCrossing: Section = {
  id: 'water-crossing',
  name: 'Water Crossing',
  grade: 'moderate',
  hint: 'A wide gravel ford across Crawler Creek, gated mid-stream. Ease in, hold a steady walking pace to make a small bow wave, and drive straight out the far side.',
  note: 'A gravel ford across Crawler Creek, gated mid-stream.',
  points: waterCrossingPoints,
  track: { surface: 'gravel', width: 4, smooth: 5 },
  gates: [[fordAt - 12], [fordAt, 0, 4], [fordAt + 12], [-3]],
};

const rampBridgePoints: Point[] = [
  [151, 6],
  [148, 20],
  [144, 34],
  [138, 48],
];
const rampBridge: Section = {
  id: 'ramp-bridge',
  name: 'Ramp Bridge',
  grade: 'moderate',
  hint: 'An up-and-over timber ramp. Square up, crawl up the ramp, and ease over the top: the nose drops away before the far ramp comes into view.',
  note: 'An up-and-over timber ramp bridge, 1.2 m high.',
  points: rampBridgePoints,
  track: {
    bridges: [{ kind: 'deck', from: 15, to: 31, width: 3.2, kerb: 0.15, rise: 1.2, ramp: 4.8 }],
  },
  gates: [
    [10, 0, 3.4],
    [36, 0, 3.4],
  ],
};

/** Boulders along a field: [at, lateral, height, width]. */
const boulderField: ReadonlyArray<readonly [number, number, number, number]> = [
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

const rockGarden: Section = {
  id: 'rock-garden',
  name: 'Rock Garden',
  grade: 'hard',
  hint: 'Boulders choke the dry creek bed. Both lockers, low range, and climb the big rocks with your tyres; keep the belly off the small ones in the middle.',
  note: 'Boulders packed into a dry creek bed.',
  points: [
    [138, 48],
    [120, 60],
    [96, 70],
    [72, 77],
    [48, 82],
    [24, 86],
    [4, 90],
  ],
  track: {
    surface: 'rock',
    camber: 0.2,
    cut: [
      [0, 0],
      [12, 1],
      [118, 1],
      [134, 0],
    ],
  },
  // Two fields of tyre-high boulders, packed so a tyre is always lifting.
  stones: [16, 64].flatMap((from, f) => [
    ...boulderField.map(([at, lat, h, w], k) =>
      boulder(from + at, lat, h * 1.25 + 0.06, w, w, (f * 17 + k) * 41, -0.06),
    ),
    ...banks(from, from + 32, 3.5, 2.3, 1.1, 0.4),
  ]),
  gates: [[6], [17, 0, 3.6], [52, 0, 3.4], [65, 0, 3.6], [100, 0, 3.4], [-6]],
};

const finish: Section = {
  id: 'finish',
  name: 'Last Splash',
  grade: 'easy',
  hint: 'The run home: one last mud hole, then the finish gate at the Trailhead.',
  note: 'A last mud hole and the finish gate at the Trailhead.',
  points: [
    [4, 90],
    [-24, 98],
    [-56, 110],
    [-86, 128],
    [-112, 148],
    [-131, 162],
  ],
  bogs: [{ at: 72, length: 7, width: 4, depth: 0.42 }],
  gates: [[5], [64, 0, 3.6], [82, 0, 3.6], [-4, 0, 4]],
};

export const gateTrailSections: Section[] = [
  startChute,
  mudHoles,
  creekBridge,
  logRun,
  switchbacksSection,
  summitRocks,
  theDrop,
  skinnyBridge,
  waterCrossing,
  rampBridge,
  rockGarden,
  finish,
];

/** Gates numbered from 1 in driving order, across every section. */
export const gateTrailGates: GateDef[] = (() => {
  let n = 0;
  return gateTrailSections.flatMap((s) =>
    s.gates
      .map(([at, lateral, width]) => ({
        at: along(s.points, at),
        lateral: lateral ?? 0,
        width: width ?? GATE_WIDTH,
      }))
      .sort((a, b) => a.at - b.at)
      .map((g) => ({ n: ++n, trackId: s.id, ...g })),
  );
})();

const gateRange = (s: Section) => {
  const ns = gateTrailGates.filter((g) => g.trackId === s.id).map((g) => g.n);
  return ns.length > 1 ? `Gates ${ns[0]}–${ns[ns.length - 1]}` : `Gate ${ns[0]}`;
};

export const gateTrailTracks: TrackDef[] = gateTrailSections.map((s) => ({
  ...TRAIL,
  ...s.track,
  id: s.id,
  name: s.name,
  points: s.points,
}));

export const gateTrailTrails: CrawlTrailDef[] = gateTrailSections.map((s) => ({
  id: s.id,
  name: s.name,
  trackId: s.id,
  difficulty: s.grade,
  sections: [
    {
      from: 0,
      to: 1000,
      name: gateRange(s),
      hint: s.hint,
      rocks: [],
      stones: s.stones ?? [],
      logs: s.logs ?? [],
    },
  ],
}));

export const gateTrailBogs: BogDef[] = gateTrailSections.flatMap((s) => {
  const poly = polyOf(s.points);
  return (s.bogs ?? []).map((b, k) => {
    const p = pointAt(poly, b.at),
      lat = b.lateral ?? 0;
    return {
      id: `${s.id}-bog-${k}`,
      x: p.x - p.dz * lat,
      z: p.z + p.dx * lat,
      radiusX: b.length / 2,
      radiusZ: b.width / 2,
      rotationDeg: (Math.atan2(p.dz, p.dx) * 180) / Math.PI,
      depth: b.depth,
    };
  });
});

export const gateTrailPatches: PatchDef[] = gateTrailBogs.map((b) => ({
  id: `${b.id}-mud`,
  kind: 'mud' as const,
  x: b.x,
  z: b.z,
  radius: b.radiusX + 1.5,
  ragged: 0.5,
}));

const middleOf = (points: readonly Point[]) => {
  const poly = polyOf(points);
  return pointAt(poly, poly.length / 2);
};

export const gateTrailPois: PoiDef[] = gateTrailSections.map((s, k) => {
  const m = middleOf(s.points);
  const poly = polyOf(s.points);
  const start = pointAt(poly, 0);
  return {
    id: s.id,
    name: `${k + 1}. ${s.name}`,
    kind: 'feature',
    x: m.x,
    z: m.z,
    radius: Math.max(18, Math.min(45, poly.length / 3)),
    reset: { x: start.x, z: start.z, headingDeg: headingOf(start) },
    note: `${gateRange(s)} · ${s.grade[0].toUpperCase()}${s.grade.slice(1)}. ${s.note}`,
  };
});

/** Every graded centreline, so signs and anchors stand clear of them all. */
const graded = gateTrailTracks.map((t) => gradedLine(t.points, t.width / 2 + t.shoulder));

export const gateTrailSigns: PropDef[] = gateTrailSections.map((s, k) =>
  endSign(graded[k], 0, `${k + 1} ${s.name} · ${s.grade.toUpperCase()}`, graded),
);

/** Marked winch anchors beside the harder sections, clear of every track. */
export const gateTrailAnchors: BoulderDef[] = (
  [
    ['mud-holes', 0.7, 6],
    ['switchbacks', 0.3, -6.5],
    ['switchbacks', 0.75, 6.5],
    ['summit-rocks', 0.5, 6],
    ['skinny-bridge', 0.55, 7],
    ['rock-garden', 0.45, -6],
    ['rock-garden', 0.8, 6],
  ] as const
).map(([id, frac, lateral]) => {
  const poly = graded[gateTrailSections.findIndex((s) => s.id === id)].poly,
    p = pointAt(poly, poly.length * frac);
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, radius: 1.15, sink: 0.4, anchor: true };
});

export const gateTrailClearings: ClearingDef[] = gateTrailSections.flatMap((s) => {
  const poly = polyOf(s.points);
  const out: ClearingDef[] = [];
  for (let at = 0; at <= poly.length; at += 25) {
    const p = pointAt(poly, at);
    out.push({ x: p.x, z: p.z, radius: 9 });
  }
  return out;
});

/** The bridges, for tests and the paper map. */
export const gateTrailBridges: Array<{ section: string; bridge: TrackBridgeDef }> = gateTrailSections.flatMap(
  (s) => (s.track?.bridges ?? []).map((bridge) => ({ section: s.id, bridge })),
);
