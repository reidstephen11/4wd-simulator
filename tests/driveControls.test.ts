import { describe, expect, it, vi } from 'vitest';
import { vehicleTuning } from '../src/data/vehicle';
import { axleDriveCapacity } from '../src/sim/vehicle/differential';
import { InputManager } from '../src/sim/input/inputManager';
import { makeScene } from './helpers/scenes';

const DT = 1 / 60;

describe('diff locks and precision crawl', () => {
  it('a locked axle uses the grounded tyre without exceeding available grip', () => {
    expect(axleDriveCapacity(0, 6000, false, 0.35)).toBe(2100);
    expect(axleDriveCapacity(0, 6000, true, 0.35)).toBe(6000);
    expect(axleDriveCapacity(2500, 6000, true, 0.35)).toBe(8500);
    expect(axleDriveCapacity(0, 0, true, 0.35)).toBe(0);
  });

  it('locks independently, refuses fast engagement, and always permits unlocking', async () => {
    const s = await makeScene({});
    try {
      s.run(DT, { toggleFrontDiff: true });
      expect(s.vehicle.differentials).toEqual({ front: true, rear: false });
      s.run(DT, { toggleRearDiff: true });
      expect(s.vehicle.differentials).toEqual({ front: true, rear: true });
      s.vehicle.body.setLinvel({ x: 0, y: 0, z: -3 }, true);
      expect(s.vehicle.toggleDiff('front')).toBe(true);
      expect(s.vehicle.toggleDiff('front')).toBe(false);
      expect(s.vehicle.differentials).toEqual({ front: false, rear: true });
      s.vehicle.body.setLinvel({ x: 0, y: 0, z: 3 }, true);
      expect(s.vehicle.toggleDiff('front')).toBe(false);
      expect(s.vehicle.toggleDiff('rear')).toBe(true);
    } finally {
      s.physics.free();
    }
  });

  it('locking both axles recovers a climb with diagonally lifted wheels', async () => {
    const climb = async (locked: boolean) => {
      const s = await makeScene({ pitchDeg: 25, tuning: structuredClone(vehicleTuning) });
      try {
        // Isolate traction from tipping: two diagonal suspension mounts are beyond droop.
        s.vehicle.body.lockRotations(true, true);
        s.vehicle.tuning.wheels[0].y += 1;
        s.vehicle.tuning.wheels[3].y += 1;
        s.vehicle.toggleRange();
        if (locked) {
          s.vehicle.toggleDiff('front');
          s.vehicle.toggleDiff('rear');
        }
        const y0 = s.vehicle.position.y;
        s.run(8, { throttle: 1 });
        expect(s.vehicle.wheels[0].contact).toBe(false);
        expect(s.vehicle.wheels[3].contact).toBe(false);
        if (locked) {
          const rotations = s.vehicle.wheels.map((w) => w.rotation);
          s.run(DT, { throttle: 1 });
          expect(s.vehicle.wheels[0].rotation - rotations[0]).toBeCloseTo(
            s.vehicle.wheels[1].rotation - rotations[1],
            5,
          );
          expect(s.vehicle.wheels[2].rotation - rotations[2]).toBeCloseTo(
            s.vehicle.wheels[3].rotation - rotations[3],
            5,
          );
        }
        return s.vehicle.position.y - y0;
      } finally {
        s.physics.free();
      }
    };
    expect(await climb(false)).toBeLessThan(1);
    expect(await climb(true)).toBeGreaterThan(4);
  });

  it('front lock reduces steering angle and unlocking restores it', async () => {
    const s = await makeScene({});
    try {
      s.run(DT, { steer: 1 });
      const open = s.vehicle.wheels[1].steer;
      s.run(DT, { steer: 1, toggleFrontDiff: true });
      expect(s.vehicle.wheels[1].steer).toBeLessThan(open * 0.8);
      s.run(DT, { steer: 1, toggleFrontDiff: true });
      expect(s.vehicle.wheels[1].steer).toBeCloseTo(open, 2);
    } finally {
      s.physics.free();
    }
  });

  for (const reverse of [false, true])
    it(`holds walking pace ${reverse ? 'in reverse' : 'forwards'} and still gives full driver braking`, async () => {
      const s = await makeScene({});
      try {
        s.vehicle.toggleRange();
        s.run(DT, { togglePrecision: true });
        s.run(10, reverse ? { brake: 1 } : { throttle: 1 });
        const speed = s.vehicle.speed * (reverse ? -1 : 1);
        const limit = (reverse ? vehicleTuning.crawling.reverseKmh : vehicleTuning.crawling.forwardKmh) / 3.6;
        expect(speed).toBeGreaterThan(limit * 0.7);
        expect(speed).toBeLessThan(limit * 1.1);
        s.vehicle.body.setLinvel({ x: 0, y: 0, z: -2 }, true);
        s.run(DT, { brake: 1 });
        expect(s.vehicle.brake).toBe(1);
        s.run(DT, { togglePrecision: true });
        expect(s.vehicle.precisionCrawl).toBe(false);
      } finally {
        s.physics.free();
      }
    });

  it('precision crawl controls a downhill descent while throttle is held', async () => {
    const s = await makeScene({ pitchDeg: -20 });
    try {
      s.vehicle.toggleRange();
      s.run(DT, { togglePrecision: true });
      s.run(8, { throttle: 1 });
      expect(s.vehicle.speed).toBeGreaterThan(0.3);
      expect(s.vehicle.speed).toBeLessThan(1.2);
      expect(s.vehicle.brake).toBeGreaterThan(0);
    } finally {
      s.physics.free();
    }
  });
});

