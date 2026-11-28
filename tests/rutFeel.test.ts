import { describe, expect, it } from 'vitest';
import { rutFeel } from '../src/data/rutFeel';
import { vehicleTuning } from '../src/data/vehicle';
import type { RutField, VehicleEnv } from '../src/sim/vehicle/vehicle';
import { makeScene } from './helpers/scenes';

/**
 * How a rut feels under a wheel (4WD Simulator v0.31). Over the Cape hands its vehicles no
 * rut field, so none of this happens there; the engine is kept the same in both games.
 */
const dry = (ruts?: RutField): VehicleEnv => ({ wetness: 0, waterLevelOffset: 0, ...(ruts ? { ruts } : {}) });
const everywhere = (metres: number): RutField => ({ metresAt: () => metres });
const nowhere = everywhere(0);
/** Two ruts running north-south, one under each side's wheels of a car at x = 0. */
const twoRuts = (metres: number): RutField => {
  const xs = [...new Set(vehicleTuning.wheels.map((w) => w.x))];
  return { metresAt: (x) => (xs.some((wx) => Math.abs(x - wx) < 0.14) ? metres : 0) };
};

describe('ruts that can be felt', () => {
  it('a car with all four wheels in full-depth ruts sits that much lower', async () => {
    const flat = await makeScene({ env: dry() });
    const rutted = await makeScene({ env: dry(everywhere(rutFeel.fullDepth)) });
    flat.run(3, {});
    rutted.run(3, {});
    const drop = flat.vehicle.body.translation().y - rutted.vehicle.body.translation().y;
    expect(drop).toBeGreaterThan(rutFeel.fullDepth * 0.8);
    expect(drop).toBeLessThan(rutFeel.fullDepth * 1.2);
    // Half as deep, half the drop.
    const half = await makeScene({ env: dry(everywhere(rutFeel.fullDepth / 2)) });
    half.run(3, {});
    const halfDrop = flat.vehicle.body.translation().y - half.vehicle.body.translation().y;
    expect(halfDrop).toBeGreaterThan(drop * 0.35);
    expect(halfDrop).toBeLessThan(drop * 0.65);
    for (const s of [flat, rutted, half]) s.physics.world.free();
  });

  it('a rut drags a little: the car coasts to a stop sooner in one, but not much sooner', async () => {
    const coast = async (ruts?: RutField) => {
      const s = await makeScene({ env: dry(ruts), speed: 8 });
      s.run(2.5, {});
      const v = Math.abs(s.vehicle.speed);
      s.physics.world.free();
      return v;
    };
    const flat = await coast();
    const rutted = await coast(everywhere(rutFeel.fullDepth));
    expect(rutted).toBeLessThan(flat - 0.15);
    expect(rutted).toBeGreaterThan(flat * 0.6);
  });

  it('a car steered gently out of its ruts leaves them less far than it would on flat ground', async () => {
    const drift = async (ruts?: RutField) => {
      const s = await makeScene({ env: dry(ruts) });
      s.run(1.5, {});
      // Up to a walking pace along the ruts, then a gentle turn.
      s.run(2.5, { throttle: 0.5 });
      s.run(1.2, { throttle: 0.4, steer: 0.12 });
      const x = s.vehicle.body.translation().x;
      s.physics.world.free();
      return Math.abs(x);
    };
    const flat = await drift();
    const rutted = await drift(twoRuts(rutFeel.fullDepth));
    expect(flat).toBeGreaterThan(0.2);
    expect(rutted).toBeLessThan(flat * 0.85);
    // Held, not locked in: full lock still climbs out.
    const s = await makeScene({ env: dry(twoRuts(rutFeel.fullDepth)) });
    s.run(1.5, {});
    s.run(2.5, { throttle: 0.5 });
    s.run(2.5, { throttle: 0.5, steer: 1 });
    expect(Math.abs(s.vehicle.body.translation().x)).toBeGreaterThan(1);
    s.physics.world.free();
  });

  it('with a rut field that is flat everywhere, the car drives exactly as with none', async () => {
    const drive = async (ruts?: RutField) => {
      const s = await makeScene({ env: dry(ruts) });
      s.run(1, {});
      s.run(3, (t) => ({ throttle: 0.7, steer: Math.sin(t * 2) * 0.5 }));
      const p = s.vehicle.body.translation();
      const out = [p.x, p.y, p.z, s.vehicle.speed];
      s.physics.world.free();
      return out;
    };
    expect(await drive(nowhere)).toEqual(await drive());
  });
});
