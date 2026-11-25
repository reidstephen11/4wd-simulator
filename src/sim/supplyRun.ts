import { trailers } from '../data/trailers';
import type { VehicleTuning } from '../data/vehicle';
import type { Simulation } from './sim';
import type { Trailer } from './trailer';
import type { PoiDef } from './world/mapTypes';

/** The Army supply run: drums on the trailer, and the camp they go to. */
export const supplyRun = { drums: 2, goal: 'bloomfield-camp' } as const;

/**
 * The Army supply run: a trailer with the drums of diesel hitched
 * behind the vehicle at the start, the No. 5 for a pintle hook and the box trailer for a ball.
 */
export function hitchSupplyTrailer(sim: Simulation, vehicle: VehicleTuning, vehicleId: string): Trailer {
  const trailer = sim.addTrailer('delivery', trailers[vehicle.hitch ? 'no5' : 'box6x4'], vehicleId);
  trailer.loadDrums(supplyRun.drums);
  return trailer;
}

/** The supply run is done: an upright trailer parked at the camp with every drum still aboard. */
export function supplyDelivered(all: Iterable<Trailer>, pois: readonly PoiDef[]): boolean {
  const camp = pois.find((q) => q.id === supplyRun.goal);
  return !!camp && [...all].some((t) => deliveryArrived(t, camp, supplyRun.drums));
}

/** Parking the car alone, an empty trailer or a trailer on its side does not deliver anything. */
export function deliveryArrived(t: Trailer, goal: PoiDef, drums: number): boolean {
  const p = t.body.translation();
  const speed = t.body.linvel();
  return (
    t.drums >= drums &&
    t.tiltDeg() < 25 &&
    Math.hypot(p.x - goal.x, p.z - goal.z) <= goal.radius &&
    Math.hypot(speed.x, speed.y, speed.z) < 0.6
  );
}
