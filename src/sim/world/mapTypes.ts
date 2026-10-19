/**
 * Types for hand-authored map data (data/map.ts). Coordinates are metres:
 * x = east, z = south (north is -z), y = up. The map is centred on the origin.
 */
export type XZ = readonly [number, number];

/**
 * Escarpment: a line across the map with everything on the `raise` side lifted by
 * `height`. North/south scarps are lines z = f(x); east/west scarps are x = f(z).
 */
export interface ScarpDef {
  id: string;
  raise: 'north' | 'south' | 'east' | 'west';
  /** Noise displacement of the line (m) so it isn't ruler-straight. */
  wobble?: number;
  points: readonly ScarpPoint[];
}

export interface ScarpPoint {
  x: number;
  z: number;
  /** Horizontal width of the slope (wider = gentler). */
  width: number;
  height: number;
}

export interface HillDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  /** dome = smooth, cone = pointier, mesa = flat-topped. */
  shape?: 'dome' | 'cone' | 'mesa';
  /** Stretch along a direction: [scaleX, scaleZ, rotationDeg]. */
  stretch?: readonly [number, number, number];
}

/** A raised (or, with negative height, carved) line such as a ridge crest or a valley. */
export interface RidgeDef {
  id: string;
  points: readonly XZ[];
  height: number;
  width: number;
}

/** Flatten an area to a height (or to the local average when height is omitted). */
export interface FlatDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  blend: number;
  height?: number;
}

export interface CreekPoint {
  x: number;
  z: number;
  /** Water surface height at this point. */
  water: number;
  /** Half width of the wet channel. */
  halfWidth: number;
  /** Depth of water at the channel centre. */
  depth: number;
  /** Bank steepness (rise per metre beyond the water's edge). */
  bankSlope?: number;
  /** Bed surface: water (default) or gravel for fords. */
  bed?: 'water' | 'gravel';
}

export interface CreekDef {
  id: string;
  name: string;
  points: readonly CreekPoint[];
}

export interface TrackStepsDef {
  /** Metres along the track where the steps start and end. */
  from: number;
  to: number;
  /** Distance between granite ledges. */
  spacing: number;
  /** Ledge height (riser) in metres. */
  rise: number;
}

export interface TrackDef {
  id: string;
  name?: string;
  /** Control points; an optional third value pins the track height there. */
  points: ReadonlyArray<readonly [number, number] | readonly [number, number, number]>;
  width: number;
  shoulder: number;
  /** Smoothing radius (m) for the height profile. */
  smooth: number;
  surface: 'dirt' | 'gravel' | 'rock';
  /** Depth of the worn wheel ruts. */
  ruts: number;
  /** Fraction of the natural cross-slope kept (0 = level, 1 = untouched). */
  camber: number;
  /** Faint tracks only show as two wheel lines and barely reshape the ground. */
  faint?: boolean;
  steps?: readonly TrackStepsDef[];
  /** Rocky steps: short sharp rises along the profile. */
  rockySteps?: ReadonlyArray<{ at: number; rise: number }>;
  /** Lower the graded track: [metres along, depth] pairs, interpolated (a cutting or gully floor). */
  cut?: ReadonlyArray<readonly [number, number]>;
  /** Extra lean across the track: [metres along, degrees] pairs, interpolated (+ raises the right side). */
  cant?: ReadonlyArray<readonly [number, number]>;
  /** Drainage humps across the track, built as fine ground detail. */
  humps?: readonly TrackHumpDef[];
  /** Erosion ruts in the track, built as fine ground detail. */
  erosion?: readonly ErosionRutDef[];
  /** Grade evenly between these [from, to] distances along the track (switchbacks, causeways). */
  even?: ReadonlyArray<readonly [number, number]>;
  /** Timber bridges carrying the track over a creek, ditch or mud hole. */
  bridges?: readonly TrackBridgeDef[];
  markerColor?: 'green' | 'amber' | 'red';
  routeHint?: string;
}

/**
 * A drainage hump (whoa-boy) across a track: an earth mound with a dug-out ditch on the
 * side the water comes from. Built from the fine ground detail grid.
 */
