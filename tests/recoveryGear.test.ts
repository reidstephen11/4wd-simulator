import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { SurfaceId } from '../src/data/surfaces';
import { applyCheckpoint, checkpointAt, EpisodeRun, startCheckpoint } from '../src/sim/episode';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { loadSave, writeSave } from '../src/sim/save/save';
import { Simulation } from '../src/sim/sim';
import { Winch } from '../src/sim/tools/winch';
import { createCondition, tyreGripMultiplier } from '../src/sim/vehicle/condition';
import { pressurePsi, setPressure, wheelPsi } from '../src/sim/vehicle/tyrePressure';
import { makeScene } from './helpers/scenes';
import { MemoryStore, saveData } from './helpers/saves';
import { testWorld } from './world';

const dt = 1 / 60;
const stopped = new Map([['p', { ...emptyInput(), handbrake: true }]]);
function run(sim: Simulation, seconds: number): void {
  for (let n = 0; n < Math.ceil(seconds / dt); n++) sim.step(stopped, dt);
}
async function setup() {
  const sim = new Simulation(await loadRapier(), testWorld(), lateAfternoon);
  const v = sim.addVehicle('p', sim.campsitePose(sim.world.map.spawnCampsite));
  run(sim, 1);
  return { sim, v };
}

describe('psi and recovery gear', () => {
  it('interpolates grip while preserving the former road/trail endpoints and puncture loss', () => {
    const c = createCondition();
    expect(pressurePsi(c)).toBe(36);
    const road = tyreGripMultiplier(c, 0);
    c.lowPressure = true;
    const trail = tyreGripMultiplier(c, 0);
    setPressure(c, 24);
    expect(tyreGripMultiplier(c, 0)).toBeGreaterThan(road);
    expect(tyreGripMultiplier(c, 0)).toBeLessThan(trail);
    c.tyres[0] = 0.5;
    c.tyreFault[0] = 'puncture';
    expect(wheelPsi(c, 0)).toBe(12);
    setPressure(c, 36);
    expect(wheelPsi(c, 0)).toBe(18);
    expect(c.tyreFault[0]).toBe('puncture');
    expect(c.tyres[0]).toBe(0.5);
  });

  it('times deflation and inflation, holds drive input out, and never repairs a tyre with the compressor', async () => {
    const { sim, v } = await setup();
    try {
      expect(sim.startPressure('p', 0)).toBe(false);
      expect(sim.startPressure('p', NaN)).toBe(false);
      expect(sim.startPressure('p', 36)).toBe(false);
      expect(sim.startPressure('p', 18)).toBe(true);
      expect(sim.startPressure('p', 24)).toBe(false);
      const driving = new Map([['p', { ...emptyInput(), throttle: 1 }]]);
      for (let n = 0; n < 660; n++) sim.step(driving, dt);
      expect(v.throttle).toBe(0);
      expect(pressurePsi(v.condition)).toBe(36);
      run(sim, 1.1);
      expect(pressurePsi(v.condition)).toBe(18);
      v.condition.tyres[0] = 0;
      v.condition.tyreTarget[0] = 0;
      v.condition.tyreFault[0] = 'sidewall';
      expect(sim.startPump('p')).toBe(true);
      run(sim, 59);
      expect(pressurePsi(v.condition)).toBe(18);
      run(sim, 1.1);
      expect(pressurePsi(v.condition)).toBe(36);
      expect(wheelPsi(v.condition, 0)).toBe(0);
      expect(v.condition.tyreFault[0]).toBe('sidewall');
      v.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
      expect(sim.startPressure('p', 18)).toBe(false);
    } finally {
      sim.physics.free();
    }
  });

  it('saves pressure at camp and defaults missing or invalid old-save values to road pressure', async () => {
    const s = await makeScene({});
    try {
      const start = startCheckpoint(ironbarkLevel, 'start', 'shortie');
      setPressure(s.vehicle.condition, 24);
      const checkpoint = checkpointAt(start.camp, new EpisodeRun(ironbarkLevel, start, true), s.vehicle, []);
      const store = new MemoryStore();
      writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint } } }), store);
      const saved = loadSave(store)!.episodes.ironbark!.checkpoint!;
      setPressure(s.vehicle.condition, 18);
      applyCheckpoint(s.vehicle, saved);
      expect(pressurePsi(s.vehicle.condition)).toBe(24);
      for (const psi of [undefined, -4, 400, NaN]) {
        checkpoint.tyrePressurePsi = psi;
        writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint } } }), store);
        applyCheckpoint(s.vehicle, loadSave(store)!.episodes.ironbark!.checkpoint!);
        expect(pressurePsi(s.vehicle.condition)).toBe(36);
      }
    } finally {
      s.physics.free();
    }
  });

  it('doubles capped pull with both rope ends, pays the same rope speed and rejects overlong double lines', async () => {
    const s = await makeScene({});
    try {
      const v = s.vehicle;
      const m = v.localToWorld(v.tuning.winchMount.x, v.tuning.winchMount.y, v.tuning.winchMount.z);
      const anchor = {
        kind: 'tree' as const,
        id: 'test',
        point: { ...m, z: m.z - 10 },
        radius: 0.3,
        label: 'Tree',
      };
      const single = new Winch();
      const double = new Winch();
      double.doubleLine = true;
      expect(single.attach(v, anchor)).toBe(true);
      expect(double.attach(v, anchor)).toBe(true);
      expect(double.treeProtector).toBe(true);
      expect(double.length).toBeGreaterThan(single.length * 1.9);
      const before = double.length;
      double.step(v, true, false, dt);
      expect(before - double.length).toBeCloseTo(dt);
      // Same stationary geometry, stretched enough to reach the force caps.
      single.length = 1.2;
      double.length = 2.4;
      v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      single.step(v, false, false, dt);
      double.step(v, false, false, dt);
      expect(double.tension).toBeCloseTo(2 * single.tension);
      double.detach();
      expect(double.attach(v, { ...anchor, point: { ...m, z: m.z - 20 } })).toBe(false);
      expect(double.attach(v, { ...anchor, kind: 'vehicle' })).toBe(false);
      expect(double.attached).toBe(false);
    } finally {
      s.physics.free();
    }
  });

  it('selects the stranded vehicle’s rear recovery point from behind and still completes a rescue', async () => {
    const { sim, v } = await setup();
    try {
      const p = v.position;
      const stuck = sim.addStuckVehicle({
        id: 'rear-test',
        name: 'Bogged ute',
        x: p.x,
        z: p.z - 10,
        headingDeg: 0,
        sink: 0.2,
        freeAfter: 0.5,
        breakout: 100,
        drag: 2000,
      });
      const anchor = sim.findAnchors('p').find((a) => a.recoveryId === 'rear-test')!;
      expect(anchor.label).toContain('rear recovery point');
      expect(anchor.local!.z).toBeGreaterThan(0);
      sim.attachTo('p', anchor);
      const input = new Map([['p', { ...emptyInput(), winchIn: true }]]);
      for (let n = 0; n < 600; n++) sim.step(input, dt);
      expect(stuck.freed).toBe(true);
      expect(sim.toolsOf('p').winch.attached).toBe(false);
    } finally {
      sim.physics.free();
    }
  });

  it('moves a double-line vehicle about half as far for the same reeling time', async () => {
    const advance = async (doubleLine: boolean) => {
      const s = await makeScene({});
      try {
        const w = new Winch();
        w.doubleLine = doubleLine;
        const m = s.vehicle.localToWorld(0, 0, s.vehicle.tuning.winchMount.z);
        w.attach(s.vehicle, {
          kind: 'rock',
          id: 'fixed',
          label: 'Rock',
          radius: 0.1,
          point: { ...m, z: m.z - 12 },
        });
        const before = w.distance();
        s.vehicle.freeRoll = true;
        s.beforeStep = (dt) => w.step(s.vehicle, true, false, dt);
        s.run(8, {});
        return before - w.distance();
      } finally {
        s.physics.free();
      }
    };
    const single = await advance(false);
    const double = await advance(true);
    expect(single).toBeGreaterThan(5);
    expect(double).toBeGreaterThan(single * 0.4);
    expect(double).toBeLessThan(single * 0.65);
  });

  it('makes shovelling a stopped job in loose ground, loses its benefit to wheelspin and clears it on teleport', async () => {
    const { sim, v } = await setup();
    try {
      expect(sim.startDig('p')).toBe(false);
      v.wheels.forEach((w) => {
        w.surface = SurfaceId.Mud;
        w.contact = true;
        w.water = 0;
      });
      expect(sim.startDig('p')).toBe(true);
      expect(sim.startDig('p')).toBe(false);
      run(sim, 19);
      expect(v.dugGround).toBeNull();
      run(sim, 1.1);
      expect(v.dugGround?.relief).toBe(1);
      v.wheels.forEach((w) => {
        w.spin = 1;
      });
      v.step({ ...emptyInput(), handbrake: true }, dt);
      expect(v.dugGround!.relief).toBeLessThan(1);
      v.teleport(sim.campsitePose(sim.world.map.spawnCampsite));
      expect(v.dugGround).toBeNull();
      v.wheels.forEach((w) => {
        w.surface = SurfaceId.Mud;
        w.water = 1;
      });
      expect(sim.startDig('p')).toBe(false);
    } finally {
      sim.physics.free();
    }
  });

  it('actually reduces wheel sink in cleared mud without changing untouched ground', async () => {
    const ground = { heightAt: () => 0, surfaceAt: () => SurfaceId.Mud, waterSurfaceAt: () => null };
    const normal = await makeScene({ ground });
    const dug = await makeScene({ ground });
    try {
      dug.vehicle.dugGround = { x: dug.vehicle.position.x, z: dug.vehicle.position.z, relief: 1 };
      normal.run(5, { handbrake: true });
      dug.run(5, { handbrake: true });
      const sink = (s: typeof normal) => s.vehicle.wheels.reduce((sum, w) => sum + w.sink, 0);
      expect(sink(dug)).toBeLessThan(sink(normal) * 0.6);
      const p = dug.vehicle.position;
      dug.vehicle.body.setTranslation({ ...p, x: p.x + 4 }, true);
      dug.run(0.1, {});
      expect(dug.vehicle.dugGround).toBeNull();
    } finally {
      normal.physics.free();
      dug.physics.free();
    }
  });
});
