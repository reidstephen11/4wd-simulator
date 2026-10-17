import { highCountryMap } from '../src/data/map';
import { buildWorld, type World } from '../src/sim/world/world';

let cached: World | null = null;

/** Shared world for tests (generation takes a couple of seconds). */
export function testWorld(): World {
  cached ??= buildWorld(highCountryMap);
  return cached;
}
