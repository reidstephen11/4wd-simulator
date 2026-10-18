import type { CrawlTrailDef, TrackDef, PropDef } from '../sim/world/mapTypes';
import { densify, pointAt } from '../sim/world/polyline';

export const graniteLinkTracks: TrackDef[] = [
  {
    id: 'granite-link',
    name: 'Granite Link',
    points: [
      [-99, 264],
      [-91, 252],
      [-82, 244],
      [-80, 231],
      [-69, 218],
      [-57, 213],
    ],
    width: 3.2,
    shoulder: 1.8,
    smooth: 4,
    surface: 'rock',
    ruts: 0.1,
    camber: 0.35,
  },
  {
    id: 'granite-link-bypass',
    name: 'Granite Link bypass',
    points: [
      [-99, 264],
      [-78, 262],
      [-58, 246],
      [-48, 225],
      [-57, 213],
    ],
    width: 4.2,
    shoulder: 2,
    smooth: 8,
    surface: 'gravel',
    ruts: 0.025,
    camber: 0.1,
  },
];

export const graniteLink: CrawlTrailDef = {
  id: 'granite-link',
  name: 'Granite Link',
  trackId: 'granite-link',
  bypassTrackId: 'granite-link-bypass',
  sections: [
    {
      from: 0,
      to: 24,
      name: 'Split rocks',
      hint: 'Low range and crawl. Place one front tyre at a time; use the rear locker if a tyre unloads.',
      rocks: [
        { at: 10, lateral: 0, width: 2.5, length: 1.7, height: 0.2 },
        { at: 16, lateral: -0.65, width: 1.1, length: 1.8, height: 0.32 },
        { at: 18.3, lateral: 0.65, width: 1.1, length: 1.8, height: 0.3 },
      ],
    },
    {
      from: 24,
      to: 43,
      name: 'Off-camber shelf',
      hint: 'Stay on the rock shelf and keep inputs gentle. The marked boulder beside the shelf is a winch anchor.',
      rocks: [
        { at: 30, lateral: 0, width: 3.2, length: 3.2, height: 0.25, rollDeg: 10 },
        { at: 35.5, lateral: 0.65, width: 1.05, length: 1.7, height: 0.3 },
        { at: 37.8, lateral: -0.65, width: 1.05, length: 1.7, height: 0.34 },
      ],
    },
    {
      from: 43,
      to: 75,
      name: 'Granite steps',
      hint: 'Approach the ledges square; use both lockers if needed. Unlock the front for the exit turn. The gravel bypass returns to camp.',
      rocks: [
        { at: 47, lateral: 0, width: 2.7, length: 1.8, height: 0.36 },
        { at: 52, lateral: -0.65, width: 1.1, length: 1.9, height: 0.38 },
        { at: 54.3, lateral: 0.65, width: 1.1, length: 1.9, height: 0.34 },
        { at: 62, lateral: -1.9, width: 1.1, length: 2.1, height: 0.65 },
        { at: 64, lateral: 1.9, width: 1.1, length: 2.1, height: 0.6 },
      ],
    },
  ],
};

export const graniteLinkSigns: PropDef[] = [
  // Beside the Mine track at the turn-off, facing traffic from camp.
  { kind: 'signpost', x: -105, z: 263, headingDeg: 287, text: '← Granite Link' },
  { kind: 'signpost', x: -101, z: 260, headingDeg: 180, text: 'TECHNICAL · Granite Link' },
  // In the fork between the rock trail and the bypass, facing the turn-off.
  { kind: 'signpost', x: -89.5, z: 257.5, headingDeg: 235, text: 'EASY · Gravel bypass →' },
  { kind: 'signpost', x: -60, z: 208, headingDeg: 210, text: 'Bypass → Camp' },
];

const poly = densify(
  graniteLinkTracks[0].points.map((p) => [p[0], p[1]] as const),
  1,
);
export const graniteLinkAnchors = [
  [29, -5],
  [54, -5],
].map(([at, lateral]) => {
  const p = pointAt(poly, at);
  return { x: p.x - p.dz * lateral, z: p.z + p.dx * lateral, radius: 1.1, sink: 0.45, anchor: true };
});
