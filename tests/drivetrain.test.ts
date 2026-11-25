import { describe, expect, it } from 'vitest';
import { vehicleTuning as t } from '../src/data/vehicle';
import {
  createDrivetrainState,
  engineBrakeForce,
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

  it('upshifts as speed rises and stops driving at the range top speed', () => {
    const s = createDrivetrainState();
    let f = 0;
    for (let v = 0; v < 26; v += 0.5)
      f = updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: v, enginePower: 1 }, 1 / 60);
    expect(s.gear).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++)
      f = updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: 101 / 3.6, enginePower: 1 }, 1 / 60);
    // The governor closes the throttle; what's left is engine braking.
    expect(f).toBeLessThanOrEqual(0);
    s.range = 'low';
    s.gear = 0;
    for (let i = 0; i < 60; i++)
      f = updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: 26 / 3.6, enginePower: 1 }, 1 / 60);
    expect(f).toBeLessThanOrEqual(0);
  });

  it('selects reverse when asked at a standstill and pushes backwards', () => {
    const s = createDrivetrainState();
    const f = updateDrivetrain(t, s, { throttle: 1, reverse: true, speed: 0, enginePower: 1 }, 1 / 60);
    expect(s.gear).toBe(-1);
    expect(f).toBeLessThan(0);
  });

  it('a stalled engine drags the wheels in proportion to the gearing', () => {
    const s = createDrivetrainState();
    expect(engineBrakeForce(t, s)).toBe(0);
    s.engineRunning = false;
    s.gear = 0;
    s.range = 'high';
    const high = engineBrakeForce(t, s);
    expect(high).toBeCloseTo((t.engine.engineBrake * totalRatio(t, 0, 'high')) / 2);
    s.range = 'low';
    expect(engineBrakeForce(t, s)).toBeCloseTo(high * t.ranges.low.ratio);
    s.gear = 2;
    expect(engineBrakeForce(t, s)).toBeLessThan(high * t.ranges.low.ratio);
  });

  it('gives no drive when the engine is stalled', () => {
    const s = createDrivetrainState();
    s.engineRunning = false;
    expect(updateDrivetrain(t, s, { throttle: 1, reverse: false, speed: 0, enginePower: 1 }, 1 / 60)).toBe(0);
    expect(s.fuelRate).toBe(0);
  });

  it('tank capacity does not change consumption or power, and a stationary hard pull burns more than idle', () => {
    const largerTank = {
      ...t,
      engine: { ...t.engine, fuel: { ...t.engine.fuel, tankLitres: 180 } },
    };
    const normal = createDrivetrainState();
    const large = createDrivetrainState();
    const idle = createDrivetrainState();
    for (let i = 0; i < 300; i++) {
      const pull = { throttle: 1, reverse: false, speed: 0, enginePower: 1 };
      expect(updateDrivetrain(t, normal, pull, 1 / 60)).toBe(
        updateDrivetrain(largerTank, large, pull, 1 / 60),
      );
      updateDrivetrain(t, idle, { ...pull, throttle: 0 }, 1 / 60);
    }
    expect(large.fuelRate).toBe(normal.fuelRate);
    expect(normal.fuelRate).toBeGreaterThan(idle.fuelRate * 8);
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
    // Red clay grips like dirt when dry and goes greasy after rain.
    expect(surfaceGrip(SurfaceId.Clay, 0)).toBeGreaterThan(0.9);
    expect(surfaceGrip(SurfaceId.Clay, 0.7)).toBeLessThan(surfaceGrip(SurfaceId.Dirt, 0.7) * 0.8);
    expect(surfaceGrip(SurfaceId.Clay, 1)).toBeLessThan(surfaceGrip(SurfaceId.Gravel, 1) * 0.7);
  });
});
