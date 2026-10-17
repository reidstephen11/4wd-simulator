import { describe, expect, it } from 'vitest';
import { vehicleTuning } from '../src/data/vehicle';
import { SurfaceId } from '../src/data/surfaces';
import { makeScene } from './helpers/scenes';

describe('low-range suspension articulation', () => {
  it('keeps all four tyres loaded on diagonal rocks that lift a tyre in high range', async () => {
    const loads = async (low: boolean) => {
      const s = await makeScene({ tuning: structuredClone(vehicleTuning) });
      try {
        if (low) s.vehicle.toggleRange();
        s.run(3, {});
        for (const [x, z] of [
          [-0.725, -1.15],
          [0.725, 1.15],
        ])
          s.physics.addStaticBox(
            { kind: 'ledge', x, y: 0.11, z, hx: 0.45, hy: 0.11, hz: 0.6, yaw: 0 },
            SurfaceId.Rock,
          );
        s.run(4, { handbrake: true });
        return { loads: s.vehicle.wheels.map((w) => w.load), tilt: s.vehicle.tiltDeg() };
      } finally {
        s.physics.free();
      }
    };
    const high = await loads(false),
      low = await loads(true);
    expect(Math.min(...high.loads)).toBe(0);
    expect(Math.min(...low.loads)).toBeGreaterThan(900);
    expect(low.tilt).toBeLessThan(high.tilt);
  });

  it('changes range without lifting the parked body and settles after a drop', async () => {
    const s = await makeScene({});
    try {
      const parked = s.vehicle.position.y;
      s.vehicle.toggleRange();
      s.run(3, {});
      expect(Math.abs(s.vehicle.position.y - parked)).toBeLessThan(0.02);
      s.vehicle.body.setTranslation({ ...s.vehicle.position, y: parked + 0.4 }, true);
      s.run(3, {});
      expect(s.vehicle.wheels.every((w) => w.contact && w.load > 1000)).toBe(true);
      expect(Math.abs(s.vehicle.position.y - parked)).toBeLessThan(0.02);
      const settled = s.vehicle.position.y;
      s.run(0.5, {});
      expect(Math.abs(s.vehicle.position.y - settled)).toBeLessThan(0.002);
      s.vehicle.toggleRange();
      s.run(3, {});
      expect(Math.abs(s.vehicle.position.y - parked)).toBeLessThan(0.02);
    } finally {
      s.physics.free();
    }
  });
});
