import { saveData } from './helpers/saves';
import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { lateAfternoon } from '../src/data/environment';
import { hiluxTuning as t } from '../src/data/hilux';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { DIAL_START, DIAL_SWEEP } from '../src/render/vehicleInstruments';
import { VehicleModel } from '../src/render/vehicleModel';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { Simulation } from '../src/sim/sim';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { createCondition } from '../src/sim/vehicle/condition';
import { makeScene } from './helpers/scenes';
import { testWorld } from './world';

describe('Hilux single cab', () => {
  it('is an early 4WD Hilux: 2.8 m wheelbase, 7.00-16s, four speeds, 4.375 axles and a 2.28 low range', () => {
    expect(vehicleOrder).toContain('hilux');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.8, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(0.8, 2);
    expect(t.gearbox.ratios).toHaveLength(4);
    expect([t.gearbox.finalDrive, t.ranges.low.ratio]).toEqual([4.375, 2.28]);
    // A petrol four: its engine sound fires four cylinders and cranks as long as the starter.
    expect(engineSynthTunings.hilux.firingOrder).toHaveLength(4);
    expect(engineSynthTunings.hilux.knock).toBeUndefined();
    // 100 km/h in top is under 3800 rpm; first low creeps at a walk at idle.
    expect(coupledRpm(t, 100 / 3.6, 3, 'high')).toBeLessThan(3800);
    const idleCreep = (t.engine.idleRpm / coupledRpm(t, 1, 0, 'low')) * 3.6;
    expect(idleCreep).toBeLessThan(3.2);
  });

  it('idles near 750 rpm stopped in gear, holds still, and reaches 60 km/h in 8 to 12 s', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    const v = s.vehicle;
    expect(v.drivetrain.rpm).toBeGreaterThan(680);
    expect(v.drivetrain.rpm).toBeLessThan(770);
    expect(Math.abs(v.speed)).toBeLessThan(0.05);
    let time = 0;
    while (v.speed * 3.6 < 60 && time < 20) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    expect(time).toBeGreaterThan(8);
    expect(time).toBeLessThan(12);
    s.physics.world.free();
  });

  it('stays upright through a full-lock turn at 50 km/h and climbs 30° in low range', async () => {
    const s = await makeScene({ speed: 50 / 3.6, tuning: t });
    let tilt = 0;
    s.run(3, (time) => {
      tilt = Math.max(tilt, s.vehicle.tiltDeg());
      return { throttle: 0.6, steer: time > 0.3 ? 1 : 0 };
    });
    expect(tilt).toBeLessThan(20);
    s.physics.world.free();
    const hill = await makeScene({ pitchDeg: 30, tuning: t });
    hill.vehicle.toggleRange();
    const z0 = hill.vehicle.position.z;
    hill.run(12, { throttle: 1 });
    expect(z0 - hill.vehicle.position.z).toBeGreaterThan(15);
    hill.physics.world.free();
  });

  it('swaps in where the other vehicle stood and drives off', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite));
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 60; i++) sim.step(inputs, 1 / 60);
    const before = { ...sim.vehicles.get('p')!.position };
    const v = sim.replaceVehicle('p', t);
    expect(v.tuning.id).toBe('hilux');
    inputs.set('p', { ...emptyInput(), throttle: 0.6 });
    for (let i = 0; i < 120; i++) sim.step(inputs, 1 / 60);
    expect(Math.hypot(v.position.x - before.x, v.position.z - before.z)).toBeGreaterThan(3);
    sim.physics.free();
  });

  it('draws open wheel wells, leaf springs, its own dials and two-spoke wheel, and takes dirt and dents', async () => {
    const model = new VehicleModel(t);
    expect(model.root.name).toBe('hilux-single-cab');
    const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.updateMatrixWorld();
    for (const wheel of t.wheels) {
      const side = Math.sign(wheel.x);
      const ray = new Raycaster(new Vector3(side * 0.6, -0.12, wheel.z), new Vector3(side, 0, 0), 0, 0.4);
      expect(ray.intersectObject(shell)).toHaveLength(0);
    }
    expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(0);
    expect(model.rackPlanks.children).toHaveLength(2);
    const condition = createCondition();
    condition.dirt = { front: 1, sides: 1, rear: 1, wheels: 1 };
    condition.dents.push({ x: 0.83, y: 0.3, z: -0.3, nx: -1, ny: 0, nz: 0, radius: 0.6, depth: 0.06 });
    const colors = Float32Array.from(model.body.geometry.getAttribute('color').array);
    model.applyCondition(condition);
    expect(model.body.geometry.getAttribute('color').array).not.toEqual(colors);

    const scene = await makeScene({ speed: 5, tuning: t });
    scene.run(0.5, { steer: 1, throttle: 0.4 });
    for (let i = 0; i < 120; i++) model.update(scene.vehicle, 1, 1 / 60);
    expect(model.instruments.wheel.rotation.z).toBeLessThan(-Math.PI * 2);
    const kmh = Math.abs(scene.vehicle.speed) * 3.6;
    expect(-model.instruments.needles.speed.rotation.z).toBeCloseTo(
      DIAL_START + (DIAL_SWEEP * kmh) / vehicles.hilux.cabin.dials.speed.max,
      2,
    );
    scene.physics.world.free();
    model.dispose();
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeSave(saveData({ vehicle: 'hilux' }), s);
    expect(loadSave(s)!.vehicle).toBe('hilux');
  });
});
