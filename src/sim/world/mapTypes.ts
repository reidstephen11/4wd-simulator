import type { PaletteOverrides } from '../../data/palette';

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
  /** Bed surface: water (default), gravel for fords, or the soft sand of a dry-country river. */
  bed?: 'water' | 'gravel' | 'sand';
  /** Speed of the current mid-channel (m/s); the creek's `flow` where not given. */
  flow?: number;
}

/**
 * A shallow bar in a creek or river: inside the ellipse the bed rises to `depth` below the
 * water (the line to take across a deep crossing).
 */
export interface CreekBarDef {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotationDeg: number;
  depth: number;
}

/** A rough stretch of creek bed: bumps of `height` metres either way, a couple of metres apart, within `radius`. */
export interface CreekRoughDef {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** A scour hole in a creek bed: a bowl `depth` metres deeper than the bed round it. */
export interface CreekHoleDef {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

export interface CreekDef {
  id: string;
  name: string;
  points: readonly CreekPoint[];
  bars?: readonly CreekBarDef[];
  /** Rocky, uneven stretches of the bed (after any bars). */
  rough?: readonly CreekRoughDef[];
  /** Scour holes in the bed (after any bars). */
  holes?: readonly CreekHoleDef[];
  /**
   * How rough a road's banks are where it fords this creek (m): a rut scoured under one
   * wheel line then the other, and rocks standing out of the bank. Default 0.22; 0 leaves
   * the banks as smooth ramps.
   */
  bankRough?: number;
  /** How far out (m) the banks are carved at `bankSlope`; a wide valley rather than a gorge (default 34). */
  valley?: number;
  /**
   * Speed of the current mid-channel (m/s) wherever a point doesn't set its own. The water
   * runs from the first point to the last. Default 0: still water.
   */
  flow?: number;
  /** Where the bed is sand: how far the dry sand runs out beyond the water's edge (m). */
  sandBank?: number;
  /**
   * The bed under water is soft sand (`SurfaceId.SoftBed`: it gives and drags) everywhere
   * but on the creek's `bars` and where a track fords it, which stay firm. Default false:
   * every bed under water is firm.
   */
  softBed?: boolean;
  /**
   * Clear water that can be read from the bank (src/render/water.ts): the bed shows through
   * the shallows, shallow water over a bar breaks into ripples where the creek runs, and the
   * colour is at its darkest from 1.1 m deep (elsewhere from 0.8 m). Its bars are pale gravel.
   * Only how the water is drawn: the bed, the depth and the current are the same.
   */
  clear?: boolean;
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
  /**
   * How pinned heights shape the profile between pins: 'linear' (default) grades straight
   * from pin to pin; 'follow' keeps the ground's rises and dips and only shifts them so the
   * profile passes through each pin.
   */
  pinMode?: 'linear' | 'follow';
  /** Round the pinned profile's changes of grade over this many metres (crests and sags). */
  pinSmooth?: number;
  width: number;
  shoulder: number;
  /**
   * Steepest average slope (rise per metre) of the banks either side, cut or fill. Where the
   * track runs deeper below (or higher above) the natural ground than `shoulder` allows at
   * that slope, its banks widen, as a road's cuttings are laid back.
   */
  batter?: number;
  /** Smoothing radius (m) for the height profile. */
  smooth: number;
  /**
   * Concrete: strips laid on the steepest pinches, gripping like rock. Clay: red clay, slippery
   * when wet. Sand: soft river sand.
   */
  surface: 'dirt' | 'clay' | 'gravel' | 'rock' | 'concrete' | 'sand';
  /** Depth of the worn wheel ruts. */
  ruts: number;
  /** Fraction of the natural cross-slope kept (0 = level, 1 = untouched). */
  camber: number;
  /** Faint tracks only show as two wheel lines and barely reshape the ground. */
  faint?: boolean;
  steps?: readonly TrackStepsDef[];
  /** Rocky steps: short sharp rises along the profile. */
  rockySteps?: ReadonlyArray<{ at: number; rise: number }>;
  /** Stretches [from, to] (metres along) through soft sand: the dry creek beds it crosses. */
  sand?: ReadonlyArray<readonly [number, number]>;
  /** Stretches [from, to] of a gravel road where the gravel has washed off a steep pinch, leaving red clay. */
  clay?: ReadonlyArray<readonly [number, number]>;
  /** Rock steps, slabs and boulders set on the track (as on a crawl trail, without its markers and scoring). */
  stones?: readonly TrailStoneDef[];
  /** Lower the graded track: [metres along, depth] pairs, interpolated (a cutting or gully floor). */
  cut?: ReadonlyArray<readonly [number, number]>;
  /** Extra lean across the track: [metres along, degrees] pairs, interpolated (+ raises the right side). */
  cant?: ReadonlyArray<readonly [number, number]>;
  /** Drainage humps across the track, built as fine ground detail. */
  humps?: readonly TrackHumpDef[];
  /** Erosion ruts in the track, built as fine ground detail. */
  erosion?: readonly ErosionRutDef[];
  /**
   * Worn wheel lines drawn on the ground (src/sim/world/wheelMarks.ts): stretches [from, to],
   * metres along the track, where two dark tyre lines show that others drive here. Only
   * drawn: the ground is the same. Not drawn under water.
   */
  wheelMarks?: ReadonlyArray<readonly [number, number]>;
  /** Grade evenly between these [from, to] distances along the track (switchbacks, causeways). */
  even?: ReadonlyArray<readonly [number, number]>;
  /** Timber bridges carrying the track over a creek, ditch or mud hole. */
  bridges?: readonly TrackBridgeDef[];
  /** Bumps, potholes and washouts along the graded track (smooth when absent). */
  rough?: TrackRoughDef;
  markerColor?: 'green' | 'amber' | 'red';
  routeHint?: string;
}

/**
 * How rough a track is: bumps and dips all along it, potholes in the wheel lines and
 * washouts (channels the rain has cut over it at an angle). Built into the 1 m ground.
 */
export interface TrackRoughDef {
  /** Height of the bumps and dips, either way (m); they come every three metres or so. */
  bumps: number;
  /** Height of longer swells, either way (m), about ten metres apart: they pitch a fast vehicle. */
  swells?: number;
  /** Potholes per 100 m, and how deep the deepest are (m, default 0.2). */
  potholes?: number;
  potholeDepth?: number;
  /** Washouts per 100 m, and how deep the deepest are (m, default 0.25). */
  washouts?: number;
  washoutDepth?: number;
  /** Mud holes per 100 m on the flatter stretches, and how deep the deepest are (m, default 0.25). */
  bogs?: number;
  bogDepth?: number;
  /**
   * A mud hole in a hollow the land drains into is a deep bog this deep (m), floored with
   * sticky black soil: few get out without the winch. None when absent.
   */
  sumpDepth?: number;
  /** At most this many deep bogs on the track, the first ones along it (no limit when absent). */
  sumps?: number;
  /** Share of the other mud holes (0..1) that are long boggy stretches of 25–45 m (where the track runs straight and flat). */
  longBogs?: number;
  /**
   * Share of the plain mud holes (0..1) left in (default 1). The deep bogs are always
   * left, and which spots are tried stays the same, so a stretch can drop its scattered
   * holes without moving its deep bogs.
   */
  plainBogs?: number;
  /** At most this many long boggy stretches, the first ones along the track (no limit when absent). */
  longBogsKept?: number;
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
  /**
   * Missing boards: each hole is `from`..`to` metres along the track and `left`..`right`
   * metres right of the centreline. No timber is drawn or collided there, so a wheel in
   * the hole drops through. A hole longer than a wheelbase cannot be straddled along the
   * track: go around it, or straddle a narrow centre hole with a wheel on each side.
   */
  gaps?: readonly TrackBridgeGapDef[];
}

/** A hole in a bridge deck (metres along the track, metres right of the centreline). */
export interface TrackBridgeGapDef {
  from: number;
  to: number;
  left: number;
  right: number;
}

/**
 * An erosion rut: a channel following `path` in track coordinates ([metres along,
 * metres right of the centreline]), with a flat floor and sloping walls.
 */
export interface ErosionRutDef {
  path: ReadonlyArray<readonly [number, number]>;
  width: number;
  depth: number;
  /** How wide its walls are (m): the floor runs out to this far inside the edge. Default 65% of the half width. */
  wall?: number;
  /** Over how many metres each end shallows out. Default 30% of its length, at most 2 m; 0 for a pit with sheer ends. */
  ramp?: number;
}

export type SurfaceKind = 'dirt' | 'grass' | 'gravel' | 'rock' | 'mud' | 'sand';

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
  /** Its floor is sticky black soil rather than mud. */
  deep?: boolean;
  /** A tree stands near either end to winch a bogged vehicle out. */
  winchTrees?: boolean;
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
  | 'noticeBox'
  | 'hut'
  | 'fireRing'
  | 'logSeat'
  | 'signpost'
  | 'fireTower'
  | 'oldUte'
  | 'mineEntrance'
  | 'cattleGrid'
  | 'waterTank'
  | 'powerPole'
  | 'bakerOven'
  | 'chimney'
  | 'headstone'
  | 'stoneKerb';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  headingDeg: number;
  text?: string;
  /** Flatten the ground under the prop (radius in metres). */
  flatten?: number;
  /** Lean from upright towards `headingDeg` (degrees; an old power pole). */
  lean?: number;
}

/**
 * Something to load off the main line (a jerry can, tyre plugs): stop within `radius` of
 * it and it goes on board, once. Camps keep which were taken.
 */
export interface FindDef {
  id: string;
  /** What it is, as drawn and shown in the HUD prompt ("Jerry can"). */
  name: string;
  x: number;
  z: number;
  /** Stop within this distance to load it (m). */
  radius: number;
  /** What it adds to the load. */
  gives: { jerryCans?: number; spares?: number; plugs?: number };
  /** Shown when it is loaded. */
  taken: string;
}

export interface BoulderDef {
  x: number;
  z: number;
  radius: number;
  /** Marked anchor for the winch. */
  anchor?: boolean;
  /** What the winch chooser calls it (default "Boulder"): "Exit boulder", say. */
  label?: string;
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
  /** Which plants grow: the eucalypt high country (default) or tropical rainforest and woodland. */
  flora?: 'highCountry' | 'tropical';
  /** Tropical maps: open eucalypt woodland in these areas instead of rainforest (edges blend). */
  woodland?: readonly ClearingDef[];
  /** Trees per 100 m² in the densest forest. */
  maxTreeDensity: number;
  /** Tropical maps: the rainforest (outside `woodland`) this many times as dense (default 1). */
  rainforestScale?: number;
  /** Heights below this get tall mountain ash; above `snowGumAbove` get snow gums. */
  ashBelow: number;
  snowGumAbove: number;
  /** Scale of the forest/open noise (m). */
  patchScale: number;
  clearings: readonly ClearingDef[];
  /** Keep trees this far from track edges. */
  trackClearance: number;
  boulderDensity: number;
  /** Termite mounds per hectare on the open, gentler grassland (none when absent). */
  termiteMounds?: number;
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
  /** Rounded hills under forest rather than rugged mountains: no sharp crests or scree. */
  forested?: boolean;
}

/** A peak or massif in the country round the map. */
export interface HorizonHillDef extends HillDef {
  /** Bare granite above this share of its height (0 = all rock). */
  bare?: number;
  /** Colour of the bare granite: grey, or the black of Black Mountain's boulders. */
  granite?: 'grey' | 'black';
}

/** A river running on beyond the map's edge to the sea or up into the ranges. */
export interface HorizonValleyDef {
  id: string;
  /** Centreline with the water level at each point (the first at the map's edge, matching the creek there). */
  points: ReadonlyArray<{ x: number; z: number; level: number }>;
  /** Half width of the river itself (m). */
  channel: number;
  /** Half width of the flat valley floor (m). */
  floor: number;
  /** Rise of the valley sides per metre beyond the floor. */
  slope: number;
  /** The floor is cleared paddocks and cane rather than forest. */
  cleared?: boolean;
}

/**
 * The country beyond the map's edge, drawn as distant land and sea out to the horizon
 * (render/horizon.ts). Positions are map coordinates, so landforms can sit kilometres out.
 */
export interface HorizonDef {
  /** Height of the rolling foothills (m), before hills, ranges and valleys. */
  base: number;
  /** Height of the smaller hills and gullies on the foothills (m). */
  relief: number;
  /**
   * The coastline, listed south to north with the sea to the east. The land falls to the
   * sea over `coastPlain` metres inland. Omit both for no sea.
   */
  coast?: readonly XZ[];
  coastPlain?: number;
  hills: readonly HorizonHillDef[];
  ridges: readonly RidgeDef[];
  valleys: readonly HorizonValleyDef[];
  /** Drier open eucalypt woodland rather than rainforest (edges blend over a third of the radius). */
  woodland: readonly ClearingDef[];
}

/**
 * Black soil country: off the tracks the flatter ground is black soil, which bogs a
 * vehicle when wet. It starts `margin` metres out from a track's edge (up to a metre and
 * a half further, ragged), leaves camps and their surrounds firm, and stops on slopes steeper
 * than `maxSlopeDeg`, which shed the water. Noise leaves patches of firm grass where it
 * is above `firmAbove` (-1..1; 1 = none).
 */
export interface BlackSoilDef {
  margin: number;
  maxSlopeDeg: number;
  firmAbove: number;
}

export interface MapDef {
  id: string;
  name: string;
  seed: number;
  /** Extent east–west (x) in metres; the map is centred on the origin. A multiple of 256. */
  width: number;
  /** Extent north–south (z) in metres. A multiple of 256. */
  length: number;
  /** Playable half-extents east–west and north–south: an invisible wall stops the car beyond these. */
  wall: readonly [number, number];
  /** Valley floor height along x: pairs of [x, height] (or along z, south to north, with `floorAlong: 'z'`). */
  floor: readonly XZ[];
  floorAlong?: 'x' | 'z';
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
  /** The land and sea beyond the edge (rolling forested hills all round when absent). */
  horizon?: HorizonDef;
  scarps: readonly ScarpDef[];
  hills: readonly HillDef[];
  ridges: readonly RidgeDef[];
  flats: readonly FlatDef[];
  /** Creeks and rivers, each carved with its own water level, width and depth. */
  creeks: readonly CreekDef[];
  tracks: readonly TrackDef[];
  patches: readonly PatchDef[];
  bogs: readonly BogDef[];
  gullies: readonly GullyDef[];
  pois: readonly PoiDef[];
  props: readonly PropDef[];
  /** Things to load off the main line (none when absent). */
  finds?: readonly FindDef[];
  boulders: readonly BoulderDef[];
  tors: readonly TorDef[];
  fallenTrees: readonly FallenTreeDef[];
  crawlCourses?: readonly CrawlCourseDef[];
  crawlTrails?: readonly CrawlTrailDef[];
  gates?: readonly GateDef[];
  /** Optional scored challenge using this map's numbered gates. */
  gateCourse?: { id: string; name: string; trackId: string };
  vegetation: VegetationDef;
  /** Repainted colour tokens (a tropical map's greener grass and red clay). */
  palette?: PaletteOverrides;
  /** Steep cuttings and fill beside the tracks are bare clay, not scree. */
  clayBanks?: boolean;
  /** After rain the edges of dirt, clay and gravel tracks, and any clay banks, are mud. */
  muddyEdges?: boolean;
  /** Boggy black soil over most of the ground off the tracks (none when absent). */
  blackSoil?: BlackSoilDef;
  /** POI id of the spawn campsite. */
  spawnCampsite: string;
}
