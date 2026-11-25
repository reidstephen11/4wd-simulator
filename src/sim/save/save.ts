import { defaultController, isControllerType, type ControllerType } from '../../data/controllers';
import {
  defaultTouchDrive,
  defaultTouchStickSide,
  isTouchDriveScheme,
  isTouchStickSide,
  type TouchDriveScheme,
  type TouchStickSide,
} from '../../data/touch';
import { defaultHudStyle, isHudStyle, type HudStyle } from '../../data/hudStyles';
import { SAVE_KEY } from '../../core/config';
import type { CrawlBests } from '../crawlRuns';
import type { Checkpoint } from '../episode';
import type { TyreFault } from '../vehicle/condition';
import type { VehicleId } from '../../data/vehicle';
import { isVehicleId } from '../../data/vehicles';
import {
  episodeOrder,
  episodes,
  isEpisodeId,
  type EpisodeId,
  type EpisodeLoadout,
} from '../../data/episodes';
import { rememberPack, type SavedPacks } from '../../data/packing';
import { isTimeOfDay, isWeather, type Conditions } from '../../data/environment';
import { isDamageMode, type DamageMode } from '../../data/damage';
import { readDeliveryState } from '../trailerState';
import { isGearboxSetting, type GearboxSetting } from '../vehicle/drivetrain';
import { defaultUiSize, isUiSize, type UiSize } from '../../data/uiSize';

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  /** Live cockpit mirror reflections. Older saves default to on. */
  mirrors: boolean;
  /** Subtle acceleration-driven movement in the driver's seat. */
  headMotion: boolean;
  controller: ControllerType;
  masterVolume: number;
  engineVolume: number;
  ambienceVolume: number;
  units: 'kmh' | 'mph';
  /** Mechanical damage, and with it how an episode can end: off, mild or realistic. */
  damage: DamageMode;
  /** How the on-screen stick drives on a phone. Missing on older saves: pedals. */
  touchDrive: TouchDriveScheme;
  /** Which side the on-screen joystick is on. Missing on older saves: left. */
  touchStickSide: TouchStickSide;
  /** How the HUD and the menus look. Missing on older saves: the dash cluster. */
  hudStyle: HudStyle;
  /**
   * Automatic or Manual (the clutch is worked for you). Controller only: without a
   * gamepad the car drives automatic. Missing on older saves: automatic; a save from
   * v1.35-v1.36 with "Manual with clutch" ('clutch') loads as Manual.
   */
  gearbox: GearboxSetting;
  /**
   * How often the picture is drawn: '60' caps it at the physics rate (the default, v1.49), and
   * 'screen' draws on every refresh of a faster screen. Missing on older saves: '60'.
   */
  frameRate: FrameRateSetting;
  /** How big the interface is drawn (src/ui/uiScale.ts). Missing on older saves: normal. */
  uiSize: UiSize;
}

export type FrameRateSetting = '60' | 'screen';

/** How far you've got in one episode. */
export interface EpisodeProgress {
  completed: boolean;
  /** Quickest finish, in minutes of driving. */
  bestMinutes?: number;
  /** Highest finish score, out of 1000 (src/sim/runScore.ts). */
  bestScore?: number;
  /** Best seconds for each timed section (src/sim/sectionTimes.ts), by track id. */
  sectionBests?: Record<string, number>;
  /** A run under way: where it restarts from (the last camp reached). */
  checkpoint?: Checkpoint | null;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  /** The vehicle last driven. */
  vehicle: VehicleId;
  /** The episode last chosen on the welcome screen. */
  episode: EpisodeId;
  episodes: Partial<Record<EpisodeId, EpisodeProgress>>;
  /** Replaying a finished episode in chosen conditions (null: the story's own). */
  replay: Conditions | null;
  /** Best scored run per crawl trail. */
  crawlBests?: CrawlBests;
  /** Loads packed by hand, per episode and vehicle (src/data/packing.ts). */
  packs?: SavedPacks;
}

