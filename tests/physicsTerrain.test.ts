import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { mulberry32 } from '../src/sim/world/rng';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { testWorld } from './world';

describe('terrain collider', () => {
  it('matches Terrain.heightAt everywhere (same triangles as the render mesh)', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    // Scene queries are built on the first step.
    sim.step(new Map(), 1 / 60);
    const rand = mulberry32(99);
    let maxErr = 0;
    for (let i = 0; i < 400; i++) {
      const x = (rand() - 0.5) * 1400;
      const z = (rand() - 0.5) * 1400;
      const ray = new R.Ray({ x, y: 1000, z }, { x: 0, y: -1, z: 0 });
      const hit = sim.physics.world.castRay(
        ray,
        2000,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (c) => c.handle === sim.physics.terrainCollider?.handle,
      );
      expect(hit).not.toBeNull();
      const y = 1000 - (hit?.timeOfImpact ?? 0);
      maxErr = Math.max(maxErr, Math.abs(y - world.terrain.heightAt(x, z)));
    }
    expect(maxErr).toBeLessThan(0.01);
  });

  it('spawns the vehicle at the campsite resting on its wheels', async () => {
    const R = await loadRapier();
    const sim = new Simulation(R, testWorld(), lateAfternoon);
    const v = sim.addVehicle('p', sim.campsitePose('river-flat-camp'));
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 120; i++) sim.step(inputs, 1 / 60);
    expect(v.wheels.every((w) => w.contact)).toBe(true);
    expect(v.tiltDeg()).toBeLessThan(8);
    expect(Math.abs(v.speed)).toBeLessThan(0.2);
    // State is plain, serialisable data.
    const state = JSON.parse(JSON.stringify(sim.serialize()));
    expect(state.vehicles[0].id).toBe('p');
  });
});
