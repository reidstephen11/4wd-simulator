import { saveData } from './helpers/saves';
import { Color, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { camelTuning } from '../src/data/camel';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { VehicleModel } from '../src/render/vehicleModel';
import { loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { makeScene } from './helpers/scenes';

describe('Camel Trophy Land Rover 90', () => {
  it('is a short coil-sprung Ninety with a diesel, a five-speed and the wheel on the left', () => {
    const { id, name, wheels, intake, intakeHeight, gearbox, engine } = camelTuning;
    expect([id, name]).toEqual(['camel', 'Camel Trophy Land Rover 90']);
    expect(vehicleOrder).toContain('camel');
    // 2.36 m wheelbase and about 1.49 m track.
    expect(Math.max(...wheels.map((w) => w.z)) - Math.min(...wheels.map((w) => w.z))).toBeCloseTo(2.36, 2);
    expect(Math.max(...wheels.map((w) => w.x)) * 2).toBeCloseTo(1.486, 2);
    expect(gearbox.ratios).toHaveLength(5);
    // A slow diesel: 4600 rpm since v2.29 let every engine rev a tenth further (4200 before).
    expect(engine.redlineRpm).toBe(4600);
    // Left-hand drive: the driver, the wheel and the dials sit left of centre.
    const cabin = vehicles.camel.cabin;
    expect(cabin.eye.x).toBeLessThan(0);
    expect(cabin.steeringWheel.centre.x).toBeLessThan(0);
    expect(cabin.dials.speed.x).toBeLessThan(0);
    // The snorkel head is about 2 m off the ground, beside the left windscreen pillar.
    expect(intakeHeight).toBeGreaterThan(1.9);
    expect(intake.y + camelTuning.wheelRadius + 0.12).toBeCloseTo(intakeHeight, 1);
    expect(intake.x).toBeLessThan(-0.8);
  });

  it('wades water that would drown the plain short-wheelbase 4WD', async () => {
    // Water 1.5 m deep everywhere: over the wing-height intake, under the snorkel head.
    const ground = { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.5 };
    for (const [tuning, floods] of [
      [vehicleTuning, true],
      [camelTuning, false],
    ] as const) {
      const s = await makeScene({ tuning, ground });
      s.run(12, {});
      expect(s.vehicle.condition.flood.stalled, tuning.name).toBe(floods);
      s.physics.world.free();
    }
  });

  it('is drawn in Sandglow yellow with black trim and the snorkel at its air intake', () => {
    const model = new VehicleModel(camelTuning);
    const plain = new VehicleModel(vehicleTuning);
    expect(model.root.name).toBe('camel-trophy-land-rover-90');
    const geometry = model.body.geometry;
    const pos = geometry.getAttribute('position'),
      col = geometry.getAttribute('color');
    expect(pos.count).toBeGreaterThan(plain.body.geometry.getAttribute('position').count);
    let yellow = 0,
      ink = 0,
      nearIntake = 0;
    const t = camelTuning.intake;
    const sandglow = new Color('#C7973F'),
      trim = new Color('#242824');
    for (let i = 0; i < pos.count; i++) {
      const [r, g, b] = [col.getX(i), col.getY(i), col.getZ(i)];
      if (Math.hypot(r - sandglow.r, g - sandglow.g, b - sandglow.b) < 0.03) yellow++;
      if (Math.hypot(r - trim.r, g - trim.g, b - trim.b) < 0.02) ink++;
      if (Math.hypot(pos.getX(i) - t.x, pos.getY(i) - t.y, pos.getZ(i) - t.z) < 0.1) nearIntake++;
    }
    expect(yellow).toBeGreaterThan(5000);
    expect(ink).toBeGreaterThan(1000);
    expect(nearIntake).toBeGreaterThan(20);
    // The rear corners must remain closed between the lamp stacks and upper quarters.
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const shell = new Mesh(geometry, material);
    shell.updateMatrixWorld();
    for (const side of [-1, 1])
      for (const y of [0.53, 0.68, 0.75]) {
        const ray = new Raycaster(new Vector3(side * 0.78, y, 2), new Vector3(0, 0, -1), 0, 0.3);
        const hit = ray.intersectObject(shell)[0];
        expect(hit).toBeDefined();
        expect(hit.point.z).toBeGreaterThan(1.77);
      }
    material.dispose();
    model.dispose();
    plain.dispose();
  });

  it('sits on its wheels as the drawing of the 90 has it, with the cab stepped in at the waist', () => {
    // Sheet B of reference/vehicles/land-rover-110-perentie/drawing-variants.png: the wing's
    // front is 0.50 m ahead of the front axle and the tail 0.64 m behind the rear one (November 2026 review;
    // the body was 0.12 m further forward). Measured on the Sandglow panels only.
    const model = new VehicleModel(camelTuning);
    const pos = model.body.geometry.getAttribute('position'),
      col = model.body.geometry.getAttribute('color');
    const sandglow = new Color('#C7973F');
    let nose = 0,
      tail = 0,
      cab = 0,
      body = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(col.getX(i) - sandglow.r, col.getY(i) - sandglow.g, col.getZ(i) - sandglow.b) > 0.03)
        continue;
      nose = Math.min(nose, pos.getZ(i));
      // The tail is the corner panels: the door spare's rim is Sandglow too, and stands behind them.
      if (Math.abs(pos.getX(i)) > 0.6) tail = Math.max(tail, pos.getZ(i));
      if (pos.getY(i) > 0.9) cab = Math.max(cab, Math.abs(pos.getX(i)));
      else body = Math.max(body, Math.abs(pos.getX(i)));
    }
    const front = Math.min(...camelTuning.wheels.map((w) => w.z)),
      rear = Math.max(...camelTuning.wheels.map((w) => w.z));
    expect(front - nose).toBeGreaterThan(0.48);
    expect(front - nose).toBeLessThan(0.53);
    expect(tail - rear).toBeGreaterThan(0.62);
    expect(tail - rear).toBeLessThan(0.7);
    // The body is about 1.67 m across its sides (hinges a little more); the cab about 1.53 m.
    expect(body).toBeGreaterThan(0.83);
    expect(cab).toBeLessThan(0.8);
    model.dispose();
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeSave(saveData({ vehicle: 'camel' }), s);
    expect(loadSave(s)!.vehicle).toBe('camel');
  });
});