export const defaultSettings: Settings = {
  quality: 'medium',
  mirrors: true,
  headMotion: true,
  controller: defaultController,
  masterVolume: 0.8,
  engineVolume: 0.8,
  ambienceVolume: 0.7,
  units: 'kmh',
  damage: 'mild',
  touchDrive: defaultTouchDrive,
  touchStickSide: defaultTouchStickSide,
  hudStyle: defaultHudStyle,
  gearbox: 'automatic',
  frameRate: '60',
  uiSize: defaultUiSize,
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

const num = (x: unknown, fallback = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : fallback;

/** Read the save; any problem (blocked storage, bad JSON, old data) gives null. */
export function loadSave(s: KeyValueStore | null = store()): SaveData | null {
  try {
    const raw = s?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return null;
    const st = (data.settings ?? {}) as Partial<Settings>;
    const episodes: Partial<Record<EpisodeId, EpisodeProgress>> = {};
    if (data.episodes && typeof data.episodes === 'object')
      for (const [id, p] of Object.entries(data.episodes))
        if (isEpisodeId(id)) episodes[id] = readProgress(p);
    const replay = data.replay as Partial<Conditions> | null | undefined;
    return {
      version: 1,
      settings: {
        controller: isControllerType(st.controller) ? st.controller : defaultController,
        quality: st.quality === 'low' || st.quality === 'high' ? st.quality : 'medium',
        mirrors: typeof st.mirrors === 'boolean' ? st.mirrors : true,
        headMotion: typeof st.headMotion === 'boolean' ? st.headMotion : true,
        masterVolume: clamp01(st.masterVolume, defaultSettings.masterVolume),
        engineVolume: clamp01(st.engineVolume, defaultSettings.engineVolume),
        ambienceVolume: clamp01(st.ambienceVolume, defaultSettings.ambienceVolume),
        units: st.units === 'mph' ? 'mph' : 'kmh',
        damage: isDamageMode(st.damage) ? st.damage : defaultSettings.damage,
        touchDrive: isTouchDriveScheme(st.touchDrive) ? st.touchDrive : defaultTouchDrive,
        touchStickSide: isTouchStickSide(st.touchStickSide) ? st.touchStickSide : defaultTouchStickSide,
        hudStyle: isHudStyle(st.hudStyle) ? st.hudStyle : defaultHudStyle,
        gearbox: isGearboxSetting(st.gearbox)
          ? st.gearbox
          : st.gearbox === 'clutch'
            ? 'manual'
            : defaultSettings.gearbox,
        frameRate: st.frameRate === 'screen' ? 'screen' : '60',
        uiSize: isUiSize(st.uiSize) ? st.uiSize : defaultUiSize,
      },
      vehicle: isVehicleId(data.vehicle) ? data.vehicle : 'shortie',
      episode: isEpisodeId(data.episode) ? data.episode : episodeOrder[0],
      episodes,
      replay:
        replay && isTimeOfDay(replay.time) && isWeather(replay.weather)
          ? { time: replay.time, weather: replay.weather }
          : null,
      crawlBests: readBests(data.crawlBests),
      packs: readPacks(data.packs, isEpisodeId(data.episode) ? data.episode : episodeOrder[0]),
    };
  } catch {
    return null;
  }
}

function readProgress(raw: unknown): EpisodeProgress {
  const p = (raw ?? {}) as Partial<EpisodeProgress>;
  const best = num(p.bestMinutes, NaN);
  const score = num(p.bestScore, NaN);
  return {
    completed: p.completed === true,
    ...(Number.isFinite(best) ? { bestMinutes: best } : {}),
    ...(Number.isFinite(score) ? { bestScore: score } : {}),
    ...(p.sectionBests && typeof p.sectionBests === 'object'
      ? {
          sectionBests: Object.fromEntries(
            Object.entries(p.sectionBests).filter(([, v]) => typeof v === 'number' && v > 0),
          ),
        }
      : {}),
    checkpoint: readCheckpoint(p.checkpoint),
  };
}

const faults: readonly TyreFault[] = ['none', 'puncture', 'sidewall', 'rim'];

function readCheckpoint(raw: unknown): Checkpoint | null {
  const c = raw as Partial<Checkpoint> | null | undefined;
  if (!c || typeof c.camp !== 'string') return null;
  const four = <T>(arr: unknown, ok: (x: unknown) => x is T, fallback: T): T[] =>
    [0, 1, 2, 3].map((i) => (Array.isArray(arr) && ok(arr[i]) ? arr[i] : fallback));
  return {
    camp: c.camp,
    ...(c.transfer &&
    isVehicleId(c.transfer.vehicle) &&
    ['2H', '4H', '4L'].includes(c.transfer.mode) &&
    typeof c.transfer.hubsLocked === 'boolean' &&
    typeof c.transfer.centreLocked === 'boolean'
      ? {
          transfer: {
            vehicle: c.transfer.vehicle,
            mode: c.transfer.mode,
            hubsLocked: c.transfer.hubsLocked,
            centreLocked: c.transfer.centreLocked,
          },
        }
      : {}),
    hour: num(c.hour, 12),
    elapsed: Math.max(0, num(c.elapsed)),
    fuel: Math.max(0, num(c.fuel)),
    jerryCans: Math.max(0, Math.round(num(c.jerryCans))),
    spares: Math.max(0, Math.round(num(c.spares))),
    plugs: Math.max(0, Math.round(num(c.plugs))),
    tyres: four(c.tyres, (x): x is number => typeof x === 'number' && Number.isFinite(x), 1).map((h) =>
      Math.min(1, Math.max(0, h)),
    ),
    tyreFault: four(c.tyreFault, (x): x is TyreFault => faults.includes(x as TyreFault), 'none'),
    ...([18, 24, 36].includes(c.tyrePressurePsi as number) ? { tyrePressurePsi: c.tyrePressurePsi } : {}),
    discovered: strings(c.discovered),
    // Saves from before v0.09 have none.
    taken: strings(c.taken),
    // Saves from before surprises: any fixed seed keeps a restart the same as the run.
    seed: Math.max(1, Math.floor(Math.abs(num(c.seed, 1)))),
    surprises: strings(c.surprises),
    // `rescued` (the stockman of the removed Episode 3) is ignored in older saves.
    ...(Array.isArray(c.sideTrips) ? { sideTrips: strings(c.sideTrips) } : {}),
    ...(Array.isArray(c.stranded) ? { stranded: strings(c.stranded) } : {}),
    ...(c.delivery ? { delivery: readDeliveryState(c.delivery) } : {}),
    ...(c.packed ? { packed: readLoad(c.packed) } : {}),
    ...(typeof c.seen === 'string' ? { seen: c.seen } : {}),
    ...(c.supply === true ? { supply: true } : {}),
    ...(c.winched === true ? { winched: true } : {}),
  };
}

function readLoad(raw: unknown): EpisodeLoadout {
  const l = (raw ?? {}) as Partial<EpisodeLoadout>;
  const count = (x: unknown) => Math.max(0, Math.round(num(x)));
  return {
    fuel: Math.max(0, num(l.fuel)),
    jerryCans: count(l.jerryCans),
    spares: count(l.spares),
    plugs: count(l.plugs),
  };
}

/**
 * Packs by episode, then vehicle. Saves before v2.23 kept one load per vehicle, whichever
 * episode it was last used on (the standard load included): such a load is kept for the
 * episode last played, and only if it is not that episode's standard load.
 */
function readPacks(raw: unknown, lastEpisode: EpisodeId): SavedPacks {
  let out: SavedPacks = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isEpisodeId(key)) {
      if (!value || typeof value !== 'object') continue;
      for (const [id, l] of Object.entries(value as Record<string, unknown>))
        if (isVehicleId(id)) out = rememberPack(out, key, episodes[key].loadout, id, readLoad(l));
    } else if (isVehicleId(key))
      out = rememberPack(out, lastEpisode, episodes[lastEpisode].loadout, key, readLoad(value));
  }
  return out;
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

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
