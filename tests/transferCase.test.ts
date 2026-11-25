import { describe, expect, it, vi } from 'vitest';
import { vehicleTuning } from '../src/data/vehicle';
import { vehicles } from '../src/data/vehicles';
import { SurfaceId } from '../src/data/surfaces';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { lateAfternoon } from '../src/data/environment';
import {
  createTransferState,
  shiftTransfer,
  transferDrive,
  updateWindup,
} from '../src/sim/vehicle/transferCase';
import { applyCheckpoint, checkpointAt, EpisodeRun, startCheckpoint } from '../src/sim/episode';
import { loadSave, writeSave } from '../src/sim/save/save';
import { loadRapier } from '../src/sim/physics';
import { updateDamage } from '../src/sim/vehicle/damage';
import { Simulation } from '../src/sim/sim';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { makeScene } from './helpers/scenes';
import { MemoryStore, saveData } from './helpers/saves';
import { testWorld } from './world';

describe('transfer cases', () => {
  it('stored wind-up reduces steering and adds drag in the physics step', async () => {
    const ground = { heightAt: () => 0, surfaceAt: () => SurfaceId.Rock, waterSurfaceAt: () => null };
    const normal = await makeScene({ speed: 2, ground });
    const strained = await makeScene({ speed: 2, ground });
    try {
      strained.vehicle.transfer.windup = 1;
      const freeImpulse = vi.spyOn(normal.vehicle.body, 'applyImpulse');
      const strainedImpulse = vi.spyOn(strained.vehicle.body, 'applyImpulse');
      normal.vehicle.step({ ...emptyInput(), steer: 1 }, 1 / 60);
      strained.vehicle.step({ ...emptyInput(), steer: 1 }, 1 / 60);
      expect(Math.abs(strained.vehicle.wheels[0].steer)).toBeLessThan(
        Math.abs(normal.vehicle.wheels[0].steer),
      );
      expect(Math.abs(strainedImpulse.mock.calls.at(-1)![0].z)).toBeGreaterThan(
        Math.abs(freeImpulse.mock.calls.at(-1)![0].z),
      );
    } finally {
      normal.physics.world.free();
      strained.physics.world.free();
    }
  });

  it('tyre scrub from strain adds wear through the damage system, with damage-off respected', async () => {
    const s = await makeScene({});
    try {
      const v = s.vehicle;
      v.transfer.windup = 1;
      v.speed = 2;
      for (const w of v.wheels) {
        w.contact = true;
        w.surface = SurfaceId.Wood;
        w.steer = 0.4;
        w.spin = 0;
      }
      updateDamage(v, 'off', 1);
      expect(v.condition.abrasion[0]).toBe(0);
      updateDamage(v, 'realistic', 1);
      expect(v.condition.abrasion[0]).toBeGreaterThan(0);
      expect(v.condition.tyreFault[0]).toBe('none');
    } finally {
      s.physics.world.free();
    }
  });

  it('cycles part-time drive and requires a stop for either low-range shift', () => {
    const s = createTransferState();
    expect(shiftTransfer(vehicleTuning, s, 1)).toBe(false);
    expect(s.mode).toBe('4H');
    expect(shiftTransfer(vehicleTuning, s, 0)).toBe(true);
    expect(s.mode).toBe('4L');
    expect(shiftTransfer(vehicleTuning, s, -1)).toBe(false);
    shiftTransfer(vehicleTuning, s, 0);
    expect(s.mode).toBe('2H');
    expect(shiftTransfer(vehicleTuning, s, 21 / 3.6)).toBe(false);
    expect(shiftTransfer(vehicleTuning, s, 20 / 3.6)).toBe(true);
    expect(s.mode).toBe('4H');
  });

  it('requires manual hubs, while the 79 engages its hubs automatically', () => {
    const s = { ...createTransferState(), mode: '2H' as const, hubsLocked: false };
    expect(shiftTransfer(vehicleTuning, s, 0)).toBe(false);
    expect(transferDrive(vehicleTuning, s, 1000, 5000, 5000)).toEqual([0, 1000]);
    expect(shiftTransfer(vehicles.lc79.tuning, s, 2)).toBe(true);
    expect(s.hubsLocked).toBe(true);
    expect(s.mode).toBe('4H');
  });

  it('keeps every full-time vehicle in four-wheel drive and gives the centre lock a purpose', () => {
    for (const { tuning: t } of Object.values(vehicles)) {
      if (t.transfer !== 'fullTime') continue;
      const s = createTransferState();
      shiftTransfer(t, s, 0);
      expect(s.mode).toBe('4L');
      shiftTransfer(t, s, 0);
      expect(s.mode).toBe('4H');
      s.centreLocked = false;
      expect(transferDrive(t, s, 1000, 0, 5000)).toEqual([0, 0]);
      expect(transferDrive(t, s, -1000, 100, 5000)).toEqual([-100, -100]);
      s.centreLocked = true;
      expect(transferDrive(t, s, 1000, 0, 5000)).toEqual([500, 500]);
    }
  });

  it('actually disconnects the front wheels in 2H, including wheelspin', async () => {
    const s = await makeScene({});
    try {
      const v = s.vehicle;
      v.toggleRange();
      v.toggleRange();
      expect(v.transfer.mode).toBe('2H');
      s.run(0.3, { throttle: 1 });
      expect(v.controller.wheelEngineForce(0)).toBe(0);
      expect(v.controller.wheelEngineForce(1)).toBe(0);
      expect(v.controller.wheelEngineForce(2)).toBeGreaterThan(0);
      expect(v.wheels[0].spin).toBe(0);
      expect(v.wheels[1].spin).toBe(0);
    } finally {
      s.physics.world.free();
    }
  });

  it('winds up only when coupled and turning on firm ground, and releases on loose ground or 2H', () => {
    const s = createTransferState();
    const firm = Array.from({ length: 4 }, () => ({
      contact: true,
      load: 1000,
      surface: SurfaceId.Rock as SurfaceId,
    }));
    updateWindup(vehicleTuning, s, firm, 0, 1, 10);
    expect(s.windup).toBe(0);
    updateWindup(vehicleTuning, s, firm, 2, 0, 10);
    expect(s.windup).toBe(0);
    updateWindup(vehicleTuning, s, firm, 2, 1, 10);
    expect(s.windup).toBeCloseTo(0.8);
    updateWindup(
      vehicleTuning,
      s,
      firm.map((w) => ({ ...w, surface: SurfaceId.Gravel })),
      2,
      1,
      3,
    );
    expect(s.windup).toBe(0);
    s.mode = '2H';
    updateWindup(vehicleTuning, s, firm, 2, 1, 10);
    expect(s.windup).toBe(0);
    s.mode = '4H';
    s.centreLocked = false;
    updateWindup(vehicles.rangie.tuning, s, firm, 2, 1, 10);
    expect(s.windup).toBe(0);
  });

  it('locks the centre only while stopped and releases stored strain when unlocked', async () => {
    const s = await makeScene({ tuning: vehicles.rangie.tuning });
    try {
      s.vehicle.transfer.windup = 1;
      expect(s.vehicle.toggleCentre()).toBe(true);
      expect(s.vehicle.transfer.windup).toBe(0);
      s.vehicle.speed = 2;
      expect(s.vehicle.toggleCentre()).toBe(false);
      s.vehicle.speed = 0;
      expect(s.vehicle.toggleCentre()).toBe(true);
    } finally {
      s.physics.world.free();
    }
  });

  it('restores the camp controls through a save, ignores malformed data and defaults old saves', async () => {
    const s = await makeScene({});
    try {
      const v = s.vehicle;
      v.toggleRange();
      v.toggleRange();
      v.transfer.hubsLocked = false;
      const run = new EpisodeRun(ironbarkLevel, startCheckpoint(ironbarkLevel, 'start', 'shortie'), true);
      const camp = checkpointAt('start', run, v, []);
      const store = new MemoryStore();
      writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint: camp } } }), store);
      const restored = loadSave(store)!.episodes.ironbark!.checkpoint!;
      Object.assign(v.transfer, createTransferState());
      applyCheckpoint(v, restored);
      expect(v.transfer.mode).toBe('2H');
      expect(v.transfer.hubsLocked).toBe(false);
      writeSave(
        saveData({
          episodes: {
            ironbark: {
              completed: false,
              checkpoint: { ...camp, transfer: { ...camp.transfer!, mode: 'bad' as never } },
            },
          },
        }),
        store,
      );
      expect(loadSave(store)!.episodes.ironbark!.checkpoint!.transfer).toBeUndefined();
      applyCheckpoint(v, { ...camp, transfer: undefined });
      expect(v.transfer).toEqual(createTransferState());
      expect(v.drivetrain.range).toBe('high');
    } finally {
      s.physics.world.free();
    }
  });

  it('works the hubs for twenty seconds with drive input held out and prevents overlapping jobs', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    try {
      const v = sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite));
      const inputs = new Map([['p', emptyInput()]]);
      for (let n = 0; n < 60; n++) sim.step(inputs, 1 / 60);
      expect(sim.startHubs('p')).toBe(false);
      v.toggleRange();
      v.toggleRange();
      expect(sim.startHubs('p')).toBe(true);
      expect(sim.startHubs('p')).toBe(false);
      inputs.set('p', { ...emptyInput(), throttle: 1, toggleRange: true });
      for (let n = 0; n < 1190; n++) sim.step(inputs, 1 / 60);
      expect(v.transfer.hubsLocked).toBe(true);
      expect(v.transfer.mode).toBe('2H');
      expect(v.throttle).toBe(0);
      inputs.set('p', emptyInput());
      for (let n = 0; n < 20; n++) sim.step(inputs, 1 / 60);
      expect(v.transfer.hubsLocked).toBe(false);
      expect(sim.toolsOf('p').repair).toBeNull();
    } finally {
      sim.physics.world.free();
    }
  });
});
