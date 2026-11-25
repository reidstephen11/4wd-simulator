import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { ute40Tuning as t } from '../src/data/ute40';
import { vehicleTuning as shortie } from '../src/data/vehicle';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { VehicleModel } from '../src/render/vehicleModel';
import { TRAY_BACK, TRAY_FRONT, DECK } from '../src/render/ute40Body';
import { loadSave, writeSave } from '../src/sim/save/save';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

describe('40 Series ute', () => {
  it('is the 40 on the HJ47 chassis: 2.95 m wheelbase, the same track, tyres, engine and automatic', () => {
    expect(vehicleOrder).toContain('ute40');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.95, 3);
    expect(t.wheels[1].x - t.wheels[0].x).toBeCloseTo(shortie.wheels[1].x - shortie.wheels[0].x, 3);
    expect(t.wheelRadius).toBe(shortie.wheelRadius);
    expect(t.drawnWheels).toEqual(shortie.drawnWheels);
    expect(t.engine).toBe(shortie.engine);
    expect(t.gearbox).toBe(shortie.gearbox);
    expect(t.ranges).toBe(shortie.ranges);
    expect(engineSynthTunings.ute40).toBe(engineSynthTunings.shortie);
    expect(t.mass).toBeGreaterThan(shortie.mass);
    // The winch is on the bull bar ahead of the nose and the tow ball behind the tray.
    expect(t.winchMount.z).toBeLessThan(-2.2);
    expect(t.towPoint.z).toBeGreaterThan(TRAY_BACK);
    // The snorkel head stands above the cab roof, 1.62 m off the ground.
    expect(t.intakeHeight).toBeGreaterThan(shortie.intakeHeight);
  });

  it('is open from the start and is remembered in the save', () => {
    const store = new MemoryStore();
    writeSave(saveData({ vehicle: 'ute40' }), store);
    expect(loadSave(store)!.vehicle).toBe('ute40');
  });

  it('draws open wheel wells, leaf springs, a tray behind the cab, a right-hand-drive cab and dials the driver can see', () => {
    const model = new VehicleModel(t, true);
    try {
      expect(model.root.name).toBe('ute40-farm-ute');
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
      // The deck is there from the headboard to the tailgate, and nothing stands above the
      // cab roof line behind it but the headboard, the jack and the beacon.
      for (const z of [TRAY_FRONT + 0.3, (TRAY_FRONT + TRAY_BACK) / 2, TRAY_BACK - 0.2]) {
        const down = new Raycaster(new Vector3(-0.1, 2, z), new Vector3(0, -1, 0), 0, 3);
        const hit = down.intersectObject(shell)[0];
        expect(hit).toBeDefined();
        expect(hit.point.y).toBeGreaterThan(DECK - 0.05);
        expect(hit.point.y).toBeLessThan(DECK + 0.5);
      }
      // The planks lie on the deck and clear the inside faces of both tray walls.
      for (const plank of model.rackPlanks.children) {
        (plank as Mesh).geometry.computeBoundingBox();
        const bb = (plank as Mesh).geometry.boundingBox!;
        expect(bb.min.y).toBeGreaterThan(DECK - 0.03);
        expect(bb.min.z).toBeGreaterThan(TRAY_FRONT + 0.04);
        expect(bb.max.z).toBeLessThan(TRAY_BACK - 0.04);
      }
      const cabin = vehicles.ute40.cabin;
      expect(cabin.dialZ).toBeLessThan(vehicles.shortie.cabin.dialZ);
      for (const dial of Object.values(cabin.dials)) {
        // From between the steering wheel and the dash, looking at the dial face.
        const ray = new Raycaster(
          new Vector3(dial.x, cabin.dialY, cabin.dialZ + 0.12),
          new Vector3(0, 0, -1),
          0,
          0.2,
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

  it('idles in Drive, reaches 60 km/h in 7 to 12 s, and climbs 30° in low range', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    // The 40's petrol six, idling in Drive against the brake.
    expect(s.vehicle.drivetrain.rpm).toBeGreaterThan(600);
    expect(s.vehicle.drivetrain.rpm).toBeLessThan(900);
    let time = 0;
    while (s.vehicle.speed * 3.6 < 60 && time < 25) {
      s.run(0.1, { throttle: 1 });
      time += 0.1;
    }
    expect(time).toBeGreaterThan(7);
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
    expect(s.vehicle.position.y).toBeGreaterThan(0);
    s.physics.world.free();
  });
});
