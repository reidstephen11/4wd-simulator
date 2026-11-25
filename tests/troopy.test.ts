import { saveData } from './helpers/saves';
import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { engineSynthTunings } from '../src/data/audio';
import { hiluxTuning } from '../src/data/hilux';
import { troopyTuning as t, TROOPY_SUB_TANK, TROOPY_START_FUEL } from '../src/data/troopy';
import { vehicleTuning, type VehicleTuning } from '../src/data/vehicle';
import { vehicleLoadout, vehicleOrder, vehicles } from '../src/data/vehicles';
import { DIAL_START, DIAL_SWEEP } from '../src/render/vehicleInstruments';
import { VehicleModel } from '../src/render/vehicleModel';
import { applyCheckpoint, startCheckpoint } from '../src/sim/episode';
import { loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { createCondition } from '../src/sim/vehicle/condition';
import { makeScene } from './helpers/scenes';
import { storyLevel } from './fixtures/story';

/** Whether a vehicle parked across a side slope ends up on its side. */
async function tipsOver(tuning: VehicleTuning, rollDeg: number): Promise<boolean> {
  const s = await makeScene({ rollDeg, tuning });
  let tilt = 0;
  s.run(4, () => {
    tilt = Math.max(tilt, s.vehicle.tiltDeg());
    return {};
  });
  s.physics.world.free();
  return tilt > 80;
}

describe('Troop Carrier', () => {
  it('is a 75 Series Troop Carrier: 2.98 m wheelbase, 7.50R16s, five speeds, 4.111 axles and a 2.488 low range', () => {
    expect(vehicleOrder).toContain('troopy');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.98, 3);
    expect(t.wheelRadius * 2).toBeCloseTo(0.8, 2);
    expect(t.gearbox.ratios).toHaveLength(5);
    expect([t.gearbox.finalDrive, t.ranges.low.ratio]).toEqual([4.111, 2.488]);
    // Two factory 90 L tanks. The episode may start with less in them.
    expect(TROOPY_SUB_TANK).toBe(90);
    expect(t.engine.fuel.tankLitres).toBe(180);
    // A diesel six: its engine sound fires six cylinders and knocks.
    expect(engineSynthTunings.troopy.firingOrder).toHaveLength(6);
    expect(engineSynthTunings.troopy.knock).toBeDefined();
    expect(engineSynthTunings.troopy.starter.seconds).toBe(t.engine.crankSeconds);
    // 100 km/h in fifth is under 2500 rpm; first low creeps at a walk at idle.
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeLessThan(2500);
    const idleCreep = (t.engine.idleRpm / coupledRpm(t, 1, 0, 'low')) * 3.6;
    expect(idleCreep).toBeLessThan(2.5);
  });

  it('starts with 60 L extra, independently of its 90 L sub-tank capacity, and two spares', () => {
    const l = storyLevel.loadout;
    expect(vehicleLoadout(l, 'troopy')).toEqual({
      ...l,
      fuel: l.fuel + TROOPY_START_FUEL,
    });
    for (const id of vehicleOrder.filter((v) => v !== 'troopy')) expect(vehicleLoadout(l, id)).toEqual(l);
    const start = startCheckpoint(storyLevel, 'start', 'troopy');
    expect([start.fuel, start.spares]).toEqual([l.fuel + TROOPY_START_FUEL, 2]);
  });

  it('fills both tanks from the checkpoint; in a smaller vehicle the fuel that will not fit stays behind', async () => {
    const start = startCheckpoint(storyLevel, 'start', 'troopy');
    const s = await makeScene({ tuning: t });
    applyCheckpoint(s.vehicle, start);
    expect(s.vehicle.condition.fuel).toBe(storyLevel.loadout.fuel + TROOPY_START_FUEL);
    s.physics.world.free();
    const h = await makeScene({ tuning: hiluxTuning });
    applyCheckpoint(h.vehicle, start);
    expect(h.vehicle.condition.fuel).toBe(hiluxTuning.engine.fuel.tankLitres);
    h.physics.world.free();
  });

  it('idles near 700 rpm stopped in gear, holds still, and reaches 60 km/h in 9 to 14 s', async () => {
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
    expect(time).toBeLessThan(14);
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
    expect(z0 - hill.vehicle.position.z).toBeGreaterThan(15);
    hill.physics.world.free();
  });

  it('tips over on a gentler side slope than the others', async () => {
    expect(await tipsOver(t, 30)).toBe(false);
    expect(await tipsOver(t, 31)).toBe(true);
    for (const other of [vehicleTuning, hiluxTuning]) expect(await tipsOver(other, 31)).toBe(false);
  });

  it('draws open wheel wells, leaf springs, its own dials and four-spoke wheel, and takes dirt and dents', async () => {
    const model = new VehicleModel(t);
    expect(model.root.name).toBe('troop-carrier');
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
    condition.dents.push({ x: 0.85, y: 0.4, z: 0.6, nx: -1, ny: 0, nz: 0, radius: 0.6, depth: 0.06 });
    const colors = Float32Array.from(model.body.geometry.getAttribute('color').array);
    model.applyCondition(condition);
    expect(model.body.geometry.getAttribute('color').array).not.toEqual(colors);

    const scene = await makeScene({ speed: 5, tuning: t });
    scene.run(0.5, { steer: 1, throttle: 0.4 });
    for (let i = 0; i < 120; i++) model.update(scene.vehicle, 1, 1 / 60);
    expect(model.instruments.wheel.rotation.z).toBeLessThan(-Math.PI * 2);
    const kmh = Math.abs(scene.vehicle.speed) * 3.6;
    expect(-model.instruments.needles.speed.rotation.z).toBeCloseTo(
      DIAL_START + (DIAL_SWEEP * kmh) / vehicles.troopy.cabin.dials.speed.max,
      2,
    );
    scene.physics.world.free();
    model.dispose();
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeSave(saveData({ vehicle: 'troopy' }), s);
    expect(loadSave(s)!.vehicle).toBe('troopy');
  });
});
