import type { HillDef, MapDef, PropDef, TrackDef, XZ } from '../sim/world/mapTypes';
import { endSign, gradedLine } from './courseKit';
import { winchClimbs } from './winchClimbs';

/**
 * Stringybark Range: a big map of steep country. A river runs west to east through the
 * valley; north of it the land climbs in two steps, first about 60 m to The Shelf and
 * then about 70 m more to the range top, where Stringybark Peak carries a fire tower and
 * Eagle Rock stands on cliffs. Gravel fire trails zigzag up both steps and link every
 * place; eight winch climbs (src/data/winchClimbs.ts) take the direct line, four up
 * granite and four up wet clay. Eagle Rock and the old hut on Clay Knoll can only be
 * reached by winching. Coordinates in metres: x = east, z = south (north is -z).
 */
const gravel = {
  width: 4.4,
  shoulder: 2.5,
  smooth: 10,
  surface: 'gravel' as const,
  ruts: 0.02,
  camber: 0.15,
};

const stringybarkPeak: HillDef = {
  id: 'stringybark-peak',
  x: -380,
  z: -700,
  radius: 180,
  height: 35,
  shape: 'dome',
};
const wombatHill: HillDef = { id: 'wombat-hill', x: 260, z: 640, radius: 200, height: 55, shape: 'dome' };

/**
 * A road spiralling clockwise (seen from above) up a dome-shaped hill from `start`,
 * `turns` times round, ending `top` metres from the summit, so it climbs at an even,
 * gentle grade.
 */
function spiral(hill: HillDef, start: XZ, turns: number, top: number): XZ[] {
  const r0 = Math.hypot(start[0] - hill.x, start[1] - hill.z);
  const a0 = Math.atan2(start[1] - hill.z, start[0] - hill.x);
  const n = Math.max(6, Math.round(turns * 16));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const r = r0 + (top - r0) * t,
      a = a0 + turns * Math.PI * 2 * t;
    return [hill.x + r * Math.cos(a), hill.z + r * Math.sin(a)] as XZ;
  });
}

interface Road {
  id: string;
  name: string;
  points: XZ[];
  hint: string;
  /**
   * Smoothing of the road's height profile (m): the roads up the escarpments and hills
   * are graded over a long distance, cutting through steep pinches.
   */
  smooth?: number;
}

