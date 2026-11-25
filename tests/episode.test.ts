import { describe, expect, it } from 'vitest';
import { damageTuning } from '../src/data/damage';
import { clockTime, episodeOrder, episodes } from '../src/data/episodes';
import { SurfaceId, sweptTuning } from '../src/data/surfaces';
import { perentieTuning } from '../src/data/perentie';
import { vehicleTuning } from '../src/data/vehicle';
import { applyCheckpoint, checkpointAt, EpisodeRun, failure, startCheckpoint } from '../src/sim/episode';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { updateDamage } from '../src/sim/vehicle/damage';
import type { PoiDef } from '../src/sim/world/mapTypes';
import { lateAfternoon } from '../src/data/environment';
import { makeScene } from './helpers/scenes';
import { storyLevel } from './fixtures/story';
import { testWorld } from './world';

const goal: PoiDef = { id: 'goal', name: 'Goal', kind: 'campsite', x: 0, z: -500, radius: 20 };

describe('episodes', () => {
  it('run in order, each with a mission and a fixed load', () => {
    expect(episodeOrder).toEqual(['ironbark']);
    for (const id of episodeOrder) {
      const e = episodes[id];
      expect(e.number).toBe(episodeOrder.indexOf(id) + 1);
      expect(e.mission.length).toBeGreaterThan(10);
      expect(e.briefing.length).toBeGreaterThan(0);
      expect(e.loadout.fuel).toBeGreaterThan(0);
      expect(Object.keys(e.failures).sort()).toEqual(['engine', 'fuel', 'swept', 'time', 'tyre']);
    }
    expect(clockTime(12.5)).toBe('12:30 pm');
    expect(clockTime(18.25)).toBe('6:15 pm');
    expect(clockTime(9.05)).toBe('9:03 am');
  });

  it('keeps time while driving, and ends at the deadline unless replaying with the clock stopped', async () => {
    const s = await makeScene({});
    const run = new EpisodeRun(storyLevel, startCheckpoint(storyLevel, 'start', 'shortie'), true);
    // An hour of real driving passes clockRate hours of the afternoon.
    run.tick(3600 / storyLevel.clockRate);
    expect(run.hour).toBeCloseTo(storyLevel.startHour + 1, 5);
    expect(run.check(s.vehicle, 'mild', goal)).toBeNull();
    // Dark doesn't end it: the run goes on until the grace in the dark runs out.
    run.hour = storyLevel.deadline!.hour;
    expect(run.check(s.vehicle, 'mild', goal)).toBeNull();
    run.hour = storyLevel.deadline!.hour + storyLevel.deadline!.graceHours!;
    expect(run.check(s.vehicle, 'mild', goal)).toBe('failed');
    expect(run.reason).toBe('time');
    // Once ended, nothing changes until it restarts from a camp.
    run.tick(100);
    expect(run.check(s.vehicle, 'mild', goal)).toBeNull();
    run.restart({ ...startCheckpoint(storyLevel, 'start', 'shortie'), hour: 15, elapsed: 600 });
    expect([run.status, run.hour, run.elapsed]).toEqual(['driving', 15, 600]);

    const replay = new EpisodeRun(storyLevel, startCheckpoint(storyLevel, 'start', 'shortie'), false);
    replay.tick(10_000);
    expect(replay.hour).toBe(storyLevel.startHour);
    expect(replay.hoursLeft()).toBe(Infinity);
    s.physics.world.free();
  });

  it('is complete on reaching the goal', async () => {
    const s = await makeScene({});
    const run = new EpisodeRun(storyLevel, startCheckpoint(storyLevel, 'start', 'shortie'), true);
    const p = s.vehicle.body.translation();
    expect(run.check(s.vehicle, 'realistic', { ...goal, x: p.x + 5, z: p.z })).toBe('complete');
    expect(run.status).toBe('complete');
    s.physics.world.free();
  });

  it('ends when the tank is dry with no cans left, the current takes the car, a tyre can’t be fixed or the engine is wrecked', async () => {
    const s = await makeScene({});
    const v = s.vehicle;
    const c = v.condition;
    c.jerryCans = 1;
    c.fuel = 0;
    // A can left to pour in: not over yet.
    expect(failure(v, 'off', 1)).toBeNull();
    c.jerryCans = 0;
    expect(failure(v, 'off', 1)).toBe('fuel');
    c.fuel = 20;
    // Flat tyres and wrecked engines only end it with realistic damage.
    c.tyres[2] = 0;
    c.tyreFault[2] = 'sidewall';
    c.spares = 0;
    expect(failure(v, 'mild', 1)).toBeNull();
    expect(failure(v, 'realistic', 1)).toBe('tyre');
    c.spares = 1;
    expect(failure(v, 'realistic', 1)).toBeNull();
    // A puncture with no spare can still take a plug.
    c.spares = 0;
    c.tyreFault[2] = 'puncture';
    c.plugs = 1;
    expect(failure(v, 'realistic', 1)).toBeNull();
    c.plugs = 0;
    expect(failure(v, 'realistic', 1)).toBe('tyre');
    c.tyres[2] = 1;
    c.engine = 0;
    expect(failure(v, 'realistic', 1)).toBe('engine');
    expect(failure(v, 'mild', 0)).toBe('time');
    // Carried off by the current: with mild or realistic damage, not with damage off.
    c.engine = 1;
    v.swept = sweptTuning.seconds - 0.1;
    expect(failure(v, 'mild', 1)).toBeNull();
    v.swept = sweptTuning.seconds;
    expect(failure(v, 'off', 1)).toBeNull();
    expect(failure(v, 'mild', 1)).toBe('swept');
    expect(failure(v, 'realistic', 1)).toBe('swept');
    s.physics.world.free();
  });

  it('snapshots the load at a camp and puts it back on restarting', async () => {
    const s = await makeScene({});
    const v = s.vehicle;
    const run = new EpisodeRun(storyLevel, startCheckpoint(storyLevel, 'start', 'shortie'), true);
    applyCheckpoint(v, startCheckpoint(storyLevel, 'start', 'shortie'));
    const l = storyLevel.loadout;
    expect([v.condition.fuel, v.condition.jerryCans, v.condition.spares, v.condition.plugs]).toEqual([
      l.fuel,
      l.jerryCans,
      l.spares,
      l.plugs,
    ]);
    v.condition.fuel = 22.5;
    v.condition.tyres[1] = 0;
    v.condition.tyreFault[1] = 'sidewall';
    run.hour = 15.5;
    const cp = checkpointAt('first-camp', run, v, ['the-climb']);
    expect(cp).toMatchObject({ camp: 'first-camp', hour: 15.5, fuel: 22.5, discovered: ['the-climb'] });
    v.condition.fuel = 1;
    v.condition.engine = 0.2;
    applyCheckpoint(v, cp);
    expect([v.condition.fuel, v.condition.engine, v.condition.tyres[1], v.condition.tyreFault[1]]).toEqual([
      22.5,
      1,
      0,
      'sidewall',
    ]);
    s.physics.world.free();
  });
});

