import type {
  BogDef,
  BoulderDef,
  CreekDef,
  ErosionRutDef,
  FlatDef,
  PoiDef,
  PropDef,
  TorDef,
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
  type GradedLine,
} from '../courseKit';
import { knollGraded, type Waypoint } from './ironbarkKnoll';

/**
 * Ironbark Creek and its west bank: the creek runs north to south down the west side of
 * the map in a gully about five metres below the plain, and three crossings leave the
 * knoll loop's west leg for the track along the far bank (their ends are pinned to the
 * heights measured there, scripts/level-heights.ts):
 *   - The deep crossing (north): over a metre deep on the straight line, with a shallow
 *     bar of gravel and boulders just downstream
 *   - The ford (middle): shallow water over gravel, easy ramps
 *   - The chute (south): a steep clay chute down to the water and a steeper climb out
 * On the west bank: the camp, an open bog hole and a rock garden.
 * Coordinates in metres: x = east, z = south (north is -z).
 */

/** The plain's height, and the creek's water at each crossing. */
export const PLAIN = 12;
export const water = { deep: 7.9, ford: 7.5, chute: 6.8 } as const;

export const ironbarkCreek: CreekDef = {
  id: 'ironbark-creek',
  name: 'Ironbark Creek',
  valley: 30,
  flow: 1.4,
  clear: true,
  points: [
    { x: -108, z: -256, water: 8.3, halfWidth: 6, depth: 0.7, bankSlope: 1 },
    { x: -124, z: -150, water: 8.1, halfWidth: 6.5, depth: 0.8, bankSlope: 1 },
    { x: -119, z: -92, water: 7.98, halfWidth: 7, depth: 1, bankSlope: 1 },
    // The deep crossing: wide, slow and over a metre deep in the middle. The banks are laid
    // back for 40 m along it, so the straight line and the bar downstream share the way in.
    { x: -116, z: -66, water: 7.92, halfWidth: 8, depth: 1.25, bankSlope: 0.27, flow: 1 },
    { x: -117, z: -44, water: 7.86, halfWidth: 8, depth: 1.25, bankSlope: 0.27, flow: 1 },
    { x: -121, z: -18, water: 7.78, halfWidth: 7, depth: 0.9, bankSlope: 1 },
    { x: -125, z: 14, water: 7.6, halfWidth: 7.5, depth: 0.6, bankSlope: 1 },
    // The ford: wider still, so the water runs shallow over its gravel, between easy banks.
    {
      x: -126,
      z: 40,
      water: water.ford,
      halfWidth: 9,
      depth: 0.45,
      bankSlope: 0.2,
      bed: 'gravel',
      flow: 1.2,
    },
    { x: -124, z: 66, water: 7.4, halfWidth: 7, depth: 0.6, bankSlope: 1 },
    // The chute: a narrow reach between steep clay banks.
    { x: -119, z: 140, water: water.chute, halfWidth: 4.2, depth: 0.5, bankSlope: 1.15 },
    { x: -128, z: 256, water: 6.5, halfWidth: 6, depth: 0.8, bankSlope: 1 },
  ],
  // The shallow line at the deep crossing: a gravel bar just downstream, rough and holed.
  bars: [{ x: -116.5, z: -48, radiusX: 12, radiusZ: 5.5, rotationDeg: 0, depth: 0.55 }],
  rough: [{ x: -116.5, z: -48, radius: 11, height: 0.12 }],
  holes: [
    { x: -120.5, z: -46.5, radius: 1.6, depth: 0.5 },
    { x: -113, z: -50, radius: 1.7, depth: 0.5 },
  ],
};

/** Boulders on the bar: weave between them. */
const barBoulders: BoulderDef[] = [
  { x: -122.5, z: -50.5, radius: 0.7, sink: 0.35 },
  { x: -118, z: -45, radius: 0.8, sink: 0.4 },
  { x: -115.5, z: -51.5, radius: 0.65, sink: 0.3 },
  { x: -111.5, z: -46, radius: 0.75, sink: 0.35 },
];

// --- The crossings ---------------------------------------------------------------------

const deepCrossing: Waypoint[] = [
  [-90.2, -60, 11.98],
  [-103, -60.5],
  [-116, -61],
  [-130, -61.5],
  [-150, -63],
  [-170, -66, 11.92],
];

const ford: Waypoint[] = [
  [-92, 40, 11.81],
  [-106, 40],
  [-126, 40],
  [-146, 41],
  [-170, 44, 11.95],
];

/**
 * The chute, after Palm Creek on the Telegraph Track: 8 m of clay at about 32° down to the
 * water, and 11 m at about 27° out, with a step of rock at the lip.
 */
