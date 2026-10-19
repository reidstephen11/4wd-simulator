import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { perentieTuning } from '../src/data/perentie';
import { vehicleTuning } from '../src/data/vehicle';
import { VehicleModel } from '../src/render/vehicleModel';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { makeScene } from './helpers/scenes';
import { testWorld } from './world';

describe('handbrake', () => {
  it('latches on with one press and off with the next, and is part of the sim state', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite));
    const changes: boolean[] = [];
    sim.events.on('parkBrakeChanged', ({ on }) => changes.push(on));
    const inputs = new Map([['p', emptyInput()]]);
    const press = () => {
      inputs.set('p', { ...emptyInput(), toggleParkBrake: true });
      sim.step(inputs, 1 / 60);
      inputs.set('p', emptyInput());
      for (let i = 0; i < 30; i++) sim.step(inputs, 1 / 60);
    };
    press();
    const v = sim.vehicles.get('p')!;
    expect(v.parkBrake).toBe(true);
    expect(v.handbrake).toBe(true);
    expect(sim.serialize().vehicles[0].parkBrake).toBe(true);
    press();
    expect(v.parkBrake).toBe(false);
    expect(v.handbrake).toBe(false);
    expect(changes).toEqual([true, false]);
    sim.physics.free();
  });

  for (const tuning of [vehicleTuning, perentieTuning])
    it(`holds the ${tuning.name}'s rear wheels so it barely creeps off with it on`, async () => {
      const distance = async (parkBrake: boolean) => {
        const s = await makeScene({ tuning });
        s.run(1, {});
        s.vehicle.parkBrake = parkBrake;
        const z0 = s.vehicle.body.translation().z;
        s.run(4, { throttle: 0.4 });
        const d = z0 - s.vehicle.body.translation().z;
        s.physics.world.free();
        return d;
      };
      const free = await distance(false);
      const held = await distance(true);
      expect(free).toBeGreaterThan(3);
      expect(held).toBeLessThan(free / 2);
    });

  it('pulls the cabin lever up (or the handle out) when it is on', async () => {
    for (const tuning of [vehicleTuning, perentieTuning]) {
      const model = new VehicleModel(tuning);
      const s = await makeScene({ tuning });
      s.run(0.5, {});
      for (let i = 0; i < 30; i++) model.update(s.vehicle, 1, 1 / 60);
      const off = model.instruments.handbrake.position.clone();
      const offAngle = model.instruments.handbrake.rotation.x;
      s.vehicle.parkBrake = true;
      s.run(0.1, {});
      for (let i = 0; i < 30; i++) model.update(s.vehicle, 1, 1 / 60);
      const moved =
        model.instruments.handbrake.position.distanceTo(off) +
        Math.abs(model.instruments.handbrake.rotation.x - offAngle);
      expect(moved, tuning.name).toBeGreaterThan(0.05);
      s.physics.world.free();
      model.dispose();
    }
  });
});
