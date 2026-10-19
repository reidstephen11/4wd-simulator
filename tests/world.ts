import { highCountryMap } from '../src/data/map';
import { ironbarkParkMap } from '../src/data/park';
import { buildWorld, type World } from '../src/sim/world/world';

let cached: World | null = null;
let park: World | null = null;

/** Shared world for tests (generation takes a couple of seconds). */
export function testWorld(): World {
  cached ??= buildWorld(highCountryMap);
  return cached;
}

/** Ironbark 4WD Park, shared the same way. */
export function parkWorld(): World {
  park ??= buildWorld(ironbarkParkMap);
  return park;
}