describe('fuel', () => {
  it('burns in proportion to the work the engine does, more for petrol than diesel', async () => {
    const litresPerHour = async (tuning = vehicleTuning, throttle = 0) => {
      const s = await makeScene({ tuning });
      let used = 0;
      s.afterStep = (dt) => (used += s.vehicle.drivetrain.fuelRate * dt);
      s.run(10, { throttle });
      s.physics.world.free();
      return (used / 10) * 3600;
    };
    const idle = await litresPerHour();
    const flatOut = await litresPerHour(vehicleTuning, 1);
    // A big petrol six idles on a litre or two an hour and burns far more working hard.
    expect(idle).toBeGreaterThan(0.6);
    expect(idle).toBeLessThan(3);
    expect(flatOut).toBeGreaterThan(idle * 8);
    expect(await litresPerHour(perentieTuning, 1)).toBeLessThan(flatOut);
  });

  it('with the tank empty the accelerator turns nothing: no wheelspin or tyre wear', async () => {
    for (const surface of [SurfaceId.Mud, SurfaceId.Gravel, SurfaceId.Rock]) {
      const s = await makeScene({ ground: { surfaceAt: () => surface, waterSurfaceAt: () => null } });
      const v = s.vehicle;
      s.afterStep = (dt) => void updateDamage(v, 'realistic', dt);
      v.condition.fuel = 0;
      s.run(0.5, {});
      expect(v.drivetrain.engineRunning).toBe(false);
      let spin = 0;
      s.run(4, () => {
        spin = Math.max(spin, ...v.wheels.map((w) => w.spin));
        return { throttle: 1 };
      });
      expect(spin, `surface ${surface}`).toBe(0);
      expect(Math.abs(v.speed)).toBeLessThan(0.05);
      expect(v.condition.abrasion.every((a) => a === 0)).toBe(true);
      s.physics.world.free();
    }
  });

  it('runs the engine dry, and a jerry can pours in 20 L and restarts it', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const v = sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite), vehicleTuning);
    const events: string[] = [];
    sim.events.on('engine', ({ event }) => events.push(event));
    // Driving, or with the foot on the brake.
    const run = (seconds: number, throttle = 0) => {
      const input = { ...emptyInput(), throttle, brake: throttle > 0 ? 0 : 1 };
      for (let t = 0; t < seconds; t += 1 / 60) sim.step(new Map([['p', input]]), 1 / 60);
    };
    run(1);
    // With no scale (free driving) the tank never empties.
    const full = v.condition.fuel;
    run(2, 0.5);
    expect(v.condition.fuel).toBe(full);
    sim.fuelScale = 50;
    v.condition.fuel = 0.05;
    v.condition.jerryCans = 1;
    run(3, 0.6);
    expect(v.condition.fuel).toBe(0);
    expect(events).toContain('outOfFuel');
    expect(v.drivetrain.engineRunning).toBe(false);
    run(3);
    expect(sim.refuelOption('p')).toEqual({ kind: 'refuel', possible: true });
    expect(sim.startRepair('p', true)).toBe(true);
    run(damageTuning.repair.refuelSeconds + 0.2);
    expect(v.condition.jerryCans).toBe(0);
    expect(v.condition.fuel).toBeGreaterThan(19.5);
    run(vehicleTuning.engine.crankSeconds + 0.5);
    expect(v.drivetrain.engineRunning).toBe(true);
    expect(sim.refuelOption('p')).toBeNull();
    sim.physics.free();
  });

  it('applies the episode multiplier to real engine use exactly once', async () => {
    const sim = new Simulation(await loadRapier(), testWorld(), lateAfternoon);
    const v = sim.addVehicle('p', sim.campsitePose(sim.world.map.spawnCampsite), vehicleTuning);
    try {
      for (const scale of [1, 8.5]) {
        sim.fuelScale = scale;
        v.condition.fuel = 10;
        let realLitres = 0;
        const inputs = new Map([['p', { ...emptyInput(), throttle: 0.5, brake: 1 }]]);
        for (let i = 0; i < 120; i++) {
          sim.step(inputs, 1 / 60);
          realLitres += v.drivetrain.fuelRate / 60;
        }
        expect(realLitres).toBeGreaterThan(0);
        expect(10 - v.condition.fuel).toBeCloseTo(realLitres * scale, 8);
      }
    } finally {
      sim.physics.free();
    }
  });
});

