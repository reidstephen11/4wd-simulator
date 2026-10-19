import type { MapDef, PoiDef } from './mapTypes';
import type { Terrain } from './terrain';
import type { TerrainFeatures } from './features';
import { generateTerrainSteps, type GenStep } from './terrainGen';
import { generateScatter, SpatialGrid, type RockInstance, type Scatter, type TreeInstance } from './scatter';
import { courseObstacles } from './crawlCourse';
import { trailObstacles, trailLogs, trailStones } from './crawlTrail';
import { bridgeTimbers, gateInfos } from './bridges';

/** Everything static about the map: terrain, derived features, scatter and points of interest. */
export interface World {
  map: MapDef;
  terrain: Terrain;
  features: TerrainFeatures;
  scatter: Scatter;
  treeGrid: SpatialGrid<TreeInstance>;
  rockGrid: SpatialGrid<RockInstance>;
  pois: readonly PoiDef[];
}

/** Build the world, yielding progress so a loading screen can update. */
export function* buildWorldSteps(map: MapDef): Generator<GenStep, World, void> {
  const gen = generateTerrainSteps(map);
  let r = gen.next();
  while (!r.done) {
    yield { progress: r.value.progress * 0.8, label: r.value.label };
    r = gen.next();
  }
  const { terrain, features } = r.value;
  for (const course of map.crawlCourses ?? []) features.boxes.push(...courseObstacles(course, terrain));
  for (const trail of map.crawlTrails ?? []) {
    features.boxes.push(...trailObstacles(trail, features.tracks, terrain));
    features.rocks.push(...trailStones(trail, features.tracks, terrain));
    features.logs.push(...trailLogs(trail, features.tracks, terrain));
  }
  for (const track of features.tracks) features.timbers.push(...bridgeTimbers(track, terrain));
  features.gates.push(...gateInfos(map.gates ?? [], features.tracks, terrain));
  yield { progress: 0.66, label: 'Growing trees' };
  const scatter = generateScatter(map, terrain, features);
  return {
    map,
    terrain,
    features,
    scatter,
    treeGrid: new SpatialGrid(16, scatter.trees),
    rockGrid: new SpatialGrid(16, scatter.rocks),
    pois: map.pois,
  };
}

export function buildWorld(map: MapDef): World {
  const gen = buildWorldSteps(map);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

export function campsite(world: World, id: string): PoiDef {
  const p = world.pois.find((q) => q.id === id && q.kind === 'campsite');
  if (!p) throw new Error(`Unknown campsite ${id}`);
  return p;
}
