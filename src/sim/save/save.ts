import { SAVE_KEY } from '../../core/config';
import type { ExplorationState } from '../exploration';

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  masterVolume: number;
  engineVolume: number;
  ambienceVolume: number;
  units: 'kmh' | 'mph';
}

export interface SaveData {
  version: 1;
  exploration: ExplorationState;
  settings: Settings;
}

export const defaultSettings: Settings = {
  quality: 'medium',
  masterVolume: 0.8,
  engineVolume: 0.8,
  ambienceVolume: 0.7,
  units: 'kmh',
};

/** Minimal storage interface so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function store(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage itself can throw when storage is blocked.
    return null;
  }
}

function clamp01(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback;
}

/** Read the save; any problem (blocked storage, bad JSON, old data) gives defaults. */
export function loadSave(s: KeyValueStore | null = store()): SaveData | null {
  try {
    const raw = s?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return null;
    const ex = data.exploration;
    const st = (data.settings ?? {}) as Partial<Settings>;
    return {
      version: 1,
      exploration: {
        discovered: Array.isArray(ex?.discovered)
          ? ex.discovered.filter((x): x is string => typeof x === 'string')
          : [],
        lastCampsite: typeof ex?.lastCampsite === 'string' ? ex.lastCampsite : '',
      },
      settings: {
        quality: st.quality === 'low' || st.quality === 'high' ? st.quality : 'medium',
        masterVolume: clamp01(st.masterVolume, defaultSettings.masterVolume),
        engineVolume: clamp01(st.engineVolume, defaultSettings.engineVolume),
        ambienceVolume: clamp01(st.ambienceVolume, defaultSettings.ambienceVolume),
        units: st.units === 'mph' ? 'mph' : 'kmh',
      },
    };
  } catch {
    return null;
  }
}

/** Write the save. Returns false (and never throws) if storage is unavailable. */
export function writeSave(data: SaveData, s: KeyValueStore | null = store()): boolean {
  try {
    if (!s) return false;
    s.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
