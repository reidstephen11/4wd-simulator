import type { MapDef } from '../../sim/world/mapTypes';
import {
  PLAIN,
  creekAnchors,
  creekBogs,
  creekClearings,
  creekFlats,
  creekPois,
  creekProps,
  creekTors,
  creekTracks,
  ironbarkCreek,
} from './ironbarkCreek';
import { ironbarkGateCourse, ironbarkGates } from './ironbarkGates';
import {
  knollAnchors,
  knollBogs,
  knollClearings,
  knollFlats,
  knollHills,
  knollPois,
  knollProps,
  knollTracks,
} from './ironbarkKnoll';

/**
 * Ironbark Creek: the first playground level, half a kilometre square. A 25 m knoll with a
 * loop track round it and seven lines on it (src/data/levels/ironbarkKnoll.ts), and a creek
 * in a gully down the west side with three crossings, a bog hole and a rock garden on its
 * far bank (ironbarkCreek.ts). Nothing here is a route: every line is optional, and the open
 * ground between them can be driven.
 */
export const ironbarkMap: MapDef = {
  gateCourse: ironbarkGateCourse,
  gates: ironbarkGates,
  id: 'ironbark',
  name: 'Ironbark Creek',
  seed: 4127,
  width: 512,
  length: 512,
  wall: [224, 224],
  floor: [
    [-256, PLAIN],
    [256, PLAIN],
  ],
  noise: {
    macroAmplitude: 1.2,
    macroScale: 200,
    midAmplitude: 0.6,
    midScale: 70,
    detailAmplitude: 0.14,
    detailScale: 7,
    creekCalm: 40,
  },
  border: {
    // Low forested rises: steeper ones show as bare grey rock faces right round the map.
    width: 30,
    height: 13,
    forested: true,
    gaps: [
      { x: -108, z: -256, radius: 40 },
      { x: -128, z: 256, radius: 40 },
    ],
  },
  scarps: [],
  hills: [...knollHills],
  ridges: [],
  flats: [...knollFlats, ...creekFlats],
  creeks: [ironbarkCreek],
  tracks: [...knollTracks, ...creekTracks],
  patches: [
    { id: 'camp-dirt', kind: 'dirt', x: -200, z: 40, radius: 9, ragged: 0.5 },
    { id: 'paddock-camp-dirt', kind: 'dirt', x: 152, z: -156, radius: 7, ragged: 0.5 },
    { id: 'garden-rock', kind: 'rock', x: -196, z: -138, radius: 16, ragged: 0.6 },
  ],
  bogs: [...knollBogs, ...creekBogs],
  gullies: [],
  pois: [...creekPois, ...knollPois],
  props: [...knollProps, ...creekProps],
  boulders: [...knollAnchors, ...creekAnchors],
  tors: creekTors,
  fallenTrees: [],
  vegetation: {
    flora: 'tropical',
    // Open eucalypt woodland over the whole map: the lines can be seen from one another.
    woodland: [{ x: 0, z: 0, radius: 520 }],
    maxTreeDensity: 0.4,
    ashBelow: 0,
    snowGumAbove: 1000,
    patchScale: 120,
    trackClearance: 3,
    boulderDensity: 0.001,
    termiteMounds: 5,
    clearings: [...knollClearings, ...creekClearings],
  },
  palette: {
    // Red clay tracks and green grass; clear water over pale gravel.
    dirtTrack: '#A35A38',
    dirtDark: '#7A3F27',
    grassDry: '#9FA45E',
    grassSage: '#6E8C4E',
    mud: '#6A3E2A',
    waterShallow: '#8DB0A2',
    waterDeep: '#183A3E',
  },
  clayBanks: true,
  muddyEdges: true,
  spawnCampsite: 'ironbark-camp',
};