describe('tyres', () => {
  it('a hard landing on rock punctures; harder still tears the sidewall, which goes down fast', async () => {
    const rock = { surfaceAt: () => SurfaceId.Rock, waterSurfaceAt: () => null };
    const landing = async (height: number) => {
      const s = await makeScene({ ground: rock });
      s.afterStep = (dt) => void updateDamage(s.vehicle, 'realistic', dt);
      const p = s.vehicle.body.translation();
      s.vehicle.teleport({ x: p.x, y: p.y + height, z: p.z, headingDeg: 0 });
      s.run(3, {});
      const c = s.vehicle.condition;
      const result = { faults: [...c.tyreFault], tyres: [...c.tyres] };
      s.physics.world.free();
      return result;
    };
    const small = await landing(1.5);
    expect(small.faults).toContain('puncture');
    expect(small.faults).not.toContain('sidewall');
    // A puncture leaks slowly: still well up after 3 s.
    expect(Math.min(...small.tyres)).toBeGreaterThan(0.8);
    const big = await landing(2.6);
    expect(big.faults).toContain('sidewall');
    expect(Math.min(...big.tyres)).toBeLessThan(Math.min(...small.tyres) - 0.25);
  });

  it('spinning hard on rock wears through the tread; crawling over it doesn’t', async () => {
    const s = await makeScene({});
    const v = s.vehicle;
    const w = v.wheels[0];
    const spin = (amount: number, seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        w.contact = true;
        w.surface = SurfaceId.Rock;
        w.spin = amount;
        updateDamage(v, 'realistic', 1 / 60);
      }
    };
    spin(0.3, 30);
    expect(v.condition.tyreFault[0]).toBe('none');
    spin(1, damageTuning.tyre.abrasionSeconds + 0.5);
    expect(v.condition.tyreFault[0]).toBe('puncture');
    s.physics.world.free();
  });
});

describe('driving on in the dark', () => {
  it('keeps a run going past dark until 8 pm, when its time in the dark runs out', () => {
    const run = new EpisodeRun(storyLevel, { hour: 18.5, elapsed: 0 }, true);
    expect(run.hoursLeft()).toBeLessThan(0);
    expect(run.hoursToFail()).toBeCloseTo(1.5);
    run.hour = 20.01;
    expect(run.hoursToFail()).toBeLessThan(0);
  });
});
