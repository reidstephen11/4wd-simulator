import type { WeatherTimeline } from '../../data/weatherTimeline';
import { NO_WATER } from './terrain';
import type { World } from './world';

/**
 * Creeks rising in a storm. The water grid only covers a creek's channel, so a creek
 * that rises over its banks would end in a wall at the channel's edge. Before the
 * physics and the meshes are built, the channel's water level is spread over the low
 * banks beside it, under the ground there until the creek rises over them. Only maps
 * with a storm do this; it changes nothing until the creeks rise.
 *
 * Cells this close to a creek's edge (m, `creekDistance`) are creek water; puddles and
 * rain-filled mud holes always lie further off (puddles 8 m, mud holes 15 m).
 */
export const CREEK_MARGIN = 4;

/**
 * Get a map ready for its storm: spread the creeks' water over banks lower than the
 * storm's highest rise above it, and work out each water sample's share of the rise
 * (`features.creekRise`): the creek's own share from the storm (1 unless it says less),
 * and none for puddles and mud holes. Returns the bank samples added.
 */
export function prepareFlood(world: World, storm: WeatherTimeline): number {
  const t = world.terrain;
  const near = world.features.creekDistance;
  // The standing rise of a wet track is already in the water before the first drop falls.
  const maxRise = (storm.creeks.standing ?? 0) + storm.creeks.maxRise;
  let added = 0;
  // A ring of cells at a time, out to the margin, each taking its highest wet neighbour's level.
  for (let ring = 0; ring < CREEK_MARGIN; ring++) {
    const next: Array<[number, number]> = [];
    for (let iz = 1; iz < t.resZ - 1; iz++)
      for (let ix = 1; ix < t.resX - 1; ix++) {
        const i = iz * t.resX + ix;
        if (near[i] > CREEK_MARGIN || t.water[i] > NO_WATER) continue;
        let level = NO_WATER;
        for (const j of [i - 1, i + 1, i - t.resX, i + t.resX])
          if (near[j] <= CREEK_MARGIN && t.water[j] > level) level = t.water[j];
        // Only dry bank above the water: never ground below it (beside a fall), which would flood now.
        if (level > NO_WATER && t.heights[i] >= level && t.heights[i] < level + maxRise)
          next.push([i, level]);
      }
    for (const [i, level] of next) t.water[i] = level;
    added += next.length;
  }

  const share = new Float32Array(t.water.length);
  for (let i = 0; i < share.length; i++) if (t.water[i] > NO_WATER && near[i] <= CREEK_MARGIN) share[i] = 1;
  // Creeks that rise less than the rest: their samples, out to the margin past their banks.
  for (const c of world.features.creeks) {
    const s = storm.creeks.shares?.[c.def.id];
    if (s === undefined) continue;
    const { xs, zs } = c.poly;
    for (let k = 0; k + 1 < c.poly.count; k++) {
      const reach = Math.max(c.halfWidth[k], c.halfWidth[k + 1]) + CREEK_MARGIN + 1;
      const x0 = Math.max(0, Math.floor(Math.min(xs[k], xs[k + 1]) - reach + t.halfX));
      const x1 = Math.min(t.resX - 1, Math.ceil(Math.max(xs[k], xs[k + 1]) + reach + t.halfX));
      const z0 = Math.max(0, Math.floor(Math.min(zs[k], zs[k + 1]) - reach + t.halfZ));
      const z1 = Math.min(t.resZ - 1, Math.ceil(Math.max(zs[k], zs[k + 1]) + reach + t.halfZ));
      const vx = xs[k + 1] - xs[k];
      const vz = zs[k + 1] - zs[k];
      const len2 = vx * vx + vz * vz || 1;
      for (let iz = z0; iz <= z1; iz++)
        for (let ix = x0; ix <= x1; ix++) {
          const i = iz * t.resX + ix;
          if (share[i] === 0) continue;
          const x = ix - t.halfX;
          const z = iz - t.halfZ;
          const u = Math.max(0, Math.min(1, ((x - xs[k]) * vx + (z - zs[k]) * vz) / len2));
          if (Math.hypot(xs[k] + vx * u - x, zs[k] + vz * u - z) <= reach) share[i] = s;
        }
    }
  }
  world.features.creekRise = share;
  return added;
}

/** A sample's share of the creeks' rise (0 off the creeks, or on a map without a storm). */
export function riseShare(world: World, i: number): number {
  return world.features.creekRise?.[i] ?? 0;
}
