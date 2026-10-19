import { describe, expect, it } from 'vitest';
import { damageTuning, type DamageMode } from '../src/data/damage';
import { lateAfternoon } from '../src/data/environment';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { perentieTuning } from '../src/data/perentie';
import { defaultSettings, loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { Groups, groups, loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { enginePowerMultiplier, tyreGripMultiplier } from '../src/sim/vehicle/condition';
import { updateDamage, type DamageEvent } from '../src/sim/vehicle/damage';
import { headingOf } from '../src/sim/vehicle/math';
import { makeScene, type Scene } from './helpers/scenes';
import { testWorld } from './world';

const rock = { surfaceAt: () => SurfaceId.Rock, waterSurfaceAt: () => null };

/** A scene that applies damage after every step, as the simulation does. */
async function damageScene(mode: DamageMode, opts: Parameters<typeof makeScene>[0] = {}) {
  const s = await makeScene(opts);
  const events: DamageEvent[] = [];
  s.afterStep = (dt) => events.push(...updateDamage(s.vehicle, mode, dt));
  return { s, events };
}

/** Lift the car `height` metres and let it fall flat onto the ground. */
function drop(s: Scene, height: number): void {
  const p = s.vehicle.body.translation();
  s.vehicle.teleport({ x: p.x, y: p.y + height, z: p.z, headingDeg: 0 });
  s.run(3, {});
}

describe('mechanical damage', () => {
  it('does nothing with damage off, however hard the knock', async () => {
    const { s, events } = await damageScene('off', { ground: rock, tuning: vehicleTuning });
    drop(s, 2);
    const c = s.vehicle.condition;
    expect(events).toEqual([]);
    expect([c.engine, ...c.tyres, ...c.suspension]).toEqual(Array(9).fill(1));
    s.physics.world.free();
  });

  it('cuts tyres landing hard on rock and bends the suspension; mild leaves them soft, not flat', async () => {
    const { s, events } = await damageScene('mild', { ground: rock });
    drop(s, 2.4);
    const c = s.vehicle.condition;
    expect(events.filter((e) => e.part === 'tyre').length).toBeGreaterThan(0);
    expect(events.filter((e) => e.part === 'suspension').length).toBeGreaterThan(0);
    s.run(damageTuning.tyre.deflateSeconds.mild, {});
    for (let i = 0; i < 4; i++) {
      expect(c.tyres[i]).toBeGreaterThanOrEqual(damageTuning.tyre.floor.mild);
      expect(c.suspension[i]).toBeGreaterThanOrEqual(damageTuning.suspension.floor.mild);
    }
    expect(Math.min(...c.tyres)).toBe(damageTuning.tyre.floor.mild);
    expect(tyreGripMultiplier(c, 0)).toBeLessThan(1);
    s.physics.world.free();
  });

  it('does not cut tyres on dirt, or on rock at a crawl', async () => {
    const dirt = await damageScene('realistic');
    drop(dirt.s, 0.5);
    expect(dirt.events.filter((e) => e.part === 'tyre')).toEqual([]);
    dirt.s.physics.world.free();
    const { s, events } = await damageScene('realistic', { ground: rock });
    drop(s, 0.15);
    s.run(4, { throttle: 0.4 });
    expect(events).toEqual([]);
    s.physics.world.free();
  });

  it('lets a realistic tyre go flat: that corner sits lower and drags the car towards it', async () => {
    const flatAt = async (wheel: number | null) => {
      const s = await makeScene({ tuning: vehicleTuning });
      if (wheel !== null) s.vehicle.condition.tyres[wheel] = 0;
      s.run(2, {});
      const roll = s.vehicle.body.rotation();
      // Drive straight for 6 s at part throttle with no steering.
      s.run(6, { throttle: 0.5 });
      const f = s.vehicle.forward();
      const r = { x: roll.x, z: roll.z };
      s.physics.world.free();
      return { heading: headingOf(f.x, f.z), r };
    };
    const straight = await flatAt(null);
    // Wheel 0 is the front left.
    expect(vehicleTuning.wheels[0].front && vehicleTuning.wheels[0].x < 0).toBe(true);
    const flat = await flatAt(0);
    const turn = (h: number) => ((h - straight.heading + 540) % 360) - 180;
    // Heading is a compass bearing: turning left lowers it.
    expect(turn(flat.heading)).toBeLessThan(-2);
    expect(Math.abs(turn(straight.heading))).toBeLessThan(0.5);
  });

  it('pulls towards a bent front corner', async () => {
    const heading = async (bent: boolean) => {
      const s = await makeScene({ tuning: perentieTuning });
      if (bent) s.vehicle.condition.suspension[1] = 0.3;
      s.run(6, { throttle: 0.5 });
      const f = s.vehicle.forward();
      s.physics.world.free();
      return headingOf(f.x, f.z);
    };
    expect(perentieTuning.wheels[1].front && perentieTuning.wheels[1].x > 0).toBe(true);
    const turn = (((await heading(true)) - (await heading(false)) + 540) % 360) - 180;
    expect(turn).toBeGreaterThan(3);
  });

  it('hurts the engine in a crash on the nose; mild keeps it running, realistic can wreck it', async () => {
    for (const mode of ['mild', 'realistic'] as const) {
      const { s, events } = await damageScene(mode, { tuning: vehicleTuning });
      const R = await loadRapier();
      s.physics.world.createCollider(
        R.ColliderDesc.cuboid(6, 2, 0.5)
          .setTranslation(0, 1, -12)
          .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
      );
      // Into the wall at about 50 km/h.
      const f = s.vehicle.forward();
      s.vehicle.body.setLinvel({ x: f.x * 14, y: 0, z: f.z * 14 }, true);
      s.run(2, {});
      const c = s.vehicle.condition;
      expect(
        events.some((e) => e.part === 'engine' && e.cause === 'crash'),
        mode,
      ).toBe(true);
      expect(c.engine, mode).toBeLessThan(0.8);
      expect(c.engine, mode).toBeGreaterThanOrEqual(damageTuning.engine.floor[mode]);
      if (mode === 'mild') expect(enginePowerMultiplier(c)).toBeGreaterThanOrEqual(0.7);
      s.physics.world.free();
    }
    const { s } = await damageScene('realistic');
    s.vehicle.condition.engine = 0;
    s.vehicle.startEngine();
    s.run(3, { throttle: 1 });
    expect(s.vehicle.drivetrain.engineRunning).toBe(false);
    expect(Math.abs(s.vehicle.speed)).toBeLessThan(0.2);
    s.physics.world.free();
  });

  it('repairs: a field repair in mild, the one spare in realistic, everything at camp', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    const v = sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite));
    const inputs = new Map([['p', emptyInput()]]);
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) sim.step(inputs, 1 / 60);
    };
    const repaired: string[] = [];
    sim.events.on('repaired', ({ kind }) => repaired.push(kind));
    run(1);
    expect(sim.repairOption('p')).toBeNull();

    sim.setDamage('mild');
    const c = v.condition;
    c.engine = 0.6;
    c.suspension[2] = 0.7;
    c.tyreTarget[1] = 0.5;
    expect(sim.repairOption('p')).toEqual({ kind: 'field', possible: true });
    expect(sim.startRepair('p')).toBe(true);
    run(damageTuning.repair.fieldSeconds - 1);
    expect(c.engine).toBe(0.6);
    run(1.5);
    expect([c.engine, c.suspension[2], c.tyreTarget[1]]).toEqual([1, 1, 1]);

    sim.setDamage('realistic');
    c.tyres[3] = c.tyreTarget[3] = 0;
    c.engine = 0.4;
    expect(sim.repairOption('p')).toEqual({ kind: 'spare', possible: true });
    sim.startRepair('p');
    run(damageTuning.repair.spareSeconds + 0.5);
    expect([c.tyres[3], c.spare, c.engine]).toEqual([1, false, 0.4]);
    c.tyreTarget[0] = 0;
    expect(sim.repairOption('p')).toMatchObject({ kind: 'spare', possible: false });
    expect(sim.startRepair('p')).toBe(false);

    sim.returnToCampsite('p', world.map.spawnCampsite);
    expect([c.engine, c.tyreTarget[0], c.spare]).toEqual([1, 1, true]);
    expect(repaired).toEqual(['field', 'spare', 'camp']);

    // Turning damage off puts everything right; mild lifts realistic damage to its limits.
    c.engine = 0;
    c.tyres[2] = 0;
    sim.setDamage('mild');
    expect([c.engine, c.tyres[2]]).toEqual([damageTuning.engine.floor.mild, damageTuning.tyre.floor.mild]);
    sim.setDamage('off');
    expect([c.engine, c.tyres[2]]).toEqual([1, 1]);
    expect(sim.serialize().vehicles[0].health.engine).toBe(1);
    sim.physics.free();
  });

  it('is a setting, remembered in the save, and mild for older saves', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, val) => void data.set(k, val),
    };
    const exploration = { discovered: [], lastCampsite: '' };
    expect(defaultSettings.damage).toBe('mild');
    writeSave({ version: 1, exploration, settings: { ...defaultSettings, damage: 'realistic' } }, s);
    expect(loadSave(s)!.settings.damage).toBe('realistic');
    const [key] = [...data.keys()];
    data.set(key, JSON.stringify({ version: 1, exploration, settings: { quality: 'high' } }));
    expect(loadSave(s)!.settings.damage).toBe('mild');
  });
});
