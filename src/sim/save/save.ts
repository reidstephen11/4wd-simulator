import { SAVE_KEY } from '../../core/config';
import type { ExplorationState } from '../exploration';
import type { CrawlBests } from '../crawlRuns';
import type { VehicleId } from '../../data/vehicle';
import { isVehicleId } from '../../data/vehicles';
import { isMapId, type MapId } from '../../data/maps';
import { defaultConditions, isTimeOfDay, isWeather, type Conditions } from '../../data/environment';

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  masterVolume: number;
  engineVolume: number;
  ambienceVolume: number;
  units: 'kmh' | 'mph';
}

export interface SaveData {
  version: 1;
  /** Progress on the map being played (`map`). */
  exploration: ExplorationState;
  settings: Settings;
  /** Best scored run per crawl trail (added later; older saves have none). */
  crawlBests?: CrawlBests;
  /** The vehicle last driven (added later; older saves mean the short-wheelbase 4WD). */
  vehicle?: VehicleId;
  /** The map being played (added later; older saves mean the High Country). */
  map?: MapId;
  /** Progress on every map played, so changing map and back keeps it. */
  maps?: Partial<Record<MapId, ExplorationState>>;
  /** Time of day and weather last chosen on the welcome screen. */
  conditions?: Conditions;
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
    const st = (data.settings ?? {}) as Partial<Settings>;
    const maps: Partial<Record<MapId, ExplorationState>> = {};
    if (data.maps && typeof data.maps === 'object')
      for (const [id, ex] of Object.entries(data.maps)) if (isMapId(id)) maps[id] = readExploration(ex);
    return {
      version: 1,
      exploration: readExploration(data.exploration),
      settings: {
        quality: st.quality === 'low' || st.quality === 'high' ? st.quality : 'medium',
        masterVolume: clamp01(st.masterVolume, defaultSettings.masterVolume),
        engineVolume: clamp01(st.engineVolume, defaultSettings.engineVolume),
        ambienceVolume: clamp01(st.ambienceVolume, defaultSettings.ambienceVolume),
        units: st.units === 'mph' ? 'mph' : 'kmh',
      },
      crawlBests: readBests(data.crawlBests),
      vehicle: isVehicleId(data.vehicle) ? data.vehicle : 'shortie',
      map: isMapId(data.map) ? data.map : 'high-country',
      maps,
      conditions: {
        time: isTimeOfDay(data.conditions?.time) ? data.conditions.time : defaultConditions.time,
        weather: isWeather(data.conditions?.weather) ? data.conditions.weather : defaultConditions.weather,
      },
    };
  } catch {
    return null;
  }
}

function readExploration(raw: unknown): ExplorationState {
  const ex = raw as Partial<ExplorationState> | null | undefined;
  return {
    discovered: Array.isArray(ex?.discovered)
      ? ex.discovered.filter((x): x is string => typeof x === 'string')
      : [],
    lastCampsite: typeof ex?.lastCampsite === 'string' ? ex.lastCampsite : '',
  };
}

/** Progress on one map: the current map's from `exploration`, any other's from `maps`. */
export function explorationFor(save: SaveData | null, map: MapId): ExplorationState | null {
  if (!save) return null;
  if ((save.map ?? 'high-country') === map) return save.exploration;
  return save.maps?.[map] ?? null;
}

function readBests(raw: unknown): CrawlBests {
  const out: CrawlBests = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const b = v as { points?: unknown; seconds?: unknown } | null;
    if (b && typeof b.points === 'number' && typeof b.seconds === 'number' && Number.isFinite(b.seconds))
      out[id] = { points: b.points, seconds: b.seconds };
  }
  return out;
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