const roads: Road[] = [
  {
    id: 'valley-road',
    name: 'Valley road',
    points: [
      [-830, 150],
      [-640, 128],
      [-520, 118],
      [-420, 108],
      [-300, 126],
      [-180, 148],
      [-80, 158],
      [40, 150],
      [160, 128],
      [300, 104],
      [380, 104],
      [432, 105],
      [560, 112],
      [690, 127],
      [760, 134],
    ],
    hint: 'Valley road along the foot of the range. Granite Steps, Slippery Dip and Greasy Pole climb straight up to The Shelf; the Shelf road zigzags up the easy way.',
  },
  {
    id: 'camp-road',
    name: 'River Camp',
    points: [
      [-300, 214],
      [-300, 170],
      [-300, 128],
    ],
    hint: 'River Camp. The valley road is just north of here; the range rises behind it.',
  },
  {
    id: 'shelf-road',
    name: 'Shelf road',
    points: [
      [-180, 148],
      [-40, 104],
      [90, 50],
      [200, 0],
      [300, -34],
    ],
    smooth: 40,
    hint: 'Shelf road: a graded fire trail slanting up the escarpment to The Shelf. No lockers needed.',
  },
  {
    id: 'shelf-rim',
    name: 'Shelf rim',
    points: [
      [-538, -86],
      [-525, -60],
      [-470, -30],
      [-424, -14],
      [-345, -26],
      [-300, -36],
      [-210, -60],
      [-100, -80],
      [10, -66],
      [150, -42],
      [300, -34],
      [440, -25],
      [560, -38],
      [690, -42],
    ],
    hint: 'Along the rim of The Shelf, with the valley below. Granite Steps, Slippery Dip and Greasy Pole come up from the valley; Hut Spur climbs Clay Knoll at the west end.',
  },
  {
    id: 'shelf-connector',
    name: 'Shelf track',
    points: [
      [-100, -80],
      [-110, -160],
      [-100, -250],
      [-90, -335],
    ],
    hint: 'Across The Shelf to the foot of the range, past Shelf Camp.',
  },
  {
    id: 'range-foot',
    name: 'Range foot',
    points: [
      [-770, -346],
      [-600, -330],
      [-450, -322],
      [-300, -340],
      [-200, -336],
      [-90, -335],
      [50, -341],
      [100, -343],
    ],
    hint: 'Along the foot of the range. Goat Track and Devil’s Ladder climb it; the Range road slants up from the east end.',
  },
  {
    id: 'range-road',
    name: 'Range road',
    points: [
      [100, -343],
      [250, -380],
      [400, -430],
      [520, -475],
      [650, -530],
    ],
    smooth: 40,
    hint: 'Range road: a graded fire trail slanting up the face of the range to the top. No lockers needed.',
  },
  {
    id: 'range-top',
    name: 'Range top',
    points: [
      [650, -530],
      [560, -560],
      [470, -580],
      [400, -583],
      [360, -578],
      [330, -575],
      [230, -540],
      [163, -472],
      [40, -500],
      [0, -560],
      [-100, -520],
      [-210, -490],
      [-330, -500],
      [-480, -500],
      [-600, -480],
      [-667, -468],
    ],
    hint: 'Along the range top. Eagle Rock’s cliffs are only climbed with the winch; Stringybark Peak and its fire tower are up the track to the north.',
  },
  {
    id: 'peak-road',
    name: 'Stringybark Peak',
    points: [
      [-330, -500],
      [-295, -560],
      [-285, -625],
      [-310, -675],
      [-350, -700],
      [-372, -694],
    ],
    smooth: 40,
    hint: 'Up to the fire tower on Stringybark Peak, the highest point you can drive to.',
  },
  {
    id: 'ford-road',
    name: 'River ford',
    points: [
      [40, 150],
      [76, 220],
      [118, 300],
      [140, 380],
      [180, 430],
      [222, 448],
    ],
    hint: 'Across the river at the gravel ford to Wombat Hill.',
  },
  {
    id: 'wombat-road',
    name: 'Wombat Hill',
    points: spiral(wombatHill, [222, 448], 1, 12),
    smooth: 40,
    hint: 'Round and up Wombat Hill to the lookout. Bullock Track is the muddy way straight up.',
  },
  {
    id: 'wombat-top',
    name: 'Wombat Hill',
    points: [
      [248, 560],
      [252, 592],
      [257, 622],
    ],
    smooth: 40,
    hint: 'From the top of Bullock Track to the lookout on Wombat Hill.',
  },
];

const roadTracks: TrackDef[] = roads.map((r) => ({
  ...gravel,
  id: r.id,
  name: r.name,
  points: r.points,
  smooth: r.smooth ?? gravel.smooth,
  endBlend: r.smooth ? 25 : undefined,
  markerColor: 'green',
  routeHint: r.hint,
}));

/** Every graded line, so signs stand clear of all of them. */
const lines = [
  ...roadTracks.map((t) => gradedLine(t.points, t.width / 2 + t.shoulder)),
  ...winchClimbs.map((c) => gradedLine(c.track.points, c.track.width / 2 + c.track.shoulder)),
];
const climbLines = lines.slice(roadTracks.length);

const climbSigns: PropDef[] = winchClimbs.flatMap((c, i) => [
  endSign(climbLines[i], 0, `WINCH · ${c.name}`, lines),
  endSign(climbLines[i], 1, `WINCH · ${c.name}`, lines),
]);

