import { defaultSettings, type KeyValueStore, type SaveData } from '../../src/sim/save/save';

/** A complete save with defaults, overridden by `over`. */
export function saveData(over: Partial<SaveData> = {}): SaveData {
  return {
    version: 1,
    settings: defaultSettings,
    vehicle: 'shortie',
    episode: 'ironbark',
    episodes: {},
    replay: null,
    ...over,
  };
}

/** In-memory storage. */
export class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}
