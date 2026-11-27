import { describe, expect, it } from 'vitest';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { hj60Tuning } from '../src/data/hj60';
import { mqTuning as t } from '../src/data/mq';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { TAIL, buildMqWheel } from '../src/render/mqBody';
import { MQ_SPARE } from '../src/render/mqGear';
import { VehicleModel } from '../src/render/vehicleModel';
import { loadSave, writeSave } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

describe('MQ Patrol hardtop', () => {
  it('is an MQ short wheelbase: 2.35 m wheelbase, 1.40 m track, 7.50R16s, the four-speed, 4.375 axles and a 2.0 low range', () => {
    expect(vehicleOrder).toContain('mq');
    expect(vehicleOrder.indexOf('mq')).toBe(vehicleOrder.indexOf('patrol') - 1);
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.35, 3);
    expect(t.wheels[1].x - t.wheels[0].x).toBeCloseTo(1.4, 3);
    expect(t.wheels[3].x - t.wheels[2].x).toBeCloseTo(1.4, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(0.8, 2);
    expect(t.gearbox.ratios).toEqual([3.592, 2.246, 1.415, 1.0]);
    expect([t.gearbox.finalDrive, t.ranges.low.ratio]).toEqual([4.375, 2.0]);
    // The SD33 diesel six: six firings and a diesel knock, the starter as long as the sound.
    expect(engineSynthTunings.mq.firingOrder).toHaveLength(6);
    expect(engineSynthTunings.mq.knock).toBeDefined();
    expect(engineSynthTunings.mq.starter.seconds).toBe(t.engine.crankSeconds);
    // 100 km/h in fourth is about 2900 rpm on the 4.375 axles; its shorter first gear is
    // offset by the 2.0 low range, so it creeps a little faster than the 60 Series.
    expect(coupledRpm(t, 100 / 3.6, 3, 'high')).toBeGreaterThan(2800);
    expect(coupledRpm(t, 100 / 3.6, 3, 'high')).toBeLessThan(3000);
    const creep = (v: typeof t) => (v.engine.idleRpm / coupledRpm(v, 1, 0, 'low')) * 3.6;
    expect(creep(t)).toBeGreaterThan(creep(hj60Tuning));
    expect(creep(t)).toBeLessThan(3.5);
  });

  it('is open from the start and is remembered in the save', () => {
    const store = new MemoryStore();
    writeSave(saveData({ vehicle: 'mq' }), store);
    expect(loadSave(store)!.vehicle).toBe('mq');
  });

  it('draws open wheel wells, leaf springs, a right-hand-drive cab and dials the driver can see', () => {
    const model = new VehicleModel(t, true);
    try {
      expect(model.root.name).toBe('mq-patrol-hardtop');
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
      const cabin = vehicles.mq.cabin;
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

  it('hangs the door spare on its carrier with its axle backwards, every part of it clear of the rear door', () => {
    expect(MQ_SPARE.z).toBeCloseTo(TAIL + 0.27, 6);
    // The wheel's full width along its axle, hub caps and nuts included, turned as the
    // carrier turns it: the inner face stays at least 0.1 m off the door skin.
    const wheel = buildMqWheel(t).rotateY(-Math.PI / 2);
    const box = new Box3().setFromBufferAttribute(wheel.getAttribute('position') as never);
    wheel.dispose();
    expect(box.max.x - box.min.x).toBeGreaterThan(2 * t.wheelRadius * 0.95);
    expect(box.max.z - box.min.z).toBeLessThan(0.32);
    expect(MQ_SPARE.z + box.min.z).toBeGreaterThan(TAIL + 0.1);
    // Seen from behind, across the wheel's disc nothing lies in the door panel's core (its
    // bevels and the rear glass fill the rest of TAIL - 0.05 to TAIL) or in the load space
    // for half a metre in front of it.
    const model = new VehicleModel(t, true);
    try {
      const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
      shell.updateMatrixWorld();
      const r = t.wheelRadius;
      for (let dx = -r; dx <= r; dx += 0.05)
        for (let dy = -r; dy <= r; dy += 0.05) {
          if (dx * dx + dy * dy > r * r) continue;
          const ray = new Raycaster(
            new Vector3(MQ_SPARE.x + dx, MQ_SPARE.y + dy, TAIL + 1),
            new Vector3(0, 0, -1),
            0,
            1.2,
          );
          const inside = ray
            .intersectObject(shell)
            .map((h) => h.point.z)
            .filter((z) => (z < TAIL - 0.021 && z > TAIL - 0.029) || (z < TAIL - 0.051 && z > TAIL - 0.5));
          expect(inside).toEqual([]);
        }
    } finally {
      model.dispose();
    }
  });

  it('idles near 650 rpm, reaches 60 km/h in 10 to 18 s, and climbs 30° in low range', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    expect(s.vehicle.drivetrain.rpm).toBeGreaterThan(600);
    expect(s.vehicle.drivetrain.rpm).toBeLessThan(700);
    let time = 0;
    while (s.vehicle.speed * 3.6 < 60 && time < 24) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    // 11.0 s since the engines were given a little more at the top (Over the Cape v2.29); slower before.
    expect(time).toBeGreaterThan(10);
    expect(time).toBeLessThan(18);
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
