import { saveData } from './helpers/saves';
import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings, v8DieselSynthTuning } from '../src/data/audio';
import { lc79Tuning as t } from '../src/data/lc79';
import { patrolTuning } from '../src/data/patrol';
import { SurfaceId } from '../src/data/surfaces';
import { troopyTuning } from '../src/data/troopy';
import { type VehicleTuning } from '../src/data/vehicle';
import { vehicleOrder, vehicles, seventyCabin } from '../src/data/vehicles';
import { LC79_DRIVING_LAMPS } from '../src/render/lc79Body';
import { DIAL_START, DIAL_SWEEP } from '../src/render/vehicleInstruments';
import { VehicleModel } from '../src/render/vehicleModel';
import { loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { createCondition } from '../src/sim/vehicle/condition';
import { makeScene } from './helpers/scenes';

/** Seconds from a standstill to 60 km/h at full throttle. */
async function zeroToSixty(tuning: VehicleTuning): Promise<number> {
  const s = await makeScene({ tuning });
  s.run(1, {});
  let time = 0;
  while (s.vehicle.speed * 3.6 < 60 && time < 30) {
    s.run(0.1, { throttle: 1 });
    time += 0.1;
  }
  s.physics.world.free();
  return time;
}

describe('LC79 V8', () => {
  it('is a 79 single cab on 37s: 3.18 m wheelbase, 4.3 gears, five speeds and a 2.488 low range', () => {
    expect(vehicleOrder).toContain('lc79');
    expect(t.engine.fuel.tankLitres).toBe(130);
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(3.18, 2);
    // 37 inch tyres.
    expect(t.wheelRadius * 2).toBeCloseTo(0.94, 2);
    expect(t.gearbox.ratios).toHaveLength(5);
    expect(t.gearbox.finalDrive).toBe(4.3);
    expect(t.ranges.low.ratio).toBe(2.488);
    // Cruising at 110 km/h in fifth is under 2400 rpm; first low creeps at idle.
    expect(coupledRpm(t, 110 / 3.6, 4, 'high')).toBeLessThan(2400);
    expect((t.engine.idleRpm / coupledRpm(t, 1, 0, 'low')) * 3.6).toBeLessThan(3);
    // A V8: eight cylinders in two banks, with turbos.
    expect(engineSynthTunings.lc79).toBe(v8DieselSynthTuning);
    expect(v8DieselSynthTuning.firingOrder).toHaveLength(8);
    expect(v8DieselSynthTuning.banks?.of.filter((b) => b === 1)).toHaveLength(4);
    expect(v8DieselSynthTuning.turbo).toBeDefined();
  });

  it('idles near 680 rpm, holds still in gear, and is the quickest of them to 60 km/h', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    expect(s.vehicle.drivetrain.rpm).toBeGreaterThan(620);
    expect(s.vehicle.drivetrain.rpm).toBeLessThan(720);
    expect(Math.abs(s.vehicle.speed)).toBeLessThan(0.05);
    s.physics.world.free();
    const time = await zeroToSixty(t);
    expect(time).toBeGreaterThan(3.5);
    expect(time).toBeLessThan(6);
    for (const id of vehicleOrder.filter((v) => v !== 'lc79'))
      expect(time, id).toBeLessThan(await zeroToSixty(vehicles[id].tuning));
    expect(time).toBeLessThan((await zeroToSixty(patrolTuning)) / 2);
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

  it('wades water that drowns the Troop Carrier, through its snorkel', async () => {
    // Water 1.6 m deep everywhere: over the Troopy's wing-height intake, under the snorkel.
    const ground = { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.6 };
    expect(t.intake.y + t.wheelRadius + 0.12).toBeCloseTo(t.intakeHeight, 1);
    for (const [tuning, floods] of [
      [troopyTuning, true],
      [t, false],
    ] as const) {
      const s = await makeScene({ tuning, ground });
      s.run(12, {});
      expect(s.vehicle.condition.flood.stalled, tuning.name).toBe(floods);
      s.physics.world.free();
    }
  });

  it('draws open wheel wells, four coils, the snorkel, the driving lamps, its dials, and takes dirt and dents', async () => {
    const model = new VehicleModel(t);
    expect(model.root.name).toBe('lc79-single-cab');
    const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.updateMatrixWorld();
    for (const wheel of t.wheels) {
      const side = Math.sign(wheel.x);
      const ray = new Raycaster(new Vector3(side * 0.66, 0.2, wheel.z), new Vector3(side, 0, 0), 0, 0.5);
      expect(ray.intersectObject(shell)).toHaveLength(0);
    }
    expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(4);
    const pos = model.body.geometry.getAttribute('position');
    const near = (p: { x: number; y: number; z: number }, r: number) => {
      let n = 0;
      for (let i = 0; i < pos.count; i++)
        if (Math.hypot(pos.getX(i) - p.x, pos.getY(i) - p.y, pos.getZ(i) - p.z) < r) n++;
      return n;
    };
    expect(near(t.intake, 0.15)).toBeGreaterThan(20);
    for (const lamp of LC79_DRIVING_LAMPS) expect(near(lamp, 0.1)).toBeGreaterThan(20);
    const condition = createCondition();
    condition.dirt = { front: 1, sides: 1, rear: 1, wheels: 1 };
    condition.dents.push({ x: 0.9, y: 0.6, z: -0.3, nx: -1, ny: 0, nz: 0, radius: 0.6, depth: 0.06 });
    const colors = Float32Array.from(model.body.geometry.getAttribute('color').array);
    model.applyCondition(condition);
    expect(model.body.geometry.getAttribute('color').array).not.toEqual(colors);

    const scene = await makeScene({ speed: 5, tuning: t });
    scene.run(0.5, { steer: 1, throttle: 0.4 });
    for (let i = 0; i < 120; i++) model.update(scene.vehicle, 1, 1 / 60);
    expect(model.instruments.wheel.rotation.z).toBeLessThan(-Math.PI * 2);
    const kmh = Math.abs(scene.vehicle.speed) * 3.6;
    expect(-model.instruments.needles.speed.rotation.z).toBeCloseTo(
      DIAL_START + (DIAL_SWEEP * kmh) / vehicles.lc79.cabin.dials.speed.max,
      2,
    );
    scene.physics.world.free();
    model.dispose();
  });

  it('sits the driver in the 70 Series cab as first drawn, lifted 4 inches', () => {
    const lc = vehicles.lc79.cabin;
    expect(lc.eye.y - seventyCabin.eye.y).toBeCloseTo(0.1, 5);
    expect(lc.steeringWheel.centre.y - seventyCabin.steeringWheel.centre.y).toBeCloseTo(0.1, 5);
    expect(lc.dials).toBe(seventyCabin.dials);
  });

  it('leaves the Troop Carrier its own lower cab (v2.08): the same dials, the eye under a lower header', () => {
    const tc = vehicles.troopy.cabin;
    expect(tc.dials).toBe(seventyCabin.dials);
    expect(seventyCabin.eye.y - tc.eye.y).toBeCloseTo(0.13, 5);
    expect(tc.eye.y).toBeLessThan(1.31 - 0.1);
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeSave(saveData({ vehicle: 'lc79' }), s);
    expect(loadSave(s)!.vehicle).toBe('lc79');
  });
});
