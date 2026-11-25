import { saveData } from './helpers/saves';
import { describe, expect, it } from 'vitest';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { lateAfternoon } from '../src/data/environment';
import { perentieTuning } from '../src/data/perentie';
import { unimogTuning as t } from '../src/data/unimog';
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

describe('Unimog UL1700L', () => {
  it('is an Army Unimog: 3.85 m wheelbase, 12.5R20s, a diesel six and a crawling low range', () => {
    expect(vehicleOrder).toContain('unimog');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(3.85, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(1.12, 2);
    expect(t.gearbox.ratios).toHaveLength(4);
    expect(t.engine.redlineRpm).toBe(2800);
    // A diesel six: its engine sound fires six cylinders and knocks.
    expect(engineSynthTunings.unimog.firingOrder).toHaveLength(6);
    expect(engineSynthTunings.unimog.knock).toBeDefined();
    // 80 km/h in top gear is under the governed 2800 rpm; first low creeps at idle
    // slower than any of the others.
    expect(coupledRpm(t, 80 / 3.6, 3, 'high')).toBeLessThan(2700);
    const creep = (v: typeof t) => (v.engine.idleRpm / coupledRpm(v, 1, 0, 'low')) * 3.6;
    expect(creep(t)).toBeLessThan(1.6);
    for (const id of vehicleOrder)
      if (id !== 'unimog') expect(creep(vehicles[id].tuning)).toBeGreaterThan(creep(t));
    // Three times the Land Rover's weight, so its winch pulls three times as hard, and its
    // lockers engage on the move.
    expect(t.mass / perentieTuning.mass).toBeGreaterThan(2.9);
    expect(t.crawling.diffLockMaxKmh).toBeGreaterThan(perentieTuning.crawling.diffLockMaxKmh);
    // It breathes high up, and its pintle hook is behind everything else.
    expect(t.intakeHeight).toBeGreaterThan(2);
    for (const box of t.bodyBoxes) expect(box.cz + box.hz).toBeLessThan(t.towPoint.z);
  });

  it('sits higher off the ground than the others', () => {
    const clearance = (v: typeof t) =>
      Math.min(...v.bodyBoxes.map((b) => b.cy - b.hy)) + v.wheelRadius + 0.12;
    for (const id of vehicleOrder)
      if (id !== 'unimog') expect(clearance(t)).toBeGreaterThan(clearance(vehicles[id].tuning) + 0.1);
  });

  it('idles near 650 rpm stopped in gear, holds still, and is slow: 40 km/h in 8 to 13 s, never 70', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    const v = s.vehicle;
    expect(v.drivetrain.rpm).toBeGreaterThan(590);
    expect(v.drivetrain.rpm).toBeLessThan(670);
    expect(Math.abs(v.speed)).toBeLessThan(0.05);
    let time = 0;
    while (v.speed * 3.6 < 40 && time < 20) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    expect(time).toBeGreaterThan(8);
    expect(time).toBeLessThan(13);
    s.run(30, { throttle: 1 });
    expect(v.speed * 3.6).toBeGreaterThan(55);
    expect(v.speed * 3.6).toBeLessThan(70);
    s.physics.world.free();
  });

  it('stays upright through a full-lock turn at 40 km/h and climbs 30° in low range', async () => {
    const s = await makeScene({ speed: 40 / 3.6, tuning: t });
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
    expect(z0 - hill.vehicle.position.z).toBeGreaterThan(9);
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
    expect(v.tuning.id).toBe('unimog');
    inputs.set('p', { ...emptyInput(), throttle: 0.6 });
    for (let i = 0; i < 180; i++) sim.step(inputs, 1 / 60);
    expect(Math.hypot(v.position.x - before.x, v.position.z - before.z)).toBeGreaterThan(3);
    sim.physics.free();
  });

  it('draws clear wheels, coil springs, its own dials, the planks on the tilt, and takes dirt and dents', async () => {
    const model = new VehicleModel(t);
    expect(model.root.name).toBe('unimog-ul1700l');
    const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.updateMatrixWorld();
    // Nothing of the body hangs in front of the wheels' faces.
    for (const wheel of t.wheels) {
      const side = Math.sign(wheel.x);
      const ray = new Raycaster(new Vector3(side * 0.75, -0.12, wheel.z), new Vector3(side, 0, 0), 0, 0.5);
      expect(ray.intersectObject(shell)).toHaveLength(0);
    }
    // The body is about 6.6 m long over the towing jaws and the pintle hook, 2.3 m wide
    // (about 3.1 m across the mirrors), the tilt about 2.9 m off the ground.
    const box = new Box3().setFromBufferAttribute(model.body.geometry.getAttribute('position') as never);
    expect(box.max.z - box.min.z).toBeGreaterThan(6.5);
    expect(box.max.x - box.min.x).toBeLessThan(3.2);
    expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-')).length).toBeGreaterThan(
      0,
    );
    expect(model.rackPlanks.children).toHaveLength(2);
    const condition = createCondition();
    condition.dirt = { front: 1, sides: 1, rear: 1, wheels: 1 };
    condition.dents.push({ x: 1.1, y: 1.0, z: -0.9, nx: 1, ny: 0, nz: 0, radius: 0.6, depth: 0.06 });
    const colors = Float32Array.from(model.body.geometry.getAttribute('color').array);
    model.applyCondition(condition);
    expect(model.body.geometry.getAttribute('color').array).not.toEqual(colors);

    const scene = await makeScene({ speed: 5, tuning: t });
    scene.run(0.5, { steer: 1, throttle: 0.4 });
    for (let i = 0; i < 120; i++) model.update(scene.vehicle, 1, 1 / 60);
    expect(model.instruments.wheel.rotation.z).toBeLessThan(-Math.PI * 2);
    const kmh = Math.abs(scene.vehicle.speed) * 3.6;
    expect(-model.instruments.needles.speed.rotation.z).toBeCloseTo(
      DIAL_START + (DIAL_SWEEP * kmh) / vehicles.unimog.cabin.dials.speed.max,
      2,
    );
    scene.physics.world.free();
    model.dispose();
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeSave(saveData({ vehicle: 'unimog' }), s);
    expect(loadSave(s)!.vehicle).toBe('unimog');
  });
});