export interface TrackHumpDef {
  /** Metres along the track to the crest. */
  at: number;
  height: number;
  /** Length of the mound along the track. */
  length: number;
  /** Depth of the ditch beside the mound (0 = none). */
  ditch?: number;
  /** Which side of the mound the ditch is on: +1 further along the track, -1 before it. */
  ditchSide?: 1 | -1;
  /** Turn away from square across the track (degrees, + moves the right end further along). */
  angleDeg?: number;
}

/**
 * A timber bridge from `from` to `to` metres along a track. The ground under it is left
 * as it is (creek, ditch or mud); the deck runs straight between the graded track at
 * either end, and on a ramp bridge climbs `rise` metres over `ramp` metres at each end.
 */
export interface TrackBridgeDef {
  from: number;
  to: number;
  /** 'deck': one deck `width` wide. 'wheelTracks': two planks `width` wide, `gauge` apart. */
  kind: 'deck' | 'wheelTracks';
  width: number;
  gauge?: number;
  /** Kerb height along the outer edges (0 = none). */
  kerb?: number;
  rise?: number;
  ramp?: number;
}

/**
 * An erosion rut: a channel following `path` in track coordinates ([metres along,
 * metres right of the centreline]), with a flat floor and sloping walls.
 */
export interface ErosionRutDef {
  path: ReadonlyArray<readonly [number, number]>;
  width: number;
  depth: number;
}

export type SurfaceKind = 'dirt' | 'grass' | 'gravel' | 'rock' | 'mud';

export interface PatchDef {
  id: string;
  kind: SurfaceKind;
  x: number;
  z: number;
  radius: number;
  /** Noise breaks up the patch edge (0..1). */
  ragged?: number;
}

export interface BogDef {
  id: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotationDeg: number;
  depth: number;
}

/** A washed-out gap: straight trench with vertical lips leaving a gap of `gap` metres. */
export interface GullyDef {
  id: string;
  x: number;
  z: number;
  /** Direction the gully runs (degrees, 0 = north). */
  headingDeg: number;
  length: number;
  gap: number;
  depth: number;
}

export type PoiKind = 'campsite' | 'viewpoint' | 'landmark' | 'feature';

export interface PoiDef {
  id: string;
  name: string;
  kind: PoiKind;
  x: number;
  z: number;
  radius: number;
  /** Campsites: where the vehicle is reset to, and its heading (degrees, 0 = north). */
  reset?: { x: number; z: number; headingDeg: number };
  /** Short description shown on the paper map. */
  note?: string;
}

export type PropKind =
  | 'hut'
  | 'fireRing'
  | 'logSeat'
  | 'signpost'
  | 'fireTower'
  | 'oldUte'
  | 'mineEntrance'
  | 'cattleGrid'
  | 'waterTank';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  headingDeg: number;
  text?: string;
  /** Flatten the ground under the prop (radius in metres). */
  flatten?: number;
}

export interface BoulderDef {
  x: number;
  z: number;
  radius: number;
  /** Marked anchor for the winch. */
  anchor?: boolean;
  /** How far the boulder is buried (fraction of radius). */
  sink?: number;
}

export interface TorDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  count: number;
}

export interface FallenTreeDef {
  id: string;
  x: number;
  z: number;
  headingDeg: number;
  length: number;
  radius: number;
  mass: number;
}

export interface ClearingDef {
  x: number;
  z: number;
  radius: number;
}

/** A practice line runs forwards from the course origin; offsets are across the line. */
export interface CrawlCourseDef {
  id: string;
  name: string;
  x: number;
  z: number;
  headingDeg: number;
  length: number;
  lines: ReadonlyArray<{
    id: string;
    name: string;
    difficulty: 'easy' | 'moderate' | 'hard';
    offset: number;
    hint: string;
    obstacles: ReadonlyArray<{
      at: number;
      lateral: number;
      width: number;
      length: number;
      height: number;
      rollDeg?: number;
    }>;
  }>;
}

