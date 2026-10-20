import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { testWorld } from './world';

const DT = 1 / 60;

/**
 * Drive south from River Flat Camp, holding about `kmh`, into a candlebark trunk at about
 * (-161, 351.6) (the playtest's repro): the speed at the hit and what the car does in
 * the three seconds after it.
 */
async function hitTree(kmh: number) {
  const sim = new Simulation(await loadRapier(), testWorld(), lateAfternoon);
  const v = sim.addVehicle('p', sim.poseAt(-160, 246, 180));
  sim.startEngine('p');
  const inputs = new Map<string, VehicleInput>();
  for (let t = 0; t < 1.5; t += DT) {
    inputs.set('p', emptyInput());
    sim.step(inputs, DT);
  }
  let hitSpeed = 0,
    after = 0,
    reverse = 0,
    moving = 0,
    tilt = 0;
  for (let t = 0; t < 20 && after < 3; t += DT) {
    const fast = v.speed * 3.6 > kmh;
    inputs.set('p', { ...emptyInput(), throttle: fast ? 0 : 1 });
    const before = v.speed * 3.6;
    sim.step(inputs, DT);
    if (!hitSpeed && v.lastImpact > 5) hitSpeed = before;
    if (!hitSpeed) continue;
    after += DT;
    reverse = Math.max(reverse, -v.speed * 3.6);
    const lv = v.body.linvel();
    if (after > 0.1) moving = Math.max(moving, Math.hypot(lv.x, lv.z) * 3.6);
    tilt = Math.max(tilt, v.tiltDeg());
  }
  return { hitSpeed, reverse, moving, tilt };
}

describe('hitting a tree', () => {
  for (const kmh of [30, 60])
    it(`stops the car at ${kmh} km/h instead of throwing it back or spinning it away`, async () => {
      const r = await hitTree(kmh);
      expect(r.hitSpeed).toBeGreaterThan(kmh * 0.85);
      expect(r.reverse).toBeLessThan(3);
      expect(r.moving).toBeLessThan(6);
      expect(r.tilt).toBeLessThan(60);
    }, 60_000);
});
