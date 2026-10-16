import { describe, expect, it } from 'vitest';
import { highCountryMap } from '../src/data/map';
import { Exploration } from '../src/sim/exploration';
import { defaultSettings, loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('exploration and saving (M5)', () => {
  it('discovers a POI once and remembers the last campsite', () => {
    const ex = new Exploration(highCountryMap.pois, { discovered: [], lastCampsite: 'river-flat-camp' });
    const hut = highCountryMap.pois.find((p) => p.id === 'mountain-hut')!;
    const first = ex.check(hut.x, hut.z);
    expect(first.discovered.map((p) => p.id)).toEqual(['mountain-hut']);
    expect(first.campsite).toBe('mountain-hut');
    expect(ex.check(hut.x, hut.z).discovered).toEqual([]);
    expect(ex.lastCampsite).toBe('mountain-hut');
  });

  it('round-trips through storage', () => {
    const s = new MemoryStore();
    const ex = new Exploration(highCountryMap.pois, { discovered: ['falls'], lastCampsite: 'mountain-hut' });
    expect(
      writeSave(
        { version: 1, exploration: ex.state(), settings: { ...defaultSettings, quality: 'high' } },
        s,
      ),
    ).toBe(true);
    const loaded = loadSave(s)!;
    expect(loaded.exploration.discovered).toEqual(['falls']);
    expect(loaded.exploration.lastCampsite).toBe('mountain-hut');
    expect(loaded.settings.quality).toBe('high');
  });

  it('never throws when storage is blocked or the save is junk', () => {
    const blocked: KeyValueStore = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadSave(blocked)).toBeNull();
    expect(
      writeSave(
        { version: 1, exploration: { discovered: [], lastCampsite: '' }, settings: defaultSettings },
        blocked,
      ),
    ).toBe(false);
    const junk = new MemoryStore();
    junk.setItem('4wdsim.save.v1', '{not json');
    expect(loadSave(junk)).toBeNull();
    expect(loadSave(null)).toBeNull();
  });

  it('ignores unknown POIs and campsites from an old save', () => {
    const ex = new Exploration(highCountryMap.pois, {
      discovered: ['nowhere', 'falls'],
      lastCampsite: 'falls',
    });
    expect([...ex.discovered]).toEqual(['falls']);
    expect(ex.lastCampsite).toBe('river-flat-camp');
  });
});