export interface VegetationDef {
  /** Trees per 100 m² in the densest forest. */
  maxTreeDensity: number;
  /** Heights below this get tall mountain ash; above `snowGumAbove` get snow gums. */
  ashBelow: number;
  snowGumAbove: number;
  /** Scale of the forest/open noise (m). */
  patchScale: number;
  clearings: readonly ClearingDef[];
  /** Keep trees this far from track edges. */
  trackClearance: number;
  boulderDensity: number;
}

export type TrailDifficulty = 'easy' | 'moderate' | 'hard' | 'extreme';

/**
 * A granite hull on a crawl trail, placed `at` metres along the track and `lateral`
 * metres to its right. Sizes are full extents; `height` is exposed rock above the ground.
 * - boulder: faceted rounded rock; width × length footprint.
 * - slab: chamfered flat-topped block, optionally pitched (+ raises the far end) and rolled (+ raises the right).
 * - ridge: whaleback on the ground whose top follows `profile` ([metres along from the
 *   centre, centre height, optional cross-slope]); `rollDeg` is its default cross-slope.
 */
export interface TrailStoneDef {
  shape: 'boulder' | 'slab' | 'ridge';
  at: number;
  lateral: number;
  width: number;
  length: number;
  height: number;
  profile?: ReadonlyArray<readonly [number, number, number?]>;
  /** Raise the stone's ground level, e.g. to seat a boulder on a slab beneath it. */
  base?: number;
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  seed?: number;
}

export interface CrawlTrailDef {
  id: string;
  name: string;
  trackId: string;
  /** A separate easier route between the same ends, if there is one. */
  bypassTrackId?: string;
  difficulty?: TrailDifficulty;
  bypassHint?: string;
  sections: ReadonlyArray<{
    from: number;
    to: number;
    name: string;
    hint: string;
    rocks: CrawlCourseDef['lines'][number]['obstacles'];
    stones?: readonly TrailStoneDef[];
    logs?: ReadonlyArray<{
      at: number;
      lateral: number;
      length: number;
      radius: number;
      /** Rotation away from a log laid straight across the track. */
      angleDeg?: number;
    }>;
  }>;
}

/**
 * A gate on a gate trail, as on an RC crawler course: two flags `width` apart, square
 * across the track `at` metres along it, numbered in the order they are driven.
 */
export interface GateDef {
  n: number;
  trackId: string;
  at: number;
  /** Gate centre, metres right of the centreline. */
  lateral?: number;
  width: number;
}

export interface BorderDef {
  /** Distance from the map edge over which the border mountains rise. */
  width: number;
  height: number;
  /** Passes through the border (creek in/out, road in). */
  gaps: ReadonlyArray<{ x: number; z: number; radius: number }>;
}

export interface MapDef {
  id: string;
  name: string;
  seed: number;
  /** Side length in metres (square map centred on the origin). */
  size: number;
  /** Playable half-extent: an invisible wall stops the car beyond this. */
  wallHalfExtent: number;
  /** Valley floor height along x: pairs of [x, height]. */
  floor: readonly XZ[];
  noise: {
    macroAmplitude: number;
    macroScale: number;
    midAmplitude: number;
    midScale: number;
    detailAmplitude: number;
    detailScale: number;
    /** Noise is reduced within this distance of the creek so the valley floor stays near water level. */
    creekCalm: number;
  };
  border: BorderDef;
  scarps: readonly ScarpDef[];
  hills: readonly HillDef[];
  ridges: readonly RidgeDef[];
  flats: readonly FlatDef[];
  creek: CreekDef;
  tracks: readonly TrackDef[];
  patches: readonly PatchDef[];
  bogs: readonly BogDef[];
  gullies: readonly GullyDef[];
  pois: readonly PoiDef[];
  props: readonly PropDef[];
  boulders: readonly BoulderDef[];
  tors: readonly TorDef[];
  fallenTrees: readonly FallenTreeDef[];
  crawlCourses?: readonly CrawlCourseDef[];
  crawlTrails?: readonly CrawlTrailDef[];
  gates?: readonly GateDef[];
  vegetation: VegetationDef;
  /** POI id of the spawn campsite. */
  spawnCampsite: string;
}
