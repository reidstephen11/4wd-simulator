import { describe, expect, it } from 'vitest';
import { parkStations } from '../src/data/parkCourse';
import { perentieTuning } from '../src/data/perentie';
import { vehicleTuning } from '../src/data/vehicle';
import type { TrailDifficulty } from '../src/sim/world/mapTypes';
import { driver } from './helpers/drive';
import { parkWorld } from './world';

const { drive } = driver(parkWorld());
/** Most the car tilts (pitch and roll together) on each grade. */
const maxTilt: Record<TrailDifficulty, number> = { easy: 30, moderate: 34, hard: 43, extreme: 45 };
const tunings = [vehicleTuning, perentieTuning];

/**
 * Every station's lines with both vehicles in low range: the easier line with open
 * diffs, the harder one with both lockers, each in its signposted direction. The harder
 * line always throws the car about more than the easier one.
 */
describe('Ironbark 4WD Park stations', () => {
  for (const s of parkStations)
    for (const tuning of tunings)
      it(`${s.n} ${s.name}: both lines go, and the harder one tilts the ${tuning.name} more`, async () => {
        const tilts: number[] = [];
        for (const [which, lockers] of [
          ['easier', 'open'],
          ['harder', 'both'],
        ] as const) {
          const line = s[which];
          const r = await drive(`${s.id}-${which}`, lockers, false, 200, tuning);
          expect(r.done, `${which} stopped ${r.remaining.toFixed(1)} m from the end`).toBe(true);
          expect(r.tilt, which).toBeLessThan(maxTilt[line.grade]);
          tilts.push(r.tilt);
        }
        expect(tilts[1]).toBeGreaterThan(tilts[0] + 3);
      }, 120_000);

  for (const tuning of tunings) {
    it(`the harder Axle Twisters and Rock Garden stop the ${tuning.name} with open diffs`, async () => {
      for (const id of ['axle-twisters-harder', 'rock-garden-harder']) {
        const r = await drive(id, 'open', false, 80, tuning);
        expect(r.done, id).toBe(false);
        // A rear locker gets it through the twisters.
        if (id === 'axle-twisters-harder')
          expect((await drive(id, 'rear', false, 200, tuning)).done).toBe(true);
      }
    }, 120_000);

    it(`the deep Mud Pits are far slower for the ${tuning.name} with open diffs`, async () => {
      const locked = await drive('mud-pits-harder', 'both', false, 200, tuning);
      const open = await drive('mud-pits-harder', 'open', false, 200, tuning);
      expect(open.done).toBe(true);
      expect(open.time).toBeGreaterThan(1.25 * locked.time);
    }, 120_000);
  }
});
