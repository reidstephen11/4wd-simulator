import { describe, expect, it } from 'vitest';
import { vehicleTuning as t } from '../src/data/vehicle';
import {
  createDrivetrainState,
  engineTorque,
  totalRatio,
  updateDrivetrain,
} from '../src/sim/vehicle/drivetrain';
import { SteeringSmoother } from '../src/sim/input/vehicleInput';
import { surfaceGrip, SurfaceId } from '../src/data/surfaces';

describe('drivetrain', () => {
  it('low range gives 2.5× the wheel torque of high range', () => {
    expect(totalRatio(t, 0, 'low') / totalRatio(t, 0, 'high')).toBeCloseTo(2.5, 5);
  });

  it('interpolates the torque curve', () => {
    expect(engineTorque(t, 2000)).toBeCloseTo(280);
    expect(engineTorque(t, 2400)).toBeGreaterThan(280);
  });

  it('upshifts as speed rises and cuts drive at the range top speed', () => {
    const s = createDrivetrainState();
    let f = 0;
    for (let v = 0; v < 26; v += 0.5)
      f = updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: v, enginePower: 1 }, 1 / 60);
    expect(s.gear).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++)
      f = updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: 101 / 3.6, enginePower: 1 }, 1 / 60);
    expect(f).toBe(0);
    s.range = 'low';
    s.gear = 0;
    for (let i = 0; i < 60; i++)
      f = updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: 26 / 3.6, enginePower: 1 }, 1 / 60);
    expect(f).toBe(0);
  });

  it('selects reverse when asked at a standstill and pushes backwards', () => {
    const s = createDrivetrainState();
    const f = updateDrivetrain(t, s, { throttle: 1, reverse: true, speed: 0, enginePower: 1 }, 1 / 60);
    expect(s.gear).toBe(-1);
    expect(f).toBeLessThan(0);
  });

  it('gives no drive when the engine is stalled', () => {
    const s = createDrivetrainState();
    s.engineRunning = false;
    expect(updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: 0, enginePower: 1 }, 1 / 60)).toBe(0);
  });
});

describe('input and surfaces', () => {
  it('keyboard steering ramps in and back out', () => {
    const sm = new SteeringSmoother(2.5, 4);
    sm.update(1, 0.1);
    expect(sm.value).toBeCloseTo(0.25);
    for (let i = 0; i < 10; i++) sm.update(1, 0.1);
    expect(sm.value).toBe(1);
    sm.update(0, 0.1);
    expect(sm.value).toBeCloseTo(0.6);
  });

  it('wetness lowers grip', () => {
    expect(surfaceGrip(SurfaceId.Dirt, 1)).toBeLessThan(surfaceGrip(SurfaceId.Dirt, 0));
    expect(surfaceGrip(SurfaceId.Mud, 0)).toBeLessThan(surfaceGrip(SurfaceId.Gravel, 0));
  });
});
