import { highCountryMap } from './fixtures/maps/map';
import { ironbarkParkMap } from './fixtures/maps/park';
import { crawlerCreekMap } from './fixtures/maps/crawlerCreek';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { buildWorld, type World } from '../src/sim/world/world';

let cached: World | null = null;
let park: World | null = null;
let creek: World | null = null;

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

/** Crawler Creek, shared the same way. */
export function crawlerCreekWorld(): World {
  creek ??= buildWorld(crawlerCreekMap);
  return creek;
}

let ironbark: World | null = null;

/** Ironbark Creek, the first playground level, shared the same way. */
export function ironbarkWorld(): World {
  ironbark ??= buildWorld(ironbarkMap);
  return ironbark;
}
