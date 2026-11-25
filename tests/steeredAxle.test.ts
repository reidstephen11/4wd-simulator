import { describe, expect, it } from 'vitest';
import { makeScene } from './helpers/scenes';
import { rotate } from '../src/sim/vehicle/math';
import { steeredAxle } from '../src/sim/vehicle/vehicle';

/**
 * Rapier steers a wheel by turning its axle (1, 0, 0) about +y, so the axle for steering s is
 * (cos s, 0, −sin s). The vehicle uses `steeredAxle` to hand tyre forces to planks and to add
 * the roll torque; this checks it against the controller's own side impulses.
 */
describe('steered axle direction (v1.19)', () => {
  it('the front tyres resist a creep along (cos s, 0, −sin s) as fully as the rears do', async () => {
    const s = await makeScene({});
    const v = s.vehicle;
    const c = v.controller;
    s.run(1.5, { steer: 1 });
    const steer = c.wheelSteering(0) ?? 0;
    expect(Math.abs(steer)).toBeGreaterThan(0.3);
    const q = v.body.rotation();
    const measure = (d: { x: number; z: number }) => {
      s.run(1, { steer: 1 });
      v.body.setLinvel({ x: d.x * 0.3, y: 0, z: d.z * 0.3 }, true);
      s.run(1 / 60, { steer: 1 });
      return [0, 1, 2, 3].map((i) => Math.abs(c.wheelSideImpulse(i) ?? 0));
    };
    const axle = measure(steeredAxle(q, steer));
    const mirrored = measure(rotate(q, Math.cos(steer), 0, Math.sin(steer)));
    // Along the true axle each front holds like a rear; along the mirrored one it gives.
    for (const i of [0, 1]) {
      expect(axle[i]).toBeGreaterThan(mirrored[i]);
      expect(axle[i]).toBeGreaterThan(axle[2] * 0.85);
    }
  });
});