const CHUTE_X = -119;
const chute: Waypoint[] = [
  [-90, 140, 11.87],
  [CHUTE_X + 21, 140, PLAIN],
  [CHUTE_X + 12.5, 140, PLAIN],
  [CHUTE_X + 4.2, 140, water.chute],
  [CHUTE_X, 140],
  [CHUTE_X - 4.2, 140, water.chute],
  [CHUTE_X - 15.2, 140, PLAIN + 0.4],
  [CHUTE_X - 20, 140, PLAIN + 0.4],
  [CHUTE_X - 30, 141, PLAIN],
  [-166, 144, 12.48],
];
/** Metres along the chute to its lip and to the lip of the climb out. */
export const chuteLip = -90 - (CHUTE_X + 12.5);
export const chuteExitLip = -90 - (CHUTE_X - 15.2);

/** The erosion rut down the chute: it starts under the left wheels and wanders across. */
const chuteRut: ErosionRutDef = {
  path: [
    [chuteLip - 3, -0.75],
    [chuteLip + 1, -0.45],
    [chuteLip + 4, 0],
    [chuteLip + 6.5, 0.4],
    [chuteLip + 8.5, 0.8],
  ],
  width: 0.55,
  depth: 0.5,
};

// --- The west bank ---------------------------------------------------------------------

const westBank: Waypoint[] = [
  [-150, -196],
  [-160, -150],
  [-168, -108],
  [-170, -66],
  [-172, -20],
  [-170, 44],
  [-168, 100],
  [-166, 144],
  [-160, 185],
  [-150, 206],
];

/**
 * Into the camp and through it: a track's edges are mud, and so is the strip across its end,
 * so the track ends beyond where the car is parked, not in front of it.
 */
const campSpur: Waypoint[] = [
  [-170, 44, 11.95],
  [-182, 41],
  [-196, 40],
  [-208, 40],
];

/** The bog hole: a side loop west of the bank track, through an open bog. */
const bogLoop: Waypoint[] = [
  [-169.3, 66, 12.29],
  [-184, 72],
  [-198, 86],
  [-202, 102],
  [-194, 118],
  [-180, 124],
  [-167.1, 122, 11.81],
];

/** The rock garden: a side loop at the north end, over and between granite. */
const rockGarden: Waypoint[] = [
  [-160, -150, 11.73],
  [-176, -162],
  [-194, -160],
  [-206, -144],
  [-204, -124],
  [-190, -110],
  [-168, -108, 11.86],
];

/** A spur off the knoll loop's north-east corner to the second camp. */
const paddockSpur: Waypoint[] = [
  [151, -95, 11.36],
  [156, -120],
  [152, -146],
  [152, -160],
];

/** Granite on the rock garden: steps, slabs and boulders, with a way between for a careful line. */
const gardenStones: TrailStoneDef[] = [
  // The way in: broken rock, then a step right across.
  boulder(14, -1.1, 0.32, 1.3, 1.6, 20),
  boulder(16.5, 0.9, 0.36, 1.4, 1.5, 70),
  boulder(19, -0.4, 0.28, 1.2, 1.3, 130),
  rockStep(24, 0, 0.36, 5, 2.2),
  // A slab leaning left, with a boulder to climb at its end.
  slab(31, -0.6, 0.5, 3.4, 5, -9, 6),
  boulder(35.5, 1.5, 0.62, 1.6, 1.8, 40),
  // Two whalebacks to straddle or ride.
  slab(43, -1.5, 0.55, 1.5, 5.5, 0, -4),
  slab(43.5, 1.5, 0.5, 1.4, 5, 0, 5),
  // Staggered boulders: one wheel at a time.
  boulder(51, -1, 0.5, 1.5, 1.6, 15),
  boulder(53.5, 1.1, 0.55, 1.6, 1.5, 95),
  boulder(56, -0.9, 0.6, 1.5, 1.7, 160),
  boulder(58.5, 1, 0.5, 1.4, 1.6, 230),
  // The big step.
  rockStep(66, 0, 0.5, 5.2, 2.6),
  rockStep(70.5, 0.4, 0.42, 4.6, 2.2, 4),
  // The way out: a slab leaning right and a last scatter.
  slab(79, 0.5, 0.48, 3.6, 5.5, 8, -8),
  boulder(86, -1.2, 0.4, 1.4, 1.5, 50),
  boulder(88.5, 0.8, 0.34, 1.3, 1.4, 110),
  // Larger rocks either side, so the line stays in the garden.
  ...banks(12, 92, 4, 3.6, 1.4, 0.4),
];

