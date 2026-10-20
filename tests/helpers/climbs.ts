import { expect, it } from 'vitest';
import { camelTuning } from '../../src/data/camel';
import { patrolTuning } from '../../src/data/patrol';
import { perentieTuning } from '../../src/data/perentie';
import { vehicleTuning } from '../../src/data/vehicle';
import type { WinchClimb } from '../../src/data/winchClimbs';
import { trailProgress } from '../../src/sim/world/crawlTrail';
import { stringybarkWorld } from '../world';
import { driver, runLeg } from './drive';
import { winchUp } from './winch';

const fleet = [vehicleTuning, camelTuning, perentieTuning, patrolTuning];

/**
 * One test per climb: every vehicle in the fleet, in low range with both lockers, stalls
 * on the first pitch; then winches up it from anchor to anchor, quick attach picking
 * each climb's next marked boulder in turn.
 */
export function climbTests(climbs: readonly WinchClimb[]) {
  const world = stringybarkWorld();
  const { scene } = driver(world);
  for (const c of climbs)
    it(`${c.name}: nothing drives up it, and every vehicle winches up it`, async () => {
      for (const tuning of fleet) {
        const s = await scene(c.id, false, 'both', tuning);
        try {
          await runLeg(s, s.track, false, 60);
          const along = trailProgress(s.track, s.v.position.x, s.v.position.z).along;
          expect(along, `${tuning.id} drove up`).toBeLessThan(c.pitchRanges[0][1]);
        } finally {
          s.sim.physics.free();
        }
        const run = await winchUp(world, c, tuning, undefined, 600);
        expect(run.reached, `${tuning.id} stopped ${run.furthest.toFixed(0)} m up`).toBe(true);
        expect(run.hookups, tuning.id).toEqual(c.anchors.map((_, i) => i));
        expect(run.tilt, tuning.id).toBeLessThan(50);
      }
    });
}
