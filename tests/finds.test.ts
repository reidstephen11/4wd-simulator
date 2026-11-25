import { describe, expect, it } from 'vitest';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { applyCheckpoint, checkpointAt, EpisodeRun, startCheckpoint } from '../src/sim/episode';
import { Finds } from '../src/sim/finds';
import { loadSave, writeSave } from '../src/sim/save/save';
import type { FindDef } from '../src/sim/world/mapTypes';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

// The game's level has nothing to find, so these are two of the engine's own: a jerry can
// where the test scene's car is parked, and tyre plugs well away from it.
const finds: FindDef[] = [
  { id: 'hut-plugs', name: 'Tyre plugs', x: 200, z: 0, radius: 6, gives: { plugs: 2 }, taken: 'Plugs.' },
  { id: 'hut-jerry-can', name: 'Jerry can', x: 2, z: 1, radius: 6, gives: { jerryCans: 1 }, taken: 'A can.' },
];

describe('Finds off the main line', () => {
  it('loads a find once, only when stopped beside it, and puts it back from a checkpoint', async () => {
    const s = await makeScene({});
    try {
      const v = s.vehicle;
      s.run(1, { handbrake: true });
      const f = new Finds(finds);
      const c = v.condition;
      c.jerryCans = 1;
      // Parked beside the hut.
      expect(f.near(v.position.x, v.position.z)).toMatchObject({ inReach: true });
      const moving = v.speed;
      expect(Math.abs(moving)).toBeLessThan(0.6);
      expect(f.update(v)?.id).toBe('hut-jerry-can');
      expect(c.jerryCans).toBe(2);
      expect(f.update(v)).toBeNull();
      expect(c.jerryCans).toBe(2);
      expect(f.near(v.position.x, v.position.z)).toBeNull();

      // A camp reached after loading it keeps it; restarting from a camp before puts it back.
      const run = new EpisodeRun(ironbarkLevel, startCheckpoint(ironbarkLevel, 'start', 'shortie'), true);
      const before = checkpointAt('first-camp', run, v, [], []);
      const after = checkpointAt('second-camp', run, v, [], f.taken);
      expect(after.taken).toEqual(['hut-jerry-can']);
      f.reset(before.taken);
      applyCheckpoint(v, { ...before, jerryCans: 1 });
      expect(f.taken.size).toBe(0);
      expect(f.update(v)?.id).toBe('hut-jerry-can');
      expect(c.jerryCans).toBe(2);
    } finally {
      s.physics.free();
    }
  });

  it('does not load a find while driving past it', async () => {
    const s = await makeScene({ speed: 3 });
    try {
      const v = s.vehicle;
      const f = new Finds(finds);
      const cans = v.condition.jerryCans;
      s.run(1 / 60, {});
      expect(Math.abs(v.speed)).toBeGreaterThan(0.6);
      expect(f.near(v.position.x, v.position.z)).toMatchObject({ inReach: true });
      expect(f.update(v)).toBeNull();
      expect(v.condition.jerryCans).toBe(cans);
    } finally {
      s.physics.free();
    }
  });

  it('keeps what was taken in the save, and reads old saves as nothing taken', () => {
    const store = new MemoryStore();
    const checkpoint = {
      ...startCheckpoint(ironbarkLevel, 'first-camp', 'shortie'),
      taken: ['hut-plugs'],
    };
    writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint } } }), store);
    expect(loadSave(store)?.episodes.ironbark?.checkpoint?.taken).toEqual(['hut-plugs']);
    const old: Partial<typeof checkpoint> = { ...checkpoint };
    delete old.taken;
    writeSave(
      saveData({ episodes: { ironbark: { completed: false, checkpoint: old as typeof checkpoint } } }),
      store,
    );
    expect(loadSave(store)?.episodes.ironbark?.checkpoint?.taken).toEqual([]);
  });
});
