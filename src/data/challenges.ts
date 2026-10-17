import type { CrawlTrailDef, TrackDef, XZ, FlatDef, PoiDef, PropDef } from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';

const routes = [
  {
    id: 'v-notch',
    name: 'V-Notch',
    difficulty: 'moderate' as const,
    points: [
      [-40, 206],
      [-10, 206],
    ] as XZ[],
    bypass: [
      [-40, 206],
      [-32, 197],
      [-18, 197],
      [-10, 206],
    ] as XZ[],
    hint: 'Straddle the V with a tyre on each bank. Low range and precision crawl; keep steering small. Take the green bypass on the left to skip it.',
  },
  {
    id: 'log-steps',
    name: 'Log Steps',
    difficulty: 'moderate' as const,
    points: [
      [-2, 210],
      [23, 222],
    ] as XZ[],
    bypass: [
      [-2, 210],
      [5, 202],
      [23, 210],
      [23, 222],
    ] as XZ[],
    hint: 'Three staggered logs lift alternating wheels. Crawl steadily; add the rear locker if a tyre unloads. Green markers lead around the logs.',
  },
  {
    id: 'boulder-gates',
    name: 'Boulder Gates',
    difficulty: 'hard' as const,
    points: [
      [31, 232],
      [21, 258],
    ] as XZ[],
    bypass: [
      [31, 232],
      [42, 240],
      [35, 257],
      [21, 258],
    ] as XZ[],
    hint: 'Line up square through both narrow rock gates. Use C for a front-corner view; unlock the front for corrections. Back out if the bumper catches.',
  },
  {
    id: 'sidewinder-shelf',
    name: 'Sidewinder Shelf',
    difficulty: 'hard' as const,
    points: [
      [10, 265],
      [-19, 257],
    ] as XZ[],
    bypass: [
      [10, 265],
      [3, 278],
      [-13, 278],
      [-19, 257],
    ] as XZ[],
    hint: 'A raised shelf leans up to 20 degrees. Stay centred, crawl smoothly and avoid a sharp downhill turn. The green bypass stays on gentler ground.',
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
    name: '4WD Challenge Loop',
    hint: 'Next: V-Notch. Amber and red markers enter obstacles; green markers take the wider bypasses. The loop returns here.',
  },
  {
    id: 'challenge-link-logs',
    points: [
      [-10, 206],
      [-2, 210],
    ],
    name: 'Next · Log Steps',
    hint: 'Follow the green link to Log Steps. Choose the marked log lane or the wider gravel bypass.',
  },
  {
    id: 'challenge-link-gates',
    points: [
      [23, 222],
      [31, 232],
    ],
    name: 'Next · Boulder Gates',
    hint: 'Boulder Gates is next. The red lane needs a square approach; the green bypass goes around both gates.',
  },
  {
    id: 'challenge-link-shelf',
    points: [
      [21, 258],
      [10, 265],
    ],
    name: 'Next · Sidewinder Shelf',
    hint: 'Sidewinder Shelf is the last challenge. Choose the red shelf or follow the green markers around it.',
  },
  {
    id: 'challenge-return',
    points: [
      [-19, 257],
      [-40, 242],
      [-57, 213],
    ],
    name: 'Return · Granite Link',
    hint: 'Follow green markers back to Granite Link and camp. Turn onto the signed loop entrance to try another line.',
  },
];

