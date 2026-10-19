import type { MapDef } from '../sim/world/mapTypes';
import {
  creekLine,
  gateTrailAnchors,
  gateTrailBogs,
  gateTrailClearings,
  gateTrailGates,
  gateTrailPatches,
  gateTrailPois,
  gateTrailSigns,
  gateTrailTracks,
  gateTrailTrails,
  knuckleRidge as K,
} from './gateTrail';

/**
 * Crawler Creek: an RC crawler-style gate trail at full size, in open box woodland. One
 * loop of numbered gates leaves the Trailhead, crosses Crawler Creek on a bridge, climbs
 * the switchbacks on the south face of Knuckle Ridge, drops off its steep east end and
 * comes home through the creek, over a ramp bridge and along a dry creek bed (see
 * gateTrail.ts). Coordinates in metres: x = east, z = south (north is -z).
 */
const creekAt = (x: number) => {
  for (let i = 0; i + 1 < creekLine.length; i++) {
    const [x0, z0] = creekLine[i],
      [x1, z1] = creekLine[i + 1];
    if (x <= x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return creekLine[creekLine.length - 1][1];
};

export const crawlerCreekMap: MapDef = {
  id: 'crawler-creek',
  name: 'Crawler Creek',
  seed: 3131,
  size: 768,
  wallHalfExtent: 326,
  floor: [
    [-400, 20.4],
    [0, 20],
    [400, 19.6],
  ],
  noise: {
    macroAmplitude: 1.6,
    macroScale: 220,
    midAmplitude: 0.6,
    midScale: 60,
    detailAmplitude: 0.1,
    detailScale: 7,
    creekCalm: 45,
  },
  border: {
    width: 80,
    height: 50,
    gaps: [
      { x: 384, z: creekAt(384), radius: 50 },
      { x: -384, z: creekAt(-384), radius: 50 },
    ],
  },
  scarps: [
    {
      id: 'knuckle-ridge',
      raise: 'north',
      points: [
        { x: K.westFoot, z: K.z, width: K.width, height: 0 },
        { x: K.westTop, z: K.z, width: K.width, height: K.height },
        { x: K.eastTop, z: K.z, width: K.width, height: K.height },
        { x: K.eastFoot, z: K.z, width: K.width, height: 0 },
      ],
    },
  ],
  hills: [],
  ridges: [],
  flats: [{ id: 'trailhead', x: -142, z: 172, radius: 18, blend: 12 }],
  creek: {
    id: 'creek',
    name: 'Crawler Creek',
    points: creekLine.map(([x, z]) => {
      // Steep banks under the creek bridge; a wide gravel ford at the Water Crossing.
      if (x === -131) return { x, z, water: 18.9, halfWidth: 3, depth: 0.8, bankSlope: 0.65 };
      if (x === 152)
        return { x, z, water: 18.5, halfWidth: 6.5, depth: 0.35, bankSlope: 0.14, bed: 'gravel' };
      return { x, z, water: 19.1 - (x + 430) * 0.0011, halfWidth: 3.2, depth: 0.65 };
    }),
  },
  tracks: [
    ...gateTrailTracks,
    {
      width: 4.2,
      shoulder: 2,
      smooth: 6,
      surface: 'gravel',
      ruts: 0.02,
      camber: 0.15,
      id: 'trailhead-track',
      name: 'Trailhead',
      points: [
        [-131, 162],
        [-138, 166],
        [-146, 168],
      ],
      routeHint:
        'Trailhead. The trail starts at gate 1 just north of here and comes home through the last gate from the east. Red flag on your left, blue on your right, in number order.',
    },
  ],
  patches: [
    { id: 'trailhead-gravel', kind: 'gravel', x: -142, z: 172, radius: 15, ragged: 0.2 },
    ...gateTrailPatches,
  ],
  bogs: gateTrailBogs,
  gullies: [],
  pois: [
    {
      id: 'trailhead',
      name: 'Trailhead',
      kind: 'campsite',
      x: -142,
      z: 172,
      radius: 24,
      reset: { x: -150, z: 158, headingDeg: 0 },
      note: 'Start and finish of the gate trail. Gate 1 is just to the north.',
    },
    {
      id: 'knuckle-ridge',
      name: 'Knuckle Ridge',
      kind: 'viewpoint',
      x: 30,
      z: -170,
      radius: 30,
      note: 'Top of the ridge, between the switchbacks and The Drop.',
    },
    ...gateTrailPois,
  ],
  props: [
    { kind: 'signpost', x: -134, z: 178, headingDeg: 180, text: 'Crawler Creek Trail' },
    { kind: 'fireRing', x: -146, z: 178, headingDeg: 0, flatten: 3 },
    { kind: 'logSeat', x: -150.5, z: 180, headingDeg: 60 },
    { kind: 'waterTank', x: -130, z: 184, headingDeg: 0 },
    { kind: 'hut', x: -156, z: 186, headingDeg: 180, flatten: 9 },
    ...gateTrailSigns,
  ],
  boulders: gateTrailAnchors,
  tors: [{ id: 'ridge-tor', x: 10, z: -200, radius: 6, count: 4 }],
  fallenTrees: [],
  crawlTrails: gateTrailTrails,
  gates: gateTrailGates,
  vegetation: {
    maxTreeDensity: 0.6,
    ashBelow: 30,
    snowGumAbove: 80,
    patchScale: 110,
    trackClearance: 2.5,
    boulderDensity: 0.008,
    clearings: [{ x: -142, z: 172, radius: 34 }, ...gateTrailClearings],
  },
  spawnCampsite: 'trailhead',
};
