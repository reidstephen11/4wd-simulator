import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CockpitHeadMotion } from '../src/render/cockpitHeadMotion';
import { ChaseCamera } from '../src/render/chaseCamera';
import { headMotion as H } from '../src/data/camera';
import { vehicles } from '../src/data/vehicles';

function fixture() {
  const motion = new CockpitHeadMotion();
  const input = { velocity: new Vector3(), position: new Vector3(), rotation: new Quaternion() };
  motion.step(1 / 60, input);
  return { motion, input };
}

describe('cockpit head motion', () => {
  it('stays still at rest and at constant speed, without synthetic bobbing', () => {
    const { motion, input } = fixture();
    for (const velocity of [new Vector3(), new Vector3(0, 0, -12)]) {
      motion.reset();
      input.velocity.copy(velocity);
      for (let i = 0; i < 300; i++) motion.step(1 / 60, input);
      expect(motion.offset.length()).toBe(0);
    }
  });

  it('lags back when accelerating, nods forward when braking and leans out of a corner', () => {
    for (const [axis, acceleration] of [
      ['z', -3],
      ['z', 4],
      ['x', 4],
      ['y', 6],
    ] as const) {
      const { motion, input } = fixture();
      for (let i = 0; i < 60; i++) {
        input.velocity[axis] += acceleration / 60;
        motion.step(1 / 60, input);
      }
      expect(motion.offset[axis] * acceleration).toBeLessThan(0);
      expect(Math.abs(motion.offset[axis])).toBeGreaterThan(0.005);
      for (let i = 0; i < 180; i++) motion.step(1 / 60, input);
      expect(motion.offset.length()).toBeLessThan(0.000001);
    }
  });

  it('expresses loads in the vehicle frame even when driving across the world', () => {
    const { motion, input } = fixture();
    input.rotation.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    motion.reset();
    motion.step(1 / 60, input);
    for (let i = 0; i < 60; i++) {
      input.velocity.x -= 4 / 60;
      motion.step(1 / 60, input);
    }
    expect(motion.offset.z).toBeGreaterThan(0.01);
    expect(Math.abs(motion.offset.x)).toBeLessThan(0.00001);
  });

  it('bounds hard impacts and clears after teleports, large time gaps or invalid samples', () => {
    const { motion, input } = fixture();
    for (let i = 0; i < 180; i++) {
      input.velocity.set(i % 30 < 15 ? 100 : -100, 50 * Math.sin(i), -i);
      motion.step(1 / 60, input);
      for (const axis of ['x', 'y', 'z'] as const)
        expect(Math.abs(motion.offset[axis])).toBeLessThanOrEqual(H.maxOffset[axis]);
    }
    input.position.x = 100;
    motion.step(1 / 60, input);
    expect(motion.offset.length()).toBe(0);
    input.velocity.set(0, 0, -20);
    motion.step(1 / 60, input);
    motion.step(0.25, input);
    expect(motion.offset.length()).toBe(0);
    input.velocity.x = NaN;
    motion.step(1 / 60, input);
    expect(motion.offset.length()).toBe(0);
  });

  it('has the same response at different sampling rates and interpolates without advancing time', () => {
    const response = (hz: number) => {
      const { motion, input } = fixture();
      for (let i = 0; i < hz; i++) {
        input.velocity.z -= 3 / hz;
        motion.step(1 / hz, input);
      }
      const after = motion.offset.clone();
      expect(motion.sample(0, new Vector3()).toArray()).toEqual(motion.previous.toArray());
      expect(motion.sample(1, new Vector3()).toArray()).toEqual(after.toArray());
      for (let i = 0; i < 120; i++) motion.sample(i / 120, new Vector3());
      expect(motion.offset.toArray()).toEqual(after.toArray());
      return after;
    };
    expect(response(60).distanceTo(response(120))).toBeLessThan(0.0001);
    expect(response(30).distanceTo(response(60))).toBeLessThan(0.0002);
  });

  it('keeps the eye inside a small envelope in every cabin and disables without changing manual look', () => {
    const camera = new PerspectiveCamera();
    const chase = new ChaseCamera(
      camera,
      (_from, _dir, max) => max,
      () => -10,
    );
    const { input } = fixture();
    const target = {
      position: new Vector3(),
      forward: new Vector3(0, 0, -1),
      speed: 0,
      slopeDeg: 0,
      rotation: input.rotation,
    };
    for (const vehicle of Object.values(vehicles)) {
      chase.seat = vehicle.cabin;
      chase.selectPreset('cockpit');
      input.velocity.set(0, 0, 0);
      chase.headMotion.step(1 / 60, input);
      for (let i = 0; i < 60; i++) {
        input.velocity.z -= 4 / 60;
        chase.headMotion.step(1 / 60, input);
      }
      chase.update(1 / 60, target);
      const eye = new Vector3().copy(vehicle.cabin.eye);
      expect(camera.position.distanceTo(eye)).toBeGreaterThan(0.01);
      expect(camera.position.distanceTo(eye)).toBeLessThan(0.035);
      chase.headMotionEnabled = false;
      chase.orbit(0.8, 0);
      for (let i = 0; i < 60; i++) chase.update(1 / 60, target);
      expect(camera.position.toArray()).toEqual(eye.toArray());
      expect(camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(0.5);
      chase.headMotionEnabled = true;
      chase.selectPreset('follow');
      expect(chase.headMotion.offset.length()).toBe(0);
      chase.reset();
      expect(chase.headMotion.offset.length()).toBe(0);
    }
  });
});
