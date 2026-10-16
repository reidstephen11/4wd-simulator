import type { MapDef, PoiDef } from './mapTypes';
import type { Terrain } from './terrain';
import type { TerrainFeatures } from './features';
import { generateTerrainSteps, type GenStep } from './terrainGen';

/** Everything static about the map: terrain, derived features and points of interest. */
export interface World {
  map: MapDef;
  terrain: Terrain;
  features: TerrainFeatures;
  pois: readonly PoiDef[];
}

/** Build the world, yielding progress so a loading screen can update. */
export function* buildWorldSteps(map: MapDef): Generator<GenStep, World, void> {
  const gen = generateTerrainSteps(map);
  let r = gen.next();
  while (!r.done) {
    yield { progress: r.value.progress * 0.85, label: r.value.label };
    r = gen.next();
  }
  const { terrain, features } = r.value;
  return { map, terrain, features, pois: map.pois };
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
