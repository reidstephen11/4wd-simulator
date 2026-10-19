import { describe, expect, it } from 'vitest';
import { engineSynthTunings } from '../src/data/audio';
import { lateAfternoon } from '../src/data/environment';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { testWorld } from './world';

const DT = 1 / 60;

describe('starting the engine', () => {
  it('cranks for as long as the starter sound plays', () => {
    for (const id of vehicleOrder)
      expect(vehicles[id].tuning.engine.crankSeconds, id).toBe(engineSynthTunings[id].starter.seconds);
  });

  for (const id of vehicleOrder)
    it(`holds the ${vehicles[id].tuning.name} still until the engine catches, then drives`, async () => {
      const world = testWorld();
      const sim = new Simulation(await loadRapier(), world, lateAfternoon);
      const tuning = vehicles[id].tuning;
      sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite, tuning.wheelRadius), tuning);
      const inputs = new Map([['p', emptyInput()]]);
      for (let i = 0; i < 60; i++) sim.step(inputs, DT);
      const events: string[] = [];
      sim.events.on('engine', ({ event }) => events.push(event));
      sim.startEngine('p');
      const v = sim.vehicles.get('p')!;
      const start = { ...v.position };
      // Full throttle from the first moment: nothing moves while it cranks.
      inputs.set('p', { ...emptyInput(), throttle: 1 });
      for (let t = 0; t < tuning.engine.crankSeconds - 0.1; t += DT) {
        sim.step(inputs, DT);
        expect(v.drivetrain.engineRunning).toBe(false);
      }
      expect(Math.hypot(v.position.x - start.x, v.position.z - start.z)).toBeLessThan(0.05);
      expect(v.drivetrain.rpm).toBe(tuning.engine.crankRpm);
      expect(sim.serialize().vehicles[0].crank).toBeGreaterThan(0);
      for (let i = 0; i < 12; i++) sim.step(inputs, DT);
      expect(v.drivetrain.engineRunning).toBe(true);
      for (let i = 0; i < 120; i++) sim.step(inputs, DT);
      expect(Math.hypot(v.position.x - start.x, v.position.z - start.z)).toBeGreaterThan(1);
      // Asking again while it's already starting does nothing.
      expect(events).toEqual(['starting']);
      sim.physics.free();
    });
});
