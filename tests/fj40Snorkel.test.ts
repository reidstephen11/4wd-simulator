import { describe, expect, it } from 'vitest';
import { SurfaceId } from '../src/data/surfaces';
import { fortyTuning, vehicleTuning } from '../src/data/vehicle';
import { FJ40_BODY_LIFT, FJ40_SNORKEL_HEAD, vehicles } from '../src/data/vehicles';
import { makeScene } from './helpers/scenes';

/**
 * The FJ40 breathes through its snorkel (v2.38). It was drawn with one from v1.85, but the
 * engine flooded through an intake in the front wing 0.9 m off the ground, so water well
 * below the snorkel's head stalled it. The owner reported it from the deep crossing.
 */
describe('the FJ40’s snorkel', () => {
  it('is where the engine draws its air: the head drawn beside the windscreen', () => {
    const t = vehicles.shortie.tuning;
    expect(t.intake.x).toBe(FJ40_SNORKEL_HEAD.x);
    expect(t.intake.y).toBeCloseTo(FJ40_SNORKEL_HEAD.y + FJ40_BODY_LIFT, 6);
    expect(t.intake.z).toBe(FJ40_SNORKEL_HEAD.z);
    // About 1.9 m off the ground at rest: as high as the Patrol's.
    expect(t.intakeHeight).toBeGreaterThan(1.85);
    expect(t.intakeHeight).toBeLessThan(2);
  });

  it('leaves the earlier code-built 40 on its wing intake: it has no snorkel', () => {
    expect(vehicles.forty.tuning).toBe(fortyTuning);
    expect(fortyTuning.intake).toEqual(vehicleTuning.intake);
    expect(fortyTuning.intakeHeight).toBeCloseTo(0.9, 6);
  });

  it('wades water that floods the code-built 40', async () => {
    // Water 1.5 m deep everywhere: over the wing intake, under the snorkel head.
    const ground = { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.5 };
    for (const [tuning, floods] of [
      [fortyTuning, true],
      [vehicles.shortie.tuning, false],
    ] as const) {
      const s = await makeScene({ tuning, ground });
      s.run(12, {});
      expect(s.vehicle.condition.flood.stalled, tuning.name).toBe(floods);
      s.physics.world.free();
    }
  });
});
