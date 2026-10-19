import type { MapDef } from '../sim/world/mapTypes';
import {
  parkAnchors,
  parkBogs,
  parkClearings,
  parkLoop,
  parkPatches,
  parkPois,
  parkSigns,
  parkTracks,
  parkTrails,
  sideSlopeBank,
} from './parkCourse';

/**
 * Ironbark 4WD Park: a purpose-built 4WD park in dry ironbark country. A gravel loop
 * rings Ironbark Hill, a flat-topped hill with steep faces, and eleven numbered
 * stations hang off it, each with an easier and a harder line and the loop as the way
 * round (see parkCourse.ts). The flat stations sit outside the loop to the south, the
 * creek crossings to the north and the climbs, descents and side slopes on the hill.
 * Coordinates in metres: x = east, z = south (north is -z).
 */
const gravel = { width: 4.4, shoulder: 2, smooth: 6, surface: 'gravel' as const, ruts: 0.02, camber: 0.15 };

export const ironbarkParkMap: MapDef = {
  id: 'ironbark-park',
  name: 'Ironbark 4WD Park',
  seed: 4242,
  size: 768,
  wallHalfExtent: 326,
  floor: [
    [-400, 19.6],
    [0, 20],
    [400, 20.6],
  ],
  noise: {
    macroAmplitude: 2.4,
    macroScale: 260,
    midAmplitude: 0.9,
    midScale: 70,
    detailAmplitude: 0.1,
    detailScale: 7,
    creekCalm: 50,
  },
  border: {
    width: 80,
    height: 55,
    gaps: [
      { x: 384, z: -224, radius: 50 },
      { x: -384, z: -220, radius: 50 },
    ],
  },
  scarps: [],
  hills: [
    // Ironbark Hill: a flat top about 16 m up with steep north and south faces (about
    // 30°) and gentler east and west ends (about 21°).
    { id: 'ironbark-hill', x: 0, z: -10, radius: 100, height: 16, shape: 'mesa', stretch: [1.4, 0.9, 0] },
  ],
  ridges: [
    {
      id: 'side-slope-bank',
      points: [
        [sideSlopeBank.x, sideSlopeBank.from],
        [sideSlopeBank.x, sideSlopeBank.to],
      ],
      height: sideSlopeBank.height,
      width: sideSlopeBank.width,
    },
  ],
  flats: [{ id: 'park-hq', x: 0, z: 222, radius: 18, blend: 14 }],
  creek: {
    id: 'creek',
    name: 'Ironbark Creek',
    points: [
      { x: 430, z: -226, water: 18.9, halfWidth: 3, depth: 0.6 },
      { x: 300, z: -232, water: 18.8, halfWidth: 3, depth: 0.6 },
      { x: 180, z: -224, water: 18.7, halfWidth: 3.2, depth: 0.6 },
      { x: 60, z: -216, water: 18.6, halfWidth: 3.4, depth: 0.65 },
      { x: -30, z: -218, water: 18.5, halfWidth: 3.4, depth: 0.65 },
      // The Water Crossing station: a deep hole between steep banks, then a wide gravel ford.
      { x: -65, z: -220, water: 18.45, halfWidth: 4.2, depth: 0.78, bankSlope: 0.5 },
      { x: -100, z: -222, water: 18.4, halfWidth: 3.4, depth: 0.65 },
      { x: -135, z: -224, water: 18.35, halfWidth: 7.5, depth: 0.3, bankSlope: 0.12, bed: 'gravel' },
      { x: -170, z: -225, water: 18.3, halfWidth: 3.4, depth: 0.65 },
      { x: -230, z: -226, water: 18.15, halfWidth: 3.4, depth: 0.65 },
      { x: -310, z: -220, water: 18.0, halfWidth: 3, depth: 0.6 },
      { x: -430, z: -214, water: 17.8, halfWidth: 3, depth: 0.6 },
    ],
  },
  tracks: [
    ...parkLoop,
    {
      ...gravel,
      id: 'hq-track',
      name: 'Park HQ',
      points: [
        [0, 214],
        [0, 190],
        [0, 165],
      ],
      routeHint:
        'Park HQ. The loop is just ahead: west for stations 1, 2 and 5, east for 3, 4 and 9. The hill stations start from the north side and the hilltop.',
    },
    ...parkTracks,
  ],
  patches: [{ id: 'hq-gravel', kind: 'gravel', x: 0, z: 222, radius: 16, ragged: 0.2 }, ...parkPatches],
  bogs: parkBogs,
  gullies: [],
  pois: [
    {
      id: 'park-hq',
      name: 'Park HQ',
      kind: 'campsite',
      x: 0,
      z: 222,
      radius: 26,
      reset: { x: 0, z: 208, headingDeg: 0 },
      note: 'Staging area. The loop runs past just north; every station is signposted from it.',
    },
    {
      id: 'ironbark-summit',
      name: 'Ironbark Hill',
      kind: 'viewpoint',
      x: 0,
      z: -10,
      radius: 30,
      note: 'Flat top of the hill. The climbs, descents, rock steps and whoa-boys all finish up here.',
    },
    ...parkPois,
  ],
  props: [
    { kind: 'signpost', x: 7, z: 232, headingDeg: 180, text: 'Ironbark 4WD Park' },
    { kind: 'fireRing', x: -8, z: 228, headingDeg: 0, flatten: 3 },
    { kind: 'logSeat', x: -12.5, z: 230, headingDeg: 60 },
    { kind: 'waterTank', x: 12, z: 236, headingDeg: 0 },
    { kind: 'hut', x: -14, z: 241, headingDeg: 180, flatten: 9 },
    ...parkSigns,
  ],
  boulders: parkAnchors,
  tors: [{ id: 'summit-tor', x: 40, z: 6, radius: 5, count: 4 }],
  fallenTrees: [],
  crawlTrails: parkTrails,
  vegetation: {
    // Open ironbark woodland, with the hill itself left as grass.
    maxTreeDensity: 0.55,
    ashBelow: 30,
    snowGumAbove: 80,
    patchScale: 120,
    trackClearance: 3,
    boulderDensity: 0.006,
    clearings: [
      { x: 0, z: 222, radius: 40 },
      { x: 0, z: -10, radius: 95 },
      { x: -95, z: -10, radius: 60 },
      { x: 95, z: -10, radius: 60 },
      ...parkClearings,
    ],
  },
  spawnCampsite: 'park-hq',
};
