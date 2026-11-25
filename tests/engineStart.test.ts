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

  it('arrives switched off: silent and held still until the pedal turns it over, then drives once it catches', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    const tuning = vehicles.shortie.tuning;
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite, tuning.wheelRadius), tuning);
    const inputs = new Map([['p', emptyInput()]]);
    sim.switchOffEngine('p');
    const v = sim.vehicles.get('p')!;
    const events: string[] = [];
    sim.events.on('engine', ({ event }) => events.push(event));
    for (let i = 0; i < 120; i++) sim.step(inputs, DT);
    expect(v.engineOff).toBe(true);
    expect(v.drivetrain.engineRunning).toBe(false);
    expect(v.drivetrain.rpm).toBe(0);
    expect(sim.serialize().vehicles[0].engineOff).toBe(true);
    expect(events).toEqual([]);
    const start = { ...v.position };
    // The pedal turns it over on the starter; nothing moves until it catches.
    inputs.set('p', { ...emptyInput(), throttle: 1 });
    sim.step(inputs, DT);
    expect(events).toEqual(['starting']);
    expect(v.engineOff).toBe(false);
    for (let t = DT; t < tuning.engine.crankSeconds - 0.1; t += DT) {
      sim.step(inputs, DT);
      expect(v.drivetrain.engineRunning).toBe(false);
    }
    expect(Math.hypot(v.position.x - start.x, v.position.z - start.z)).toBeLessThan(0.05);
    for (let i = 0; i < 12; i++) sim.step(inputs, DT);
    expect(v.drivetrain.engineRunning).toBe(true);
    for (let i = 0; i < 120; i++) sim.step(inputs, DT);
    expect(Math.hypot(v.position.x - start.x, v.position.z - start.z)).toBeGreaterThan(1);
    expect(events).toEqual(['starting']);
    sim.physics.free();
  });

  it('starts on the pedal in reverse too', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    const tuning = vehicles.shortie.tuning;
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite, tuning.wheelRadius), tuning);
    sim.switchOffEngine('p');
    const v = sim.vehicles.get('p')!;
    sim.step(new Map([['p', { ...emptyInput(), brake: 1 }]]), DT);
    expect(v.engineOff).toBe(false);
    expect(v.crank).toBeGreaterThan(0);
    sim.physics.free();
  });
  it('in Manual (no clutch button), the pedal starts the engine in gear', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.setGearboxMode('manual');
    const tuning = vehicles.hilux.tuning;
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite, tuning.wheelRadius), tuning);
    const v = sim.vehicles.get('p')!;
    expect(v.drivetrain.neutral).toBe(true);
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 30; i++) sim.step(inputs, DT);
    sim.switchOffEngine('p');
    const events: string[] = [];
    sim.events.on('engine', ({ event }) => events.push(event));
    // Into 1st with the engine off, then the pedal: it cranks without neutral or a clutch.
    inputs.set('p', { ...emptyInput(), shiftUp: true });
    sim.step(inputs, DT);
    expect(v.drivetrain.neutral).toBe(false);
    expect(v.drivetrain.gear).toBe(0);
    inputs.set('p', { ...emptyInput(), throttle: 1 });
    sim.step(inputs, DT);
    expect(v.engineOff).toBe(false);
    expect(events).toEqual(['starting']);
    sim.physics.free();
  });
  it("in the sim-level 'clutch' mode, the pedal starts the engine only in neutral or with the clutch in", async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.setGearboxMode('clutch');
    const tuning = vehicles.hilux.tuning;
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite, tuning.wheelRadius), tuning);
    const v = sim.vehicles.get('p')!;
    // It arrives in neutral.
    expect(v.drivetrain.neutral).toBe(true);
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 30; i++) sim.step(inputs, DT);
    sim.switchOffEngine('p');
    const events: string[] = [];
    sim.events.on('engine', ({ event }) => events.push(event));
    // Into 1st with the engine off: the pedal doesn't turn it over, and says why once.
    inputs.set('p', { ...emptyInput(), shiftUp: true });
    sim.step(inputs, DT);
    expect(v.drivetrain.neutral).toBe(false);
    expect(v.drivetrain.gear).toBe(0);
    inputs.set('p', { ...emptyInput(), throttle: 1 });
    for (let i = 0; i < 30; i++) sim.step(inputs, DT);
    expect(v.engineOff).toBe(true);
    expect(events).toEqual(['clutchToStart']);
    // With the clutch held it cranks.
    inputs.set('p', { ...emptyInput(), throttle: 1, clutch: 1 });
    sim.step(inputs, DT);
    expect(v.engineOff).toBe(false);
    expect(events).toEqual(['clutchToStart', 'starting']);
    // In neutral it cranks with the clutch out.
    sim.switchOffEngine('p');
    inputs.set('p', { ...emptyInput(), shiftDown: true });
    sim.step(inputs, DT);
    expect(v.drivetrain.neutral).toBe(true);
    inputs.set('p', { ...emptyInput(), throttle: 1 });
    sim.step(inputs, DT);
    expect(v.engineOff).toBe(false);
    expect(events).toEqual(['clutchToStart', 'starting', 'starting']);
    sim.physics.free();
  });
});
