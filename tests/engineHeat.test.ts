import { describe, expect, it } from 'vitest';
import { updateDamage } from '../src/sim/vehicle/damage';
import type { DamageMode } from '../src/data/damage';
import { damageTuning } from '../src/data/damage';
import { createCondition, enginePowerMultiplier, tyreGripMultiplier } from '../src/sim/vehicle/condition';
import { vehicleTuning } from '../src/data/vehicle';
import type { Vehicle } from '../src/sim/vehicle/vehicle';

const redline = vehicleTuning.engine.redlineRpm;

type HeatOpts = {
  throttle: number;
  rpm: number;
  range: 'high' | 'low';
  speed: number;
  spin?: number;
  water?: number;
  submerged?: boolean;
  running?: boolean;
};

/** Just enough of a vehicle for the engine-heat part of updateDamage. */
function fake(opts: HeatOpts) {
  const { throttle, rpm, range, speed, spin = 0, water = 0, submerged = false, running = true } = opts;
  const condition = createCondition();
  condition.flood.submerged = submerged;
  return {
    condition,
    throttle,
    speed,
    tuning: vehicleTuning,
    drivetrain: { engineRunning: running, rpm, range },
    wheels: Array.from({ length: 4 }, () => ({ contact: true, surface: 0, spin, water })),
    wheelLandings: [0, 0, 0, 0],
    wheelStrikes: [0, 0, 0, 0],
    lastImpact: 0,
    lastImpactDir: { x: 0, y: 0, z: 0 },
    bodyContact: { knock: 0 },
    body: { rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }), angvel: () => ({ x: 0, y: 0, z: 0 }) },
    rand: () => 1,
    physics: { ground: {} },
    tiltDeg: () => 0,
    floodEvent: null,
  } as unknown as Vehicle;
}

function run(v: Vehicle, seconds: number, mode: DamageMode = 'realistic') {
  const events = [];
  for (let t = 0; t < seconds; t += 0.1) events.push(...updateDamage(v, mode, 0.1));
  return events;
}

function secondsTo(v: Vehicle, threshold: number, limit = 400) {
  for (let t = 0; t < limit; t += 0.1) {
    updateDamage(v, 'realistic', 0.1);
    if (v.condition.engineHeat >= threshold) return t + 0.1;
  }
  return Infinity;
}

