import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { Autopilot } from '../src/sim/input/autopilot';
import { headingOf } from '../src/sim/vehicle/math';
import { poiApproach } from '../src/sim/world/poiApproach';
import { testWorld } from './world';

describe('every POI is reachable by driving (M3)', async () => {
  const world = testWorld();
  const R = await loadRapier();
  for (const poi of world.pois) {
    it(`drives into ${poi.name}`, () => {
      const sim = new Simulation(R, world, lateAfternoon);
      const path = poiApproach(poi, world.features.tracks);
      const start = path[0];
      const heading = headingOf(path[3][0] - start[0], path[3][1] - start[1]);
      const v = sim.addVehicle('p', sim.poseAt(start[0], start[1], heading));
      const pilot = new Autopilot(path, 5);
      pilot.lowRange = true;
      const inputs = new Map();
      let reached = false;
      for (let i = 0; i < 60 * 90 && !reached; i++) {
        inputs.set('p', pilot.input(v, 1 / 60));
        sim.step(inputs, 1 / 60);
        const p = v.body.translation();
        if (Math.hypot(p.x - poi.x, p.z - poi.z) < poi.radius) reached = true;
      }
      const p = v.body.translation();
      expect(
        reached,
        `${poi.id}: ended ${Math.hypot(p.x - poi.x, p.z - poi.z).toFixed(1)} m away, tilt ${v.tiltDeg().toFixed(0)}`,
      ).toBe(true);
      expect(v.tiltDeg()).toBeLessThan(60);
    });
  }
});
