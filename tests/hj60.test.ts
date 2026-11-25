import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { hj60Tuning as t } from '../src/data/hj60';
import { troopyTuning } from '../src/data/troopy';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { VehicleModel } from '../src/render/vehicleModel';
import { loadSave, writeSave } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

describe('60 Series wagon', () => {
  it('is an HJ60: 2.73 m wheelbase, 1.475/1.46 m track, 7.50R16s, the H55F, 4.111 axles and a 1.959 low range', () => {
    expect(vehicleOrder).toContain('hj60');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.73, 3);
    expect(t.wheels[1].x - t.wheels[0].x).toBeCloseTo(1.475, 3);
    expect(t.wheels[3].x - t.wheels[2].x).toBeCloseTo(1.46, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(0.8, 2);
    expect(t.gearbox.ratios).toEqual([4.843, 2.619, 1.516, 1.0, 0.845]);
    expect([t.gearbox.finalDrive, t.ranges.low.ratio]).toEqual([4.111, 1.959]);
    // The 2H diesel six: six firings and a diesel knock, the starter as long as the sound.
    expect(engineSynthTunings.hj60.firingOrder).toHaveLength(6);
    expect(engineSynthTunings.hj60.knock).toBeDefined();
    expect(engineSynthTunings.hj60.starter.seconds).toBe(t.engine.crankSeconds);
    // 100 km/h in fifth is about 2300 rpm; its taller low range creeps faster than the Troopy's.
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeGreaterThan(2200);
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeLessThan(2400);
    const creep = (v: typeof t) => (v.engine.idleRpm / coupledRpm(v, 1, 0, 'low')) * 3.6;
    expect(creep(t)).toBeGreaterThan(creep(troopyTuning));
    expect(creep(t)).toBeLessThan(3);
  });

  it('is open from the start and is remembered in the save', () => {
    const store = new MemoryStore();
    writeSave(saveData({ vehicle: 'hj60' }), store);
    expect(loadSave(store)!.vehicle).toBe('hj60');
  });

  it('draws open wheel wells, leaf springs, a right-hand-drive cab and dials the driver can see', () => {
    const model = new VehicleModel(t, true);
    try {
      expect(model.root.name).toBe('hj60-wagon');
      expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(0);
      expect(model.instruments.wheel.parent!.position.x).toBeGreaterThan(0);
      expect(model.beams).not.toBeNull();
      expect(model.rackPlanks.children).toHaveLength(2);
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const shell = new Mesh(model.body.geometry, material);
      shell.updateMatrixWorld();
      for (const wheel of t.wheels) {
        const side = Math.sign(wheel.x);
        const ray = new Raycaster(new Vector3(side * 0.6, -0.12, wheel.z), new Vector3(side, 0, 0), 0, 0.4);
        expect(ray.intersectObject(shell)).toHaveLength(0);
      }
      const cabin = vehicles.hj60.cabin;
      for (const dial of Object.values(cabin.dials)) {
        const ray = new Raycaster(
          new Vector3(dial.x, cabin.dialY, cabin.dialZ + 0.25),
          new Vector3(0, 0, -1),
          0,
          0.3,
        );
        const hit = ray.intersectObject(shell)[0];
        expect(hit).toBeDefined();
        expect(hit.point.z).toBeLessThan(cabin.dialZ + 0.015);
        expect(hit.point.z).toBeGreaterThan(cabin.dialZ - 0.01);
        // Check from the actual seat as well: a dash lip can miss a horizontal ray
        // while hiding the upper half of the face from the driver's higher viewpoint.
        for (const dx of [-0.4, 0.4]) {
          const eye = new Vector3(cabin.eye.x, cabin.eye.y, cabin.eye.z);
          const face = new Vector3(dial.x + dx * dial.radius, cabin.dialY, cabin.dialZ);
          const sight = new Raycaster(eye, face.clone().sub(eye).normalize(), 0, eye.distanceTo(face) + 0.02);
          const seen = sight.intersectObject(shell)[0];
          expect(seen).toBeDefined();
          expect(seen.point.distanceTo(face)).toBeLessThan(0.015);
        }
      }
      material.dispose();
      for (const attribute of Object.values(model.body.geometry.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    } finally {
      model.dispose();
    }
  });

  it('idles near 650 rpm, reaches 60 km/h in 10 to 16 s, and climbs 30° in low range', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    expect(s.vehicle.drivetrain.rpm).toBeGreaterThan(600);
    expect(s.vehicle.drivetrain.rpm).toBeLessThan(700);
    let time = 0;
    while (s.vehicle.speed * 3.6 < 60 && time < 20) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    expect(time).toBeGreaterThan(10);
    expect(time).toBeLessThan(16);
    s.physics.world.free();
    const hill = await makeScene({ pitchDeg: 30, tuning: t });
    hill.vehicle.toggleRange();
    const z0 = hill.vehicle.position.z;
    hill.run(12, { throttle: 1 });
    expect(z0 - hill.vehicle.position.z).toBeGreaterThan(15);
    hill.physics.world.free();
  });

  it('stays upright through a full-lock turn at 40 km/h', async () => {
    const s = await makeScene({ speed: 40 / 3.6, tuning: t });
    let tilt = 0;
    s.run(3, (time) => {
      tilt = Math.max(tilt, s.vehicle.tiltDeg());
      return { throttle: 0.6, steer: time > 0.3 ? 1 : 0 };
    });
    expect(tilt).toBeLessThan(20);
    s.physics.world.free();
  });
});