export const stringybarkMap: MapDef = {
  id: 'stringybark-range',
  name: 'Stringybark Range',
  seed: 5150,
  size: 2048,
  wallHalfExtent: 964,
  floor: [
    [-1100, 27],
    [0, 23],
    [1100, 19],
  ],
  noise: {
    macroAmplitude: 8,
    macroScale: 420,
    midAmplitude: 3,
    midScale: 90,
    detailAmplitude: 0.13,
    detailScale: 7,
    creekCalm: 80,
  },
  border: {
    width: 200,
    height: 170,
    gaps: [
      { x: -1024, z: 340, radius: 70 },
      { x: 1024, z: 200, radius: 70 },
    ],
  },
  scarps: [
    {
      // The Shelf: everything north of this line is lifted about 60 m.
      id: 'shelf-scarp',
      raise: 'north',
      wobble: 25,
      points: [
        { x: -1100, z: 80, width: 220, height: 60 },
        { x: -600, z: 40, width: 200, height: 60 },
        { x: -200, z: 60, width: 180, height: 62 },
        { x: 200, z: 30, width: 200, height: 60 },
        { x: 430, z: 40, width: 170, height: 59 },
        { x: 600, z: 50, width: 220, height: 58 },
        { x: 1100, z: 90, width: 240, height: 58 },
      ],
    },
    {
      // The range: north of this line is lifted about 68 m more.
      id: 'range-scarp',
      raise: 'north',
      wobble: 20,
      points: [
        { x: -1100, z: -380, width: 170, height: 65 },
        { x: -500, z: -420, width: 150, height: 68 },
        { x: 0, z: -400, width: 140, height: 70 },
        { x: 500, z: -430, width: 160, height: 66 },
        { x: 1100, z: -400, width: 180, height: 65 },
      ],
    },
  ],
  hills: [
    stringybarkPeak,
    // Cliffs all round: the only way up is the Eagle Rock winch climb.
    { id: 'eagle-rock', x: 420, z: -660, radius: 50, height: 30, shape: 'mesa' },
    { id: 'clay-knoll', x: -600, z: -170, radius: 75, height: 28, shape: 'dome' },
    wombatHill,
  ],
  ridges: [],
  flats: [
    { id: 'river-camp', x: -300, z: 230, radius: 22, blend: 18 },
    { id: 'shelf-camp', x: -120, z: -160, radius: 14, blend: 12 },
    { id: 'range-camp', x: 10, z: -570, radius: 16, blend: 14 },
    { id: 'eagle-rock-top', x: 420, z: -662, radius: 9, blend: 6 },
    { id: 'wombat-lookout', x: 260, z: 634, radius: 10, blend: 10 },
  ],
  creek: {
    id: 'creek',
    name: 'Stringybark River',
    points: [
      { x: -1060, z: 340, water: 25.6, halfWidth: 4.5, depth: 0.9 },
      { x: -860, z: 360, water: 25.0, halfWidth: 4.5, depth: 0.9 },
      { x: -700, z: 320, water: 24.4, halfWidth: 4.5, depth: 0.9 },
      { x: -560, z: 300, water: 23.8, halfWidth: 4.6, depth: 0.9 },
      { x: -420, z: 330, water: 23.2, halfWidth: 4.6, depth: 0.9 },
      { x: -280, z: 350, water: 22.6, halfWidth: 4.8, depth: 0.95 },
      { x: -140, z: 320, water: 22.0, halfWidth: 4.8, depth: 0.95 },
      { x: 0, z: 290, water: 21.4, halfWidth: 5, depth: 1 },
      { x: 70, z: 293, water: 21.2, halfWidth: 5, depth: 1 },
      // The gravel ford on the way to Wombat Hill.
      { x: 105, z: 298, water: 21.0, halfWidth: 9, depth: 0.35, bankSlope: 0.12, bed: 'gravel' },
      { x: 135, z: 303, water: 20.9, halfWidth: 9, depth: 0.35, bankSlope: 0.12, bed: 'gravel' },
      { x: 170, z: 312, water: 20.7, halfWidth: 5, depth: 1 },
      { x: 240, z: 330, water: 20.4, halfWidth: 5, depth: 1 },
      { x: 380, z: 310, water: 19.8, halfWidth: 5, depth: 1 },
      { x: 520, z: 270, water: 19.2, halfWidth: 5, depth: 1 },
      { x: 660, z: 250, water: 18.7, halfWidth: 5, depth: 1 },
      { x: 800, z: 230, water: 18.2, halfWidth: 5, depth: 1 },
      { x: 1060, z: 200, water: 17.4, halfWidth: 5, depth: 1 },
    ],
  },
  tracks: [...roadTracks, ...winchClimbs.map((c) => c.track)],
  patches: [
    // Clay Knoll is wet clay all round, so only the winch gets you to the hut.
    { id: 'clay-knoll', kind: 'mud', x: -600, z: -170, radius: 74, ragged: 0.15 },
    { id: 'hut-yard', kind: 'grass', x: -600, z: -170, radius: 11, ragged: 0.2 },
    { id: 'river-camp', kind: 'gravel', x: -300, z: 230, radius: 14, ragged: 0.2 },
    { id: 'range-camp', kind: 'gravel', x: 10, z: -570, radius: 11, ragged: 0.2 },
    { id: 'eagle-rock-top', kind: 'rock', x: 420, z: -660, radius: 22, ragged: 0.3 },
  ],
  bogs: [],
  gullies: [],
  pois: [
    {
      id: 'river-camp',
      name: 'River Camp',
      kind: 'campsite',
      x: -300,
      z: 230,
      radius: 26,
      reset: { x: -300, z: 222, headingDeg: 0 },
      note: 'Campsite on the river flats below the range.',
    },
    {
      id: 'shelf-camp',
      name: 'Shelf Camp',
      kind: 'campsite',
      x: -120,
      z: -160,
      radius: 22,
      reset: { x: -106, z: -150, headingDeg: 180 },
      note: 'Campsite on The Shelf, halfway up the range.',
    },
    {
      id: 'range-camp',
      name: 'Range Top Camp',
      kind: 'campsite',
      x: 10,
      z: -570,
      radius: 24,
      reset: { x: 0, z: -556, headingDeg: 70 },
      note: 'Campsite on the range top, about 130 m above the river.',
    },
    {
      id: 'stringybark-peak',
      name: 'Stringybark Peak',
      kind: 'landmark',
      x: -380,
      z: -700,
      radius: 26,
      note: 'Fire tower on the highest point you can drive to.',
    },
    {
      id: 'eagle-rock',
      name: 'Eagle Rock',
      kind: 'viewpoint',
      x: 420,
      z: -662,
      radius: 14,
      note: 'Lookout on top of a granite tor with cliffs all round. Only the winch gets you up.',
    },
    {
      id: 'stockmans-hut',
      name: 'Stockman’s Hut',
      kind: 'landmark',
      x: -600,
      z: -172,
      radius: 14,
      note: 'An old hut on top of Clay Knoll. The clay is too greasy to drive up; winch up Hut Spur.',
    },
    {
      id: 'wombat-lookout',
      name: 'Wombat Hill',
      kind: 'viewpoint',
      x: 260,
      z: 634,
      radius: 16,
      note: 'Lookout across the river to the range.',
    },
    {
      id: 'river-ford',
      name: 'River Ford',
      kind: 'feature',
      x: 118,
      z: 300,
      radius: 18,
      note: 'Gravel ford across the Stringybark River, about a third of a metre deep.',
    },
    ...winchClimbs.map((c) => c.poi),
  ],
  props: [
    { kind: 'signpost', x: -290, z: 206, headingDeg: 180, text: 'Stringybark Range' },
    { kind: 'fireRing', x: -312, z: 238, headingDeg: 0, flatten: 3 },
    { kind: 'logSeat', x: -316.5, z: 240, headingDeg: 60 },
    { kind: 'waterTank', x: -286, z: 244, headingDeg: 0 },
    { kind: 'fireRing', x: -132, z: -166, headingDeg: 0, flatten: 3 },
    { kind: 'logSeat', x: -136, z: -163, headingDeg: 40 },
    { kind: 'fireRing', x: 22, z: -578, headingDeg: 0, flatten: 3 },
    { kind: 'logSeat', x: 26.5, z: -576, headingDeg: 120 },
    { kind: 'hut', x: -603, z: -176, headingDeg: 160, flatten: 8 },
    { kind: 'fireTower', x: -386, z: -704, headingDeg: 0, flatten: 7 },
    ...climbSigns,
  ],
  boulders: winchClimbs.flatMap((c) => c.anchors),
  tors: [
    { id: 'eagle-rock-tor', x: 432, z: -672, radius: 6, count: 3 },
    { id: 'range-tor', x: 260, z: -660, radius: 8, count: 5 },
    { id: 'peak-tor', x: -300, z: -760, radius: 7, count: 4 },
  ],
  fallenTrees: [],
  crawlTrails: winchClimbs.map((c) => c.trail),
  vegetation: {
    maxTreeDensity: 0.85,
    ashBelow: 60,
    snowGumAbove: 150,
    patchScale: 140,
    trackClearance: 2.5,
    boulderDensity: 0.01,
    clearings: [
      { x: -300, z: 230, radius: 36 },
      { x: -120, z: -160, radius: 26 },
      { x: 10, z: -570, radius: 28 },
      { x: 420, z: -660, radius: 30 },
      { x: -600, z: -172, radius: 16 },
      { x: 260, z: 634, radius: 20 },
      { x: -382, z: -702, radius: 18 },
      ...winchClimbs.flatMap((c) => c.clearings),
    ],
  },
  spawnCampsite: 'river-camp',
};
