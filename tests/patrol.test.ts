import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { patrolTuning as t } from '../src/data/patrol';
import { perentieTuning } from '../src/data/perentie';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { DIAL_START, DIAL_SWEEP } from '../src/render/vehicleInstruments';
import { VehicleModel } from '../src/render/vehicleModel';
import { defaultSettings, loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { createCondition } from '../src/sim/vehicle/condition';
import { makeScene } from './helpers/scenes';

describe('GQ Patrol', () => {
  it('is geared like a TD42 wagon: 4.11 axles, five speeds and a 2.02 low range on 31s', () => {
    expect(vehicleOrder).toEqual(['shortie', 'camel', 'perentie', 'patrol']);
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.97, 2);
    expect(Math.abs(t.wheels[0].x - t.wheels[1].x)).toBeCloseTo(1.555, 2);
    expect(t.wheelRadius * 2).toBeCloseTo(0.787, 2);
    expect(t.gearbox.ratios).toHaveLength(5);
    // Cruising at 125 km/h in fifth is under 3000 rpm; first low creeps at idle.
    expect(coupledRpm(t, 125 / 3.6, 4, 'high')).toBeLessThan(3000);
    const idleCreep = (t.engine.idleRpm / coupledRpm(t, 1, 0, 'low')) * 3.6;
    expect(idleCreep).toBeLessThan(3);
    // Heavier and longer than the Land Rover.
    expect(t.mass).toBeGreaterThan(perentieTuning.mass);
    expect(Math.abs(t.wheels[0].z)).toBeGreaterThan(Math.abs(perentieTuning.wheels[0].z));
  });

  it('idles near 650 rpm stopped in gear, holds still, and reaches 60 km/h in 9 to 13 s', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    const v = s.vehicle;
    expect(v.drivetrain.rpm).toBeGreaterThan(590);
    expect(v.drivetrain.rpm).toBeLessThan(680);
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

  it('wades water that would drown the short-wheelbase 4WD, through its snorkel', async () => {
    // Water 1.5 m deep everywhere: over the wing-height intake, under the snorkel head.
    const ground = { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.5 };
    expect(t.intake.y + t.wheelRadius + 0.12).toBeCloseTo(t.intakeHeight, 1);
    for (const [tuning, floods] of [
      [vehicleTuning, true],
      [t, false],
    ] as const) {
      const s = await makeScene({ tuning, ground });
      s.run(12, {});
      expect(s.vehicle.condition.flood.stalled, tuning.name).toBe(floods);
      s.physics.world.free();
    }
  });

  it('draws open wheel wells, coil springs, the snorkel, its own dials, and takes dirt and dents', async () => {
    const model = new VehicleModel(t);
    expect(model.root.name).toBe('gq-patrol');
    const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.updateMatrixWorld();
    for (const wheel of t.wheels) {
      const side = Math.sign(wheel.x);
      const ray = new Raycaster(new Vector3(side * 0.66, 0.2, wheel.z), new Vector3(side, 0, 0), 0, 0.4);
      expect(ray.intersectObject(shell)).toHaveLength(0);
    }
    expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(4);
    const pos = model.body.geometry.getAttribute('position');
    let nearIntake = 0;
    for (let i = 0; i < pos.count; i++)
      if (Math.hypot(pos.getX(i) - t.intake.x, pos.getY(i) - t.intake.y, pos.getZ(i) - t.intake.z) < 0.15)
        nearIntake++;
    expect(nearIntake).toBeGreaterThan(20);
    const condition = createCondition();
    condition.dirt = { front: 1, sides: 1, rear: 1, wheels: 1 };
    condition.dents.push({ x: 0.9, y: 0.4, z: -0.3, nx: -1, ny: 0, nz: 0, radius: 0.6, depth: 0.06 });
    const colors = Float32Array.from(model.body.geometry.getAttribute('color').array);
    model.applyCondition(condition);
    expect(model.body.geometry.getAttribute('color').array).not.toEqual(colors);

    const scene = await makeScene({ speed: 5, tuning: t });
    scene.run(0.5, { steer: 1, throttle: 0.4 });
    for (let i = 0; i < 120; i++) model.update(scene.vehicle, 1, 1 / 60);
    expect(model.instruments.wheel.rotation.z).toBeLessThan(-Math.PI * 2);
    const kmh = Math.abs(scene.vehicle.speed) * 3.6;
    expect(-model.instruments.needles.speed.rotation.z).toBeCloseTo(
      DIAL_START + (DIAL_SWEEP * kmh) / vehicles.patrol.cabin.dials.speed.max,
      2,
    );
    scene.physics.world.free();
    model.dispose();
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const exploration = { discovered: [], lastCampsite: 'river-flat-camp' };
    writeSave({ version: 1, exploration, settings: defaultSettings, vehicle: 'patrol' }, s);
    expect(loadSave(s)!.vehicle).toBe('patrol');
  });
});