const gravel = { width: 4.2, shoulder: 1.8, smooth: 6, surface: 'gravel' as const, ruts: 0.02, camber: 0.1 };
export const challengeTracks: TrackDef[] = [
  ...routes.flatMap((route) => [
    {
      id: route.id,
      name: route.name,
      points: route.points,
      width: 3.2,
      shoulder: 1.5,
      smooth: 4,
      surface: 'rock' as const,
      ruts: 0.025,
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

const notch = [
  [5, 0.12, 8],
  [8, 0.2, 16],
  [11, 0.28, 24],
  [14, 0.28, 24],
  [17, 0.28, 24],
  [20, 0.2, 16],
  [23, 0.12, 8],
].flatMap(([at, height, roll]) =>
  [-1, 1].map((side) => ({
    at,
    height,
    lateral: side * 0.8,
    width: 1.6,
    length: 3.15,
    rollDeg: side * roll,
  })),
);
const gates = [9, 18].flatMap((at) =>
  [-1, 1].map((side) => ({
    at,
    lateral: side * 1.775,
    width: 1.4,
    length: 2,
    height: 1.1,
  })),
);
const shelf = [
  [4, 0.12, 6],
  [6, 0.24, 10],
  [8, 0.36, 14],
  [10, 0.5, 18],
  [12, 0.58, 20],
  [14, 0.58, 20],
  [16, 0.58, 20],
  [18, 0.5, 18],
  [20, 0.36, 14],
  [22, 0.24, 10],
  [24, 0.12, 6],
].map(([at, height, rollDeg]) => ({ at, height, rollDeg, lateral: 0, width: 3.2, length: 2.3 }));

export const challengeTrails: CrawlTrailDef[] = routes.map((route) => ({
  id: route.id,
  name: route.name,
  trackId: route.id,
  bypassTrackId: `${route.id}-bypass`,
  difficulty: route.difficulty,
  bypassHint: `Follow green markers around ${route.name} and rejoin the challenge loop. Amber or red markers enter the obstacle; the bypass needs no lockers.`,
  sections: [
    {
      from: 0,
      to: 40,
      name: route.difficulty === 'hard' ? 'Hard challenge' : 'Moderate challenge',
      hint: route.hint,
      rocks:
        route.id === 'v-notch'
          ? notch
          : route.id === 'boulder-gates'
            ? gates
            : route.id === 'sidewinder-shelf'
              ? shelf
              : [],
      logs:
        route.id === 'log-steps'
          ? [
              { at: 7, lateral: -0.45, length: 2.3, radius: 0.22, angleDeg: 10 },
              { at: 12, lateral: 0.45, length: 2.3, radius: 0.24, angleDeg: -12 },
              { at: 18, lateral: -0.45, length: 2.3, radius: 0.26, angleDeg: 8 },
            ]
          : [],
    },
  ],
}));

const polys = routes.map((route) => densify(route.points, 1));
export const challengeFlats: FlatDef[] = routes.map((route, i) => {
  const p = pointAt(polys[i], polys[i].length / 2);
  return { id: `${route.id}-pad`, x: p.x, z: p.z, radius: 16, blend: 6 };
});
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
    radius: 10,
    reset: { x: start.x, z: start.z, headingDeg: (Math.atan2(start.dx, -start.dz) * 180) / Math.PI },
    note: `${route.difficulty.toUpperCase()} · 4WD Challenge Loop. ${route.hint}`,
  };
});
export const challengeAnchors = polys.map((poly) => {
  const p = pointAt(poly, poly.length * 0.65),
    lateral = 5.8;
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, radius: 1.15, sink: 0.4, anchor: true };
});
export const challengeSigns: PropDef[] = [
  { kind: 'signpost', x: -143, z: 252, headingDeg: 270, text: '4WD challenges →' },
  { kind: 'signpost', x: -52, z: 209, headingDeg: 210, text: '4WD Challenge Loop →' },
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
      sign(end, i === routes.length - 1 ? 'Loop complete → Granite Link' : `Next → ${routes[i + 1].name}`),
    ];
  }),
];

export const challengeLoopRoute = [
  'challenge-entry',
  'v-notch',
  'challenge-link-logs',
  'log-steps',
  'challenge-link-gates',
  'boulder-gates',
  'challenge-link-shelf',
  'sidewinder-shelf',
  'challenge-return',
];
export const challengeEasyRoute = challengeLoopRoute.map((id) =>
  routes.some((route) => route.id === id) ? `${id}-bypass` : id,
);
