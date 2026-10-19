import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { lateAfternoon } from '../src/data/environment';
import { perentieTuning as t } from '../src/data/perentie';
import { vehicles } from '../src/data/vehicles';
import { DIAL_START, DIAL_SWEEP } from '../src/render/vehicleInstruments';
import { VehicleModel } from '../src/render/vehicleModel';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { defaultSettings, loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { Simulation } from '../src/sim/sim';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { createCondition } from '../src/sim/vehicle/condition';
import { makeScene } from './helpers/scenes';
import { testWorld } from './world';

describe('Land Rover 110 Perentie', () => {
  it('is geared like the Army 110: 3.54 axles, four speeds and a 3.32 low range on 7.50R16s', () => {
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.794, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(0.8, 2);
    // Cruising at the 105 km/h governor in top is under 3000 rpm; first low creeps at idle.
    expect(coupledRpm(t, 105 / 3.6, 3, 'high')).toBeLessThan(3000);
    const idleCreep = (t.engine.idleRpm / coupledRpm(t, 1, 0, 'low')) * 3.6;
    expect(idleCreep).toBeLessThan(3);
  });

  it('idles near 700 rpm stopped in gear, holds still, and reaches 60 km/h in 9 to 13 s', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    const v = s.vehicle;
    expect(v.drivetrain.rpm).toBeGreaterThan(640);
    expect(v.drivetrain.rpm).toBeLessThan(720);
    expect(Math.abs(v.speed)).toBeLessThan(0.05);
    let time = 0;
    while (v.speed * 3.6 < 60 && time < 20) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    expect(time).toBeGreaterThan(9);
    expect(time).toBeLessThan(13);
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

  it('swaps in where the other vehicle stood, drives off, and leaves no body behind', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite));
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 60; i++) sim.step(inputs, 1 / 60);
    const bodies = sim.physics.world.bodies.len();
    const before = { ...sim.vehicles.get('p')!.position };
    const v = sim.replaceVehicle('p', t);
    expect(v.tuning.id).toBe('perentie');
    expect(Math.hypot(v.position.x - before.x, v.position.z - before.z)).toBeLessThan(0.01);
    inputs.set('p', { ...emptyInput(), throttle: 0.6 });
    for (let i = 0; i < 120; i++) sim.step(inputs, 1 / 60);
    expect(Math.hypot(v.position.x - before.x, v.position.z - before.z)).toBeGreaterThan(3);
    expect(sim.physics.world.bodies.len()).toBe(bodies);
    expect(sim.serialize().vehicles).toHaveLength(1);
    sim.physics.free();
  });

  it('draws an open wheel well, coil springs, its own dials, and takes dirt and dents', async () => {
    const model = new VehicleModel(t);
    expect(model.root.name).toBe('land-rover-110-perentie');
    const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.updateMatrixWorld();
    for (const wheel of t.wheels) {
      const side = Math.sign(wheel.x);
      const ray = new Raycaster(new Vector3(side * 0.62, 0.2, wheel.z), new Vector3(side, 0, 0), 0, 0.4);
      expect(ray.intersectObject(shell)).toHaveLength(0);
    }
    expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(4);
    const condition = createCondition();
    condition.dirt = { front: 1, sides: 1, rear: 1, wheels: 1 };
    condition.dents.push({ x: 0.85, y: 0.4, z: -0.3, nx: -1, ny: 0, nz: 0, radius: 0.6, depth: 0.06 });
    const colors = Float32Array.from(model.body.geometry.getAttribute('color').array);
    model.applyCondition(condition);
    expect(model.body.geometry.getAttribute('color').array).not.toEqual(colors);

    const scene = await makeScene({ speed: 5, tuning: t });
    scene.run(0.5, { steer: 1, throttle: 0.4 });
    for (let i = 0; i < 120; i++) model.update(scene.vehicle, 1, 1 / 60);
    expect(model.instruments.wheel.rotation.z).toBeLessThan(-Math.PI * 2);
    const kmh = Math.abs(scene.vehicle.speed) * 3.6;
    expect(-model.instruments.needles.speed.rotation.z).toBeCloseTo(
      DIAL_START + (DIAL_SWEEP * kmh) / vehicles.perentie.cabin.dials.speed.max,
      2,
    );
    scene.physics.world.free();
    model.dispose();
  });

  it('is remembered in the save, and older or broken saves start in the short-wheelbase 4WD', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const exploration = { discovered: [], lastCampsite: 'river-flat-camp' };
    writeSave({ version: 1, exploration, settings: defaultSettings, vehicle: 'perentie' }, s);
    expect(loadSave(s)!.vehicle).toBe('perentie');
    writeSave({ version: 1, exploration, settings: defaultSettings }, s);
    expect(loadSave(s)!.vehicle).toBe('shortie');
    const [key] = [...data.keys()];
    data.set(key, JSON.stringify({ version: 1, exploration, settings: {}, vehicle: 'tank' }));
    expect(loadSave(s)!.vehicle).toBe('shortie');
  });
});
