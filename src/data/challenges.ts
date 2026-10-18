import type {
  CrawlTrailDef,
  TrackDef,
  XZ,
  PoiDef,
  PropDef,
  TrailDifficulty,
  TrailStoneDef,
} from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';

/**
 * The Granite Crawl: six rock obstacles in rising difficulty, joined into one loop from
 * the end of Granite Link. Each has a wider gravel bypass that needs no lockers.
 * Sizes are against the vehicle: 0.38 m tyres, 1.45 m track, 2.3 m wheelbase and
 * roughly 0.44 m under the chassis rails.
 */
const boulder = (
  at: number,
  lateral: number,
  height: number,
  width: number,
  length = width,
  yawDeg = 0,
): TrailStoneDef => ({ shape: 'boulder', at, lateral, height, width, length, yawDeg });
const slab = (
  at: number,
  lateral: number,
  height: number,
  width: number,
  length: number,
  rollDeg = 0,
  pitchDeg = 0,
): TrailStoneDef => ({ shape: 'slab', at, lateral, height, width, length, rollDeg, pitchDeg });
/** Rocks just off the line that frame the obstacle and stop it being driven around. */
const borders = (from: number, to: number, step: number, offset = 2.35): TrailStoneDef[] => {
  const out: TrailStoneDef[] = [];
  for (let at = from, k = 0; at <= to; at += step, k++)
    for (const side of [-1, 1])
      out.push(
        boulder(
          at + (side > 0 ? step / 2 : 0),
          side * (offset + (k % 2) * 0.25),
          0.62 + ((k * 7 + side) % 3) * 0.14,
          1.3,
          1.6,
          k * 23,
        ),
      );
  return out;
};

// Easy: knee-high granite scattered under both wheel paths. Each tyre climbs in turn,
// rocking the body, but there is always a line with open diffs in low range.
const rockGarden: TrailStoneDef[] = [
  boulder(5, -0.75, 0.18, 0.9, 0.8),
  boulder(7.4, 0.72, 0.24, 1.0, 0.9, 30),
  boulder(9.6, -0.15, 0.16, 1.0, 0.8, 70),
  boulder(11.8, -0.8, 0.27, 1.1, 1.0, 15),
  boulder(13.4, 0.78, 0.22, 0.9, 1.0),
  boulder(15.8, 0.05, 0.15, 1.5, 0.9, 10),
  boulder(18, -0.7, 0.28, 1.1, 1.1, 45),
  boulder(19.8, 0.82, 0.25, 1.0, 1.0),
  boulder(22.2, -0.6, 0.2, 0.9, 0.9),
  boulder(23.4, 0.9, 0.18, 0.9, 0.8),
  ...borders(4, 24, 4.5, 2.3),
];

// Moderate: a granite staircase. Rises of 0.26–0.4 m, the third staggered so only one
// front tyre climbs at a time, then a 16° slab back down.
const stepUps: TrailStoneDef[] = [
  slab(6, 0, 0.26, 3.0, 2.4),
  slab(8.6, 0, 0.56, 3.0, 2.8),
  slab(11.2, -0.75, 0.96, 1.5, 2.4),
  slab(11.2, 0.75, 0.66, 1.5, 2.4),
  slab(13.8, 0, 0.94, 3.0, 2.8),
  {
    shape: 'ridge',
    at: 17,
    lateral: 0,
    width: 3.0,
    length: 4.4,
    height: 0.92,
    profile: [
      [-2.2, 0.92],
      [-1.4, 0.91],
      [2.2, 0],
    ],
  },
  ...borders(5, 21, 4, 2.2),
];

// Moderate: two granite banks lean in towards a crevice that widens from 0.5 m to
// 0.8 m and deepens to about 0.5 m. Straddle it with a tyre on each bank; a tyre that
// drifts in drops into the crack and wedges.
const crevice: TrailStoneDef[] = [
  [5, 0.22, 0.5, 10],
  [7.6, 0.42, 0.6, 15],
  [10.2, 0.62, 0.7, 19],
  [12.8, 0.76, 0.8, 21],
  [15.4, 0.76, 0.8, 21],
  [18, 0.6, 0.7, 18],
  [20.6, 0.4, 0.6, 14],
  [23.2, 0.2, 0.5, 9],
].flatMap(([at, height, gap, roll]) =>
  [-1, 1].map((side) => slab(at, side * (gap / 2 + 0.7), height, 1.4, 2.65, side * roll)),
);

