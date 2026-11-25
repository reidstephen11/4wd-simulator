import { describe, expect, it } from 'vitest';
import type { EpisodeId } from '../src/data/episodes';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { choiceFromSave } from '../src/core/launch';
import {
  fitPack,
  isStandardPack,
  loadKg,
  packFor,
  packLimitKg,
  rememberPack,
  stepPack,
} from '../src/data/packing';
import { loadSave } from '../src/sim/save/save';
import { vehicleLoadout } from '../src/data/vehicles';
import { startCheckpoint } from '../src/sim/episode';
import { storyLevel } from './fixtures/story';

// A story episode's load (50 L, a jerry can, two spares, three plugs) and the level's own.
const standard = storyLevel.loadout;
const own = ironbarkLevel.loadout;

describe('packing', () => {
  it('leaves the standard load as it is, under the limit', () => {
    const l = vehicleLoadout(standard, 'shortie');
    expect(fitPack(l, standard, 'shortie')).toEqual(l);
    expect(loadKg(l, 'shortie')).toBeLessThan(packLimitKg(standard, 'shortie'));
  });

  it('will not pack past the weight limit', () => {
    let l = vehicleLoadout(standard, 'camel');
    for (let i = 0; i < 10; i++) l = stepPack(l, 'spares', 1, standard, 'camel') ?? l;
    for (let i = 0; i < 10; i++) l = stepPack(l, 'jerryCans', 1, standard, 'camel') ?? l;
    expect(loadKg(l, 'camel')).toBeLessThanOrEqual(packLimitKg(standard, 'camel') + 0.01);
    expect(stepPack(l, 'jerryCans', 1, standard, 'camel')).toBeNull();
  });

  it('steps fuel in tens up to a full tank', () => {
    let l = vehicleLoadout(standard, 'shortie');
    l = stepPack(l, 'fuel', 1, standard, 'shortie')!;
    expect(l.fuel).toBe(60);
    l = stepPack(l, 'fuel', 1, standard, 'shortie')!;
    expect(l.fuel).toBe(62);
    expect(stepPack(l, 'fuel', 1, standard, 'shortie')).toBeNull();
    expect(stepPack(l, 'fuel', -1, standard, 'shortie')!.fuel).toBe(60);
  });

  it('starts a new run with the load packed, and remembers it', () => {
    const pack = { fuel: 40, jerryCans: 2, spares: 1, plugs: 6 };
    const c = startCheckpoint(storyLevel, 'camp', 'shortie', 7, pack);
    expect([c.fuel, c.jerryCans, c.spares, c.plugs]).toEqual([40, 2, 1, 6]);
    expect(c.packed).toEqual(pack);
  });
});

describe('a heavy load', () => {
  it('adds its weight to the car and slows it on a climb', async () => {
    const { makeScene } = await import('./helpers/scenes');
    const climb = async (extraKg: number) => {
      const s = await makeScene({ pitchDeg: 12 });
      s.vehicle.packing = { spareKg: 35, baseKg: s.vehicle.condition.fuel * 0.8 - extraKg };
      s.run(1, {});
      const y0 = s.vehicle.position.y;
      s.run(6, { throttle: 1 });
      return { gained: s.vehicle.position.y - y0, mass: s.vehicle.mass };
    };
    const light = await climb(0);
    const heavy = await climb(400);
    expect(heavy.mass - light.mass).toBeCloseTo(400, 0);
    expect(heavy.gained).toBeLessThan(light.gained);
  });
});

describe('each level starts with its own load (v2.23)', () => {
  // Packs are kept by level id. The game has one level, so a second id stands in for another.
  const other = 'other' as EpisodeId;
  const lean = { fuel: 16, jerryCans: 0, spares: 1, plugs: 2 };
  const store = (data: unknown) => ({
    getItem: () => JSON.stringify(data),
    setItem: () => undefined,
    removeItem: () => undefined,
  });

  it('gives a new player the level’s load, and another level its own', () => {
    // No save: the page opens on the first level with its load.
    const first = choiceFromSave(null);
    expect(first.episode).toBe('ironbark');
    expect(first.load).toEqual(vehicleLoadout(own, 'shortie'));
    // A level with a lean load of its own starts with that, not this one's.
    expect(packFor(undefined, other, lean, 'shortie')).toEqual(lean);
    expect(packFor(undefined, other, lean, 'shortie')).not.toEqual(first.load);
  });

  it('keeps a load packed by hand for the level and vehicle it was packed for, and nowhere else', () => {
    const heavy = stepPack(vehicleLoadout(own, 'shortie'), 'jerryCans', 1, own, 'shortie')!;
    const packs = rememberPack(undefined, 'ironbark', own, 'shortie', heavy);
    expect(packFor(packs, 'ironbark', own, 'shortie')).toEqual(heavy);
    expect(packFor(packs, 'ironbark', own, 'hilux')).toEqual(vehicleLoadout(own, 'hilux'));
    expect(packFor(packs, other, lean, 'shortie')).toEqual(vehicleLoadout(lean, 'shortie'));
  });

  it('does not remember the standard load, and forgets a hand-packed one when it is put back', () => {
    const base = vehicleLoadout(own, 'shortie');
    expect(isStandardPack(base, own, 'shortie')).toBe(true);
    expect(rememberPack(undefined, 'ironbark', own, 'shortie', base).ironbark).toEqual({});
    const lighter = stepPack(base, 'plugs', -1, own, 'shortie')!;
    expect(isStandardPack(lighter, own, 'shortie')).toBe(false);
    const kept = rememberPack(undefined, 'ironbark', own, 'shortie', lighter);
    expect(kept.ironbark?.shortie).toEqual(lighter);
    expect(rememberPack(kept, 'ironbark', own, 'shortie', base).ironbark?.shortie).toBeUndefined();
  });

  it('reads a save that kept one load per vehicle: it goes to the level last played, unless it is that level’s standard', () => {
    const old = (packs: unknown) =>
      loadSave(
        store({ version: 1, settings: {}, vehicle: 'shortie', episode: 'ironbark', episodes: {}, packs }),
      )!;
    // The level's standard load, recorded by a run: not a pack at all.
    const standardRun = old({ shortie: vehicleLoadout(own, 'shortie') });
    expect(standardRun.packs).toEqual({ ironbark: {} });
    expect(choiceFromSave(standardRun).load).toEqual(vehicleLoadout(own, 'shortie'));
    // A load packed by hand stays with the level last played.
    const heavy = { fuel: 40, jerryCans: 2, spares: 1, plugs: 6 };
    const custom = old({ shortie: heavy });
    expect(custom.packs?.ironbark?.shortie).toEqual(heavy);
    expect(choiceFromSave(custom).load).toEqual(heavy);
    // A save in the new form reads back as written, and a level that is not in the game is dropped.
    const fresh = old({
      ironbark: { hilux: { fuel: 20, jerryCans: 0, spares: 1, plugs: 2 } },
      moon: { shortie: heavy },
    });
    expect(fresh.packs?.ironbark?.hilux?.fuel).toBe(20);
    expect(fresh.packs?.ironbark?.shortie).toBeUndefined();
    expect(Object.keys(fresh.packs ?? {})).toEqual(['ironbark']);
  });
});
