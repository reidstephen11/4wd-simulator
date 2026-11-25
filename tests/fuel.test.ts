import { describe, expect, it } from 'vitest';
import { vehicleLoadout, vehicleOrder, vehicles } from '../src/data/vehicles';
import { applyCheckpoint, startCheckpoint } from '../src/sim/episode';
import { measureFuel } from './helpers/fuel';
import { makeScene } from './helpers/scenes';
import { storyLevel } from './fixtures/story';

describe('vehicle fuel', () => {
  it('never starts or restores more fuel than the real tank holds, including when changing vehicle', async () => {
    const fullTroopy = { ...startCheckpoint(storyLevel, 'start', 'troopy'), fuel: 180 };
    for (const id of vehicleOrder) {
      const tuning = vehicles[id].tuning;
      const tank = tuning.engine.fuel.tankLitres;
      expect(vehicleLoadout({ ...storyLevel.loadout, fuel: 1000 }, id).fuel).toBe(tank);
      const scene = await makeScene({ tuning });
      try {
        applyCheckpoint(scene.vehicle, fullTroopy);
        expect(scene.vehicle.condition.fuel).toBe(tank);
        expect(vehicleLoadout(storyLevel.loadout, id).fuel).toBeLessThanOrEqual(tank);
      } finally {
        scene.physics.world.free();
      }
    }
  });

  // Broad consumption bands for these loaded, equipped vehicles on level dirt. They
  // catch unit errors and inflated idle burn, without claiming a certified road cycle.
  const cases = [
    ['shortie', 14, 23],
    ['ute40', 14, 26],
    ['camel', 7, 14],
    ['perentie', 8, 15],
    ['hilux', 9, 16],
    ['xtracab', 9, 17],
    ['unimog', 20, 30],
    ['troopy', 11, 19],
    ['hj60', 10, 18],
    ['mq', 9, 17],
    ['rangie', 12, 22],
    ['patrol', 10, 18],
    ['lc79', 13, 24],
    ['sooty80', 12, 24],
  ] as const;
  it.each(cases)(
    '%s uses plausible idle and light-road fuel before episode scaling',
    async (id, min, max) => {
      const t = vehicles[id].tuning;
      const result = await measureFuel(t, id === 'unimog' ? 40 : 60);
      expect(result.idleLitresPerHour).toBeGreaterThanOrEqual(t.engine.fuel.idleLitresPerHour);
      expect(result.idleLitresPerHour).toBeLessThan(t.engine.fuel.idleLitresPerHour + 0.6);
      expect(result.litresPer100Km).toBeGreaterThan(min);
      expect(result.litresPer100Km).toBeLessThan(max);
      expect(result.averageKmh).toBeGreaterThan(id === 'unimog' ? 34 : 50);
      expect(result.averageKmh).toBeLessThan(id === 'unimog' ? 40 : 60);
    },
  );
});