describe('crawl input bindings', () => {
  function keyboard() {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    const key = (code: string, type = 'keydown') => {
      const e = new Event(type, { cancelable: true });
      Object.assign(e, { code, repeat: false });
      target.dispatchEvent(e);
    };
    return { input, key };
  }

  it('Z, X and P are single-step commands and menus do not leak them into driving', () => {
    const { input, key } = keyboard();
    key('KeyZ');
    key('KeyX');
    key('KeyP');
    const first = input.vehicleInput(DT);
    expect([first.toggleFrontDiff, first.toggleRearDiff, first.togglePrecision]).toEqual([true, true, true]);
    const held = input.vehicleInput(DT);
    expect([held.toggleFrontDiff, held.toggleRearDiff, held.togglePrecision]).toEqual([false, false, false]);
    input.vehicleEnabled = false;
    key('KeyZ');
    input.vehicleEnabled = true;
    expect(input.vehicleInput(DT).toggleFrontDiff).toBe(false);
  });

  it('camera buttons leave crawling unchanged; menu selections queue single-step drive commands', () => {
    const { input } = keyboard();
    const buttons = Array.from({ length: 17 }, (_, i) => ({
      pressed: [11, 14, 15].includes(i),
      value: [11, 14, 15].includes(i) ? 1 : 0,
    }));
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, 0, 0, 0], buttons }] });
    try {
      input.poll();
      const command = input.vehicleInput(DT);
      expect([command.toggleFrontDiff, command.toggleRearDiff, command.togglePrecision]).toEqual([
        false,
        false,
        false,
      ]);
      expect(input.pressed('cameraReset')).toBe(true);
      // A radial menu selection is queued as the menu closes and driving resumes.
      input.vehicleEnabled = false;
      input.requestDriveAction('frontDiff');
      input.requestDriveAction('rearDiff');
      input.requestDriveAction('precision');
      input.vehicleEnabled = true;
      const selected = input.vehicleInput(DT);
      expect([selected.toggleFrontDiff, selected.toggleRearDiff, selected.togglePrecision]).toEqual([
        true,
        true,
        true,
      ]);
      input.poll();
      expect(input.vehicleInput(DT).togglePrecision).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