// Hard: 0.4–0.55 m boulders packed up a 3.5 m climb so no line misses them. Tall rocks
// alternate side to side, lifting diagonal wheels on the grade; the chassis clears the
// low middle rocks only while both tyres are up.
const boulderField: TrailStoneDef[] = [
  boulder(5, -0.75, 0.4, 1.2, 1.2, 10),
  boulder(7.6, -0.75, 0.52, 1.4, 1.5, 75),
  boulder(8.2, 0.2, 0.2, 0.8, 0.8),
  boulder(9.9, 0.78, 0.54, 1.4, 1.4, 20),
  boulder(12.2, -0.75, 0.52, 1.4, 1.4, 60),
  boulder(14.5, 0.78, 0.55, 1.4, 1.5, 5),
  boulder(15.2, -0.1, 0.24, 0.9, 0.9, 30),
  boulder(16.8, -0.75, 0.52, 1.5, 1.6, 35),
  boulder(19.1, 0.8, 0.5, 1.3, 1.4),
  boulder(21.4, -0.7, 0.45, 1.2, 1.2),
  ...borders(4, 21, 3.5, 2.25),
];

// Hard: a broad granite slab tilted towards a drop on its low side. It leans the car
// 10° on the way on, about 22° across the middle, then steps down past a boulder.
const offCamber: TrailStoneDef[] = [
  {
    shape: 'ridge',
    at: 13.5,
    lateral: 0.4,
    width: 4.2,
    length: 19,
    height: 0.75,
    profile: [
      [-9.5, 0, 0],
      [-7.5, 0.32, 6],
      [-4.5, 0.6, 14],
      [-1.5, 0.74, 22],
      [2, 0.75, 23],
      [5, 0.64, 17],
      [7.5, 0.36, 8],
      [9.5, 0, 0],
    ],
  },
  boulder(14, -2.8, 0.55, 1.4, 1.8, 20),
  boulder(9.5, 2.9, 0.8, 1.6, 1.8),
  boulder(18.5, 3.0, 0.9, 1.7, 1.6, 50),
];

// Extreme: a granite dome split by a seam. Each half leaves the ground at about 34° and
// climbs 2.7 m; the right half starts 0.6 m further on, so the body twists as it climbs.
// High range cannot hold the climb, and a wheel placed off the dome rolls the car.
const face = (lateral: number, at: number): TrailStoneDef => ({
  shape: 'ridge',
  at,
  lateral,
  width: 1.8,
  length: 15.2,
  height: 2.7,
  profile: [
    [-6.8, 0],
    [-5.4, 0.9],
    [-3.8, 1.95],
    [-2.2, 2.6],
    [0, 2.7],
    [2.4, 2.4],
    [5.6, 1.2],
    [8.4, 0],
  ],
});
const rockFace: TrailStoneDef[] = [
  face(-0.9, 13.5),
  face(0.9, 14.1),
  boulder(7.0, -0.75, 0.4, 1.0, 0.9, 15),
  boulder(9, -2.6, 1.1, 1.8, 2.2, 30),
  boulder(10.5, 2.7, 1.3, 2.0, 2.4, 70),
  boulder(17.5, -2.7, 1.2, 1.8, 2.0),
  boulder(18.5, 2.6, 0.9, 1.6, 1.8, 10),
];

interface Route {
  id: string;
  name: string;
  difficulty: TrailDifficulty;
  points: XZ[];
  bypass: XZ[];
  section: string;
  hint: string;
  stones: TrailStoneDef[];
}