describe('engine heat', () => {
  it('boils fastest when bogged: wheels spinning at full revs with little ground speed', () => {
    const v = fake({ throttle: 1, rpm: redline, range: 'low', speed: 0.4, spin: 1 });
    const events = run(v, 180);
    expect(v.condition.engineHeat).toBeGreaterThan(1);
    expect(v.condition.engine).toBeLessThan(1);
    expect(events.some((e) => e.cause === 'overheat')).toBe(true);
  });

  it('stays at normal cruising in high range', () => {
    const v = fake({ throttle: 0.4, rpm: 2200, range: 'high', speed: 20 });
    run(v, 300);
    expect(v.condition.engineHeat).toBeCloseTo(0.5, 2);
    expect(v.condition.engine).toBe(1);
  });

  it('warns on a low-range climb and loses power once boiling', () => {
    const v = fake({ throttle: 1, rpm: 4000, range: 'low', speed: 6 });
    const warnAt = secondsTo(v, damageTuning.engine.heatWarn);
    expect(warnAt).toBeGreaterThan(50);
    expect(warnAt).toBeLessThan(120);
    run(v, 90);
    expect(v.condition.engineHeat).toBeGreaterThan(1);
    v.condition.engine = 1;
    expect(enginePowerMultiplier(v.condition)).toBeLessThan(0.95);
  });

  it('does not boil at part throttle in low range even after several minutes', () => {
    const v = fake({ throttle: 0.6, rpm: 2400, range: 'low', speed: 3 });
    run(v, 300);
    expect(v.condition.engineHeat).toBeLessThan(damageTuning.engine.heatWarn);
  });

  it('stays under the warning on a gentle low-range crawl', () => {
    const v = fake({ throttle: 0.3, rpm: 1200, range: 'low', speed: 1 });
    run(v, 300);
    expect(v.condition.engineHeat).toBeLessThan(damageTuning.engine.heatWarn);
  });

  it('cools more slowly than it heats', () => {
    const v = fake({ throttle: 1, rpm: redline, range: 'low', speed: 1 });
    run(v, 70);
    const hot = v.condition.engineHeat - 0.5;
    v.throttle = 0;
    run(v, 70);
    expect(hot - (v.condition.engineHeat - 0.5)).toBeLessThan(hot / 2);
  });

  it('still heats and warns with damage off, without hurting the engine', () => {
    const v = fake({ throttle: 1, rpm: redline, range: 'low', speed: 0.4, spin: 1 });
    const events = run(v, 180, 'off');
    expect(v.condition.engineHeat).toBeGreaterThan(1);
    expect(v.condition.engine).toBe(1);
    expect(events.map((e) => e.cause)).toEqual(['overheat']);
  });

  it('heats with load: more throttle and revs run hotter than a light pedal at low revs', () => {
    const hard = fake({ throttle: 1, rpm: redline, range: 'low', speed: 1 });
    const light = fake({ throttle: 0.3, rpm: 1200, range: 'low', speed: 1 });
    run(hard, 60);
    run(light, 60);
    expect(hard.condition.engineHeat).toBeGreaterThan(light.condition.engineHeat + 0.15);
  });

  it('cools more with airflow as speed rises', () => {
    const crawl = fake({ throttle: 1, rpm: redline, range: 'high', speed: 1 });
    const cruise = fake({ throttle: 1, rpm: redline, range: 'high', speed: 20 });
    run(crawl, 90);
    run(cruise, 90);
    expect(cruise.condition.engineHeat).toBeLessThan(0.75);
    expect(crawl.condition.engineHeat).toBeGreaterThan(cruise.condition.engineHeat + 0.2);
  });

  it('cools in water, more when the wheels are deeper', () => {
    const dry = fake({ throttle: 1, rpm: redline, range: 'low', speed: 1, water: 0 });
    const splash = fake({ throttle: 1, rpm: redline, range: 'low', speed: 1, water: 0.08 });
    const axle = fake({ throttle: 1, rpm: redline, range: 'low', speed: 1, water: 0.3 });
    const hub = fake({ throttle: 1, rpm: redline, range: 'low', speed: 1, water: 0.5 });
    for (const v of [dry, splash, axle, hub]) run(v, 90);
    expect(dry.condition.engineHeat).toBeGreaterThan(splash.condition.engineHeat);
    expect(splash.condition.engineHeat).toBeGreaterThan(axle.condition.engineHeat);
    expect(axle.condition.engineHeat).toBeGreaterThan(hub.condition.engineHeat);
    expect(hub.condition.engineHeat).toBeLessThan(damageTuning.engine.heatWarn);
  });

  it('cools faster in water once already hot', () => {
    const dry = fake({ throttle: 0, rpm: 800, range: 'high', speed: 0 });
    const wet = fake({ throttle: 0, rpm: 800, range: 'high', speed: 0, water: 0.3, submerged: true });
    dry.condition.engineHeat = 1.1;
    wet.condition.engineHeat = 1.1;
    run(dry, 80);
    run(wet, 80);
    expect(wet.condition.engineHeat).toBeLessThan(dry.condition.engineHeat - 0.15);
  });

  it('heats faster bogged than the same revs with grip at speed', () => {
    const bogged = fake({ throttle: 1, rpm: redline, range: 'low', speed: 0.4, spin: 1 });
    const moving = fake({ throttle: 1, rpm: redline, range: 'low', speed: 8, spin: 0 });
    const bogWarn = secondsTo(bogged, damageTuning.engine.heatWarn);
    const moveWarn = secondsTo(moving, damageTuning.engine.heatWarn);
    expect(bogWarn).toBeGreaterThan(20);
    expect(bogWarn).toBeLessThan(45);
    expect(moveWarn).toBeGreaterThan(bogWarn + 20);
  });
});

describe('tyre pressure', () => {
  it('gives more grip let down', () => {
    const c = createCondition();
    const normal = tyreGripMultiplier(c, 0);
    c.lowPressure = true;
    expect(tyreGripMultiplier(c, 0)).toBeGreaterThan(normal);
  });
});

describe('overheat damage with the engine off (v1.19)', () => {
  it('does not charge a boiling engine that has been switched off', () => {
    const v = fake({ throttle: 0, rpm: 0, range: 'high', speed: 0, running: false });
    v.condition.engineHeat = 1.2;
    run(v, 90);
    expect(v.condition.engine).toBe(1);
    expect(v.condition.engineHeat).toBeLessThan(1.2);
  });

  it('still charges one that is running', () => {
    const v = fake({ throttle: 0, rpm: 800, range: 'high', speed: 0 });
    v.condition.engineHeat = 1.2;
    run(v, 10);
    expect(v.condition.engine).toBeLessThan(1);
  });
});