const dirt = {
  width: 4,
  shoulder: 3,
  batter: 0.5,
  smooth: 8,
  surface: 'dirt',
  ruts: 0.05,
  camber: 0.3,
  pinMode: 'follow',
  rough: { bumps: 0.08, swells: 0.08, potholes: 2, potholeDepth: 0.18, washouts: 1, washoutDepth: 0.2 },
} as const;

export const creekTracks: TrackDef[] = [
  {
    id: 'west-bank',
    name: 'West bank track',
    points: westBank,
    ...dirt,
    routeHint: 'Along the creek’s far bank: the camp, the bog hole and the rock garden are off this track',
  },
  {
    id: 'camp-spur',
    name: 'Camp track',
    points: campSpur,
    ...dirt,
    smooth: 5,
    routeHint:
      'The ford is straight ahead. The bog hole is to the right along the bank track, the rock garden to the left',
  },
  {
    id: 'paddock-spur',
    name: 'Top paddock track',
    points: paddockSpur,
    ...dirt,
    smooth: 5,
    routeHint: 'Down to the Knoll track: the bog trench is along it to the right',
  },
  {
    id: 'creek-ford',
    name: 'The ford',
    points: ford,
    ...dirt,
    surface: 'gravel',
    smooth: 6,
    routeHint: 'Shallow water over gravel. Any gear, keep it steady',
  },
  {
    id: 'creek-deep',
    name: 'The deep crossing',
    points: deepCrossing,
    ...dirt,
    smooth: 5,
    routeHint:
      'Over a metre deep on the straight line: crawl, or the bow wave floods the engine. The shallow bar is just downstream, to the left',
  },
  {
    id: 'creek-chute',
    name: 'The chute',
    points: chute,
    width: 3.1,
    shoulder: 2,
    batter: 1.4,
    smooth: 2,
    ruts: 0.04,
    camber: 0.2,
    pinMode: 'linear',
    pinSmooth: 2,
    surface: 'clay',
    erosion: [chuteRut],
    stones: [
      // A step of rock at the lip of the climb out.
      rockStep(chuteExitLip - 0.9, 0, 0.38, 4.2, 1.8),
      boulder(chuteExitLip + 1.5, 3, 0.8, 1.4),
      boulder(chuteLip - 1, -2.9, 0.7, 1.3),
    ],
    routeHint: 'Low range, both lockers, wheels straddling the rut. Crawl down; crawl out, or winch',
  },
  {
    id: 'bog-hole',
    name: 'The bog hole',
    points: bogLoop,
    ...dirt,
    width: 3.6,
    smooth: 5,
    rough: undefined,
    routeHint: 'Deep sticky mud. Lock both, pick a line and keep moving; the trees are there to winch from',
  },
  {
    id: 'rock-garden',
    name: 'The rock garden',
    points: rockGarden,
    width: 4.4,
    shoulder: 2.5,
    batter: 0.5,
    smooth: 5,
    surface: 'rock',
    ruts: 0,
    camber: 0.3,
    pinMode: 'follow',
    stones: gardenStones,
    routeHint: 'Low range, lockers and crawl. Put a wheel on each rock rather than straddling it',
  },
];

/**
 * The open bog on the bog loop: two holes end to end, each over the bonnet's depth below the
 * ground round it at its middle and shallower towards its edges, so there are lines to pick.
 */