const routes: Route[] = [
  {
    id: 'rock-garden',
    name: 'Rock Garden',
    difficulty: 'easy',
    points: [
      [-40, 206],
      [-12, 206],
    ],
    bypass: [
      [-40, 206],
      [-32, 197],
      [-18, 197],
      [-12, 206],
    ],
    section: 'Scattered granite',
    hint: 'Low range and precision crawl. Pick a line that puts each tyre on a rock rather than the belly, and let the body rock. Open diffs will do.',
    stones: rockGarden,
  },
  {
    id: 'step-ups',
    name: 'Granite Step-ups',
    difficulty: 'moderate',
    points: [
      [-4, 208],
      [22, 214],
    ],
    bypass: [
      [-4, 208],
      [3, 199],
      [17, 202],
      [22, 214],
    ],
    section: 'Ledge staircase',
    hint: 'Four granite ledges up to 0.4 m. Approach each square and feed throttle as the tyre touches. Lock the rear when the staggered third step lifts a wheel; ease down the slab.',
    stones: stepUps,
  },
  {
    id: 'crevice-run',
    name: 'Crevice Run',
    difficulty: 'moderate',
    points: [
      [30, 214],
      [56, 212],
    ],
    bypass: [
      [30, 214],
      [37, 204],
      [50, 203],
      [56, 212],
    ],
    section: 'V-notch crevice',
    hint: 'Straddle the crack with a tyre high on each bank. Keep steering small; use C for a front-corner view. If a tyre slips in, stop, back out and re-centre.',
    stones: crevice,
  },
  {
    id: 'boulder-field',
    name: 'Boulder Field',
    difficulty: 'hard',
    points: [
      [64, 222],
      [66, 250],
    ],
    bypass: [
      [64, 222],
      [74, 229],
      [74, 244],
      [66, 250],
    ],
    section: 'Packed boulders',
    hint: 'No clean line: climb the big rocks with your tyres so the belly clears the small ones. Lock both axles; diagonal rocks lift alternate wheels. Crawl slowly.',
    stones: boulderField,
  },
  {
    id: 'off-camber-slab',
    name: 'Off-camber Slab',
    difficulty: 'hard',
    points: [
      [60, 260],
      [34, 268],
    ],
    bypass: [
      [60, 260],
      [56, 273],
      [40, 277],
      [34, 268],
    ],
    section: 'Tilted granite',
    hint: 'The slab leans you about 22 degrees towards the low side. Keep the high-side tyres on the rock, stay smooth, and never turn downhill. Back off if the tilt passes 30.',
    stones: offCamber,
  },
  {
    id: 'rock-face',
    name: 'The Rock Face',
    difficulty: 'extreme',
    points: [
      [26, 271],
      [0, 265],
    ],
    bypass: [
      [26, 271],
      [20, 282],
      [6, 280],
      [0, 265],
    ],
    section: 'Steep granite dome',
    hint: 'A 34-degree granite dome climbs 2.7 m and twists at the seam. Low range, both lockers, wheels square on the dome and steady throttle all the way up. Crawl over the crest and let precision crawl hold you down.',
    stones: rockFace,
  },
];

const links: Array<{ id: string; points: XZ[]; name: string; hint: string }> = [
  {
    id: 'challenge-entry',
    points: [
      [-57, 213],
      [-48, 207],
      [-40, 206],
    ],
    name: 'Granite Crawl',
    hint: 'Next: Rock Garden. Six rock obstacles get harder as you go: blue easy, amber moderate, red hard, black extreme. Green markers take the gravel bypasses.',
  },
  {
    id: 'crawl-link-steps',
    points: [
      [-12, 206],
      [-4, 208],
    ],
    name: 'Next · Granite Step-ups',
    hint: 'Granite Step-ups is next: four ledges climbing nearly a metre. Amber markers enter the ledges; green markers go around.',
  },
  {
    id: 'crawl-link-crevice',
    points: [
      [22, 214],
      [30, 214],
    ],
    name: 'Next · Crevice Run',
    hint: 'Crevice Run is next. Line up on the centre of the crack before the banks start.',
  },
  {
    id: 'crawl-link-boulders',
    points: [
      [56, 212],
      [63, 216],
      [64, 222],
    ],
    name: 'Next · Boulder Field',
    hint: 'Boulder Field is next and hard. Lock both axles before the first rock; the green bypass skips it.',
  },
  {
    id: 'crawl-link-slab',
    points: [
      [66, 250],
      [64, 256],
      [60, 260],
    ],
    name: 'Next · Off-camber Slab',
    hint: 'Off-camber Slab is next. It leans to the left; keep your high-side tyres on the rock.',
  },
  {
    id: 'crawl-link-face',
    points: [
      [34, 268],
      [26, 271],
    ],
    name: 'Next · The Rock Face',
    hint: 'The Rock Face is the extreme finale. Low range, both lockers and precision crawl, or follow green to the bypass.',
  },
  {
    id: 'challenge-return',
    points: [
      [0, 265],
      [-19, 257],
      [-40, 242],
      [-57, 213],
    ],
    name: 'Return · Granite Link',
    hint: 'Follow green markers back to Granite Link and camp. Turn onto the signed entrance to run the Granite Crawl again.',
  },
];

