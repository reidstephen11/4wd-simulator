import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { rangieTuning as t } from '../src/data/rangie';
import { hj60Tuning } from '../src/data/hj60';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { VehicleModel } from '../src/render/vehicleModel';
import { loadSave, writeSave } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

describe('Range Rover two-door', () => {
  it('is an early two-door: 2.54 m wheelbase, 1.486 m track, 205 R16s, the LT77, 3.54 axles and a 3.32 low range', () => {
    expect(vehicleOrder).toContain('rangie');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.54, 3);
    expect(t.wheels[1].x - t.wheels[0].x).toBeCloseTo(1.486, 3);
    expect(t.wheels[3].x - t.wheels[2].x).toBeCloseTo(1.486, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(0.75, 2);
    expect(t.gearbox.ratios).toEqual([3.65, 2.18, 1.44, 1.0, 0.79]);
    expect([t.gearbox.finalDrive, t.ranges.low.ratio]).toEqual([3.54, 3.32]);
    expect(t.engine.fuel.tankLitres).toBe(86);
    // The Rover V8: eight firings in two banks, no diesel knock, the starter as long as the sound.
    expect(engineSynthTunings.rangie.firingOrder).toHaveLength(8);
    expect(engineSynthTunings.rangie.banks?.of).toHaveLength(8);
    expect(engineSynthTunings.rangie.knock).toBeUndefined();
    expect(engineSynthTunings.rangie.starter.seconds).toBe(t.engine.crankSeconds);
    // 100 km/h in fifth is about 2350 rpm; its 3.32 low range creeps slower than the 60's 1.959.
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeGreaterThan(2250);
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeLessThan(2450);
    const creep = (v: typeof t) => (v.engine.idleRpm / coupledRpm(v, 1, 0, 'low')) * 3.6;
    expect(creep(t)).toBeLessThan(creep(hj60Tuning));
    expect(creep(t)).toBeGreaterThan(1.5);
  });

  it('is open from the start and is remembered in the save', () => {
    const store = new MemoryStore();
    writeSave(saveData({ vehicle: 'rangie' }), store);
    expect(loadSave(store)!.vehicle).toBe('rangie');
  });

  it('draws open wheel wells, coil springs, a right-hand-drive cab and dials the driver can see', () => {
    const model = new VehicleModel(t, true);
    try {
      expect(model.root.name).toBe('range-rover-two-door');
      expect(
        model.suspension.group.children.filter((c) => c.name.startsWith('coil-')).length,
      ).toBeGreaterThan(0);
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
      const cabin = vehicles.rangie.cabin;
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
      }
      material.dispose();
      for (const attribute of Object.values(model.body.geometry.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    } finally {
      model.dispose();
    }
  });

  it('idles near 750 rpm, reaches 60 km/h in 6 to 12 s, and climbs 30° in low range', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    expect(s.vehicle.drivetrain.rpm).toBeGreaterThan(700);
    expect(s.vehicle.drivetrain.rpm).toBeLessThan(800);
    let time = 0;
    while (s.vehicle.speed * 3.6 < 60 && time < 20) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    expect(time).toBeGreaterThan(6);
    expect(time).toBeLessThan(12);
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