export const creekBogs: BogDef[] = (() => {
  const poly = densify(
    bogLoop.map((p) => [p[0], p[1]] as XZ),
    0.5,
  );
  const spots: Array<readonly [number, number, number]> = [
    // [share of the way round the loop, half-length, depth]
    [0.4, 9.5, 1],
    [0.62, 8.5, 0.85],
  ];
  return spots.map(([share, half, depth], k): BogDef => {
    const p = pointAt(poly, poly.length * share);
    return {
      id: `the-bog-hole-${k}`,
      x: Math.round(p.x * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      radiusX: 6.5,
      radiusZ: half,
      rotationDeg: (Math.atan2(p.dx, -p.dz) * 180) / Math.PI,
      depth,
      deep: true,
      winchTrees: true,
    };
  });
})();

export const creekFlats: FlatDef[] = [
  { id: 'ironbark-camp', x: -200, z: 40, radius: 12, blend: 10 },
  { id: 'top-paddock-camp', x: 152, z: -156, radius: 11, blend: 10 },
];

export const creekTors: TorDef[] = [
  { id: 'garden-tor', x: -218, z: -168, radius: 8, count: 7 },
  { id: 'garden-tor-east', x: -182, z: -134, radius: 6, count: 5 },
];

/** Marked rocks to winch from: above the chute's climb out, and on the bar's far bank. */
export const creekAnchors: BoulderDef[] = [
  { x: CHUTE_X - 23, z: 137.2, radius: 0.85, sink: 0.3, anchor: true, label: 'Exit boulder' },
  { x: CHUTE_X - 24, z: 143.2, radius: 0.8, sink: 0.3, anchor: true, label: 'Exit boulder' },
  { x: CHUTE_X + 19, z: 137.3, radius: 0.8, sink: 0.3, anchor: true, label: 'East bank boulder' },
  { x: -143, z: -55, radius: 0.85, sink: 0.3, anchor: true, label: 'West bank boulder' },
  { x: -92.5, z: -54, radius: 0.85, sink: 0.3, anchor: true, label: 'East bank boulder' },
  ...barBoulders,
];

const lines = creekTracks.map((t) => ({ id: t.id, line: gradedLine(t.points, t.width / 2 + t.shoulder) }));
const graded: GradedLine[] = [...knollGraded, ...lines.map((l) => l.line)];
const lineOf = (id: string) => lines.find((l) => l.id === id)!.line;
const bothEnds = (id: string, start: string, far = start): PropDef[] => [
  endSign(lineOf(id), 0, start, graded),
  endSign(lineOf(id), 1, far, graded),
];

export const creekProps: PropDef[] = [
  ...bothEnds('creek-ford', 'The ford — easy'),
  ...bothEnds('creek-deep', 'Deep crossing — bar downstream'),
  ...bothEnds('creek-chute', 'The chute — steep, hard'),
  ...bothEnds('bog-hole', 'The bog hole — winch'),
  ...bothEnds('rock-garden', 'Rock garden — crawl'),
  { kind: 'fireRing', x: -201, z: 46.5, headingDeg: 0 },
  { kind: 'logSeat', x: -203.5, z: 48, headingDeg: 60 },
  { kind: 'hut', x: -205, z: 31.5, headingDeg: 110, flatten: 5 },
  { kind: 'waterTank', x: -209.5, z: 34.5, headingDeg: 110 },
  { kind: 'noticeBox', x: -193, z: 35.5, headingDeg: 200, text: 'Ironbark Creek' },
  { kind: 'fireRing', x: 158, z: -157, headingDeg: 0 },
  { kind: 'logSeat', x: 160.5, z: -158.5, headingDeg: 300 },
];

const middle = (id: string): XZ => {
  const poly = lineOf(id).poly;
  const p = pointAt(poly, poly.length / 2);
  return [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10];
};
/** Where test mode's "Start from" puts the car: a little way along the line, facing along it. */
const lineStart = (id: string, along = 4): NonNullable<PoiDef['reset']> => {
  const p = pointAt(lineOf(id).poly, along);
  return { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, headingDeg: Math.round(headingOf(p)) };
};
const feature = (id: string, name: string, note: string, at: XZ = middle(id), radius = 20): PoiDef => ({
  id,
  name,
  kind: 'feature',
  x: at[0],
  z: at[1],
  radius,
  reset: lineStart(id),
  note,
});

export const creekPois: PoiDef[] = [
  {
    id: 'ironbark-camp',
    name: 'Ironbark camp',
    kind: 'campsite',
    x: -200,
    z: 40,
    radius: 16,
    reset: { x: -200, z: 40, headingDeg: 90 },
    note: 'The camp on the creek’s west bank',
  },
  {
    id: 'top-paddock-camp',
    name: 'Top paddock camp',
    kind: 'campsite',
    x: 152,
    z: -156,
    radius: 14,
    reset: { x: 152, z: -153, headingDeg: 180 },
    note: 'A second camp, across the knoll from the creek',
  },
  feature('creek-ford', 'The ford', 'Shallow water over gravel', [-126, 40]),
  feature('creek-deep', 'The deep crossing', 'Over a metre deep; a shallow bar just downstream', [-116, -58]),
  feature('creek-chute', 'The chute', 'A steep chute in, a steeper climb out', [CHUTE_X, 140]),
  feature('bog-hole', 'The bog hole', 'Deep sticky mud, with trees to winch from'),
  feature('rock-garden', 'The rock garden', 'Granite steps, slabs and boulders'),
];

/** Open ground at the camps, the crossings and the west bank's obstacles. */
export const creekClearings = [
  { x: -200, z: 40, radius: 26 },
  { x: 152, z: -156, radius: 22 },
  { x: -126, z: 40, radius: 30 },
  { x: -116, z: -55, radius: 30 },
  { x: CHUTE_X, z: 140, radius: 26 },
  { x: -196, z: 100, radius: 30 },
  { x: -190, z: -136, radius: 40 },
];