const gravel = { width: 4.2, shoulder: 1.8, smooth: 2, surface: 'gravel' as const, ruts: 0.02, camber: 0.1 };
export const challengeTracks: TrackDef[] = [
  ...routes.flatMap((route) => [
    {
      id: route.id,
      name: route.name,
      points: route.points,
      width: 3.2,
      shoulder: 1.5,
      smooth: 2,
      surface: 'rock' as const,
      ruts: 0.01,
      camber: 0.05,
    },
    { ...gravel, id: `${route.id}-bypass`, name: `${route.name} bypass`, points: route.bypass },
  ]),
  ...links.map((link) => ({
    ...gravel,
    id: link.id,
    name: link.name,
    points: link.points,
    markerColor: 'green' as const,
    routeHint: link.hint,
  })),
];

export const challengeTrails: CrawlTrailDef[] = routes.map((route) => ({
  id: route.id,
  name: route.name,
  trackId: route.id,
  bypassTrackId: `${route.id}-bypass`,
  difficulty: route.difficulty,
  bypassHint: `Follow green markers around ${route.name} and rejoin the Granite Crawl. The bypass is gravel and needs no lockers.`,
  sections: [{ from: 0, to: 40, name: route.section, hint: route.hint, rocks: [], stones: route.stones }],
}));

const polys = routes.map((route) => densify(route.points, 1));
export const challengePois: PoiDef[] = routes.map((route, i) => {
  const poly = polys[i],
    p = pointAt(poly, poly.length / 2),
    start = pointAt(poly, 0);
  return {
    id: route.id,
    name: route.name,
    kind: 'feature',
    x: p.x,
    z: p.z,
    radius: 12.5,
    reset: { x: start.x, z: start.z, headingDeg: (Math.atan2(start.dx, -start.dz) * 180) / Math.PI },
    note: `${route.difficulty.toUpperCase()} · Granite Crawl. ${route.hint}`,
  };
});
export const challengeAnchors = polys.map((poly) => {
  const p = pointAt(poly, poly.length * 0.65),
    lateral = 5.8;
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, radius: 1.15, sink: 0.4, anchor: true };
});
export const challengeSigns: PropDef[] = [
  { kind: 'signpost', x: -143, z: 252, headingDeg: 270, text: 'Granite Crawl →' },
  { kind: 'signpost', x: -52, z: 209, headingDeg: 210, text: 'Granite Crawl →' },
  ...routes.flatMap((route, i) => {
    const start = pointAt(polys[i], 1),
      end = pointAt(polys[i], polys[i].length - 1);
    const sign = (p: typeof start, text: string): PropDef => ({
      kind: 'signpost',
      x: p.x - p.dz * 4.2,
      z: p.z + p.dx * 4.2,
      headingDeg: ((Math.atan2(p.dx, -p.dz) * 180) / Math.PI + 180) % 360,
      text,
    });
    return [
      sign(start, `${route.difficulty.toUpperCase()} · ${route.name}`),
      sign(end, i === routes.length - 1 ? 'Crawl complete → Granite Link' : `Next → ${routes[i + 1].name}`),
    ];
  }),
];

export const challengeLoopRoute = [
  'challenge-entry',
  'rock-garden',
  'crawl-link-steps',
  'step-ups',
  'crawl-link-crevice',
  'crevice-run',
  'crawl-link-boulders',
  'boulder-field',
  'crawl-link-slab',
  'off-camber-slab',
  'crawl-link-face',
  'rock-face',
  'challenge-return',
];
export const challengeEasyRoute = challengeLoopRoute.map((id) =>
  routes.some((route) => route.id === id) ? `${id}-bypass` : id,
);
