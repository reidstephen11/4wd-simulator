import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { vehicles } from '../src/data/vehicles';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { testWorld } from './world';

const DT = 1 / 60;

/**
 * Revving with nothing driving the wheels (v0.27). On loose ground a standing car with the
 * throttle in is taken to be bogged and its wheels spin and dig; that used the pedal alone, so
 * the wheels spun in neutral too.
 */
describe('revving in neutral', () => {
  it('turns no wheel, and in gear the same pedal still does', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.setGearboxMode('manual');
    const tuning = vehicles.hilux.tuning;
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite, tuning.wheelRadius), tuning);
    const v = sim.vehicles.get('p')!;
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 60; i++) sim.step(inputs, DT);
    sim.startEngine('p');
    for (let i = 0; i < 120; i++) sim.step(inputs, DT);
    expect(v.drivetrain.engineRunning).toBe(true);
    expect(v.drivetrain.neutral).toBe(true);
    const start = { ...v.position };
    const idle = v.drivetrain.rpm;
    // On the handbrake, so the car does not roll off down the camp's slope with the pedal in.
    inputs.set('p', { ...emptyInput(), throttle: 1, handbrake: true });
    let spun = 0;
    for (let i = 0; i < 120; i++) {
      sim.step(inputs, DT);
      spun = Math.max(spun, ...v.wheels.map((w) => w.spin));
    }
    // The engine revs; the wheels do not turn and the car stays put.
    expect(v.drivetrain.rpm).toBeGreaterThan(idle + 800);
    expect(spun).toBe(0);
    expect(Math.hypot(v.position.x - start.x, v.position.z - start.z)).toBeLessThan(0.05);

    // Held on the handbrake in 1st on the same ground, the same pedal spins them.
    inputs.set('p', { ...emptyInput(), shiftUp: true });
    sim.step(inputs, DT);
    expect(v.drivetrain.neutral).toBe(false);
    inputs.set('p', { ...emptyInput(), throttle: 1, handbrake: true });
    spun = 0;
    for (let i = 0; i < 90; i++) {
      sim.step(inputs, DT);
      spun = Math.max(spun, ...v.wheels.map((w) => w.spin));
    }
    expect(spun).toBeGreaterThan(0.05);
    sim.physics.free();
  });
});
