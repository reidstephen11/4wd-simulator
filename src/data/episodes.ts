import type { ControlInstruction } from './controlInstructions';
import type { MapId } from './maps';
import type { Weather } from './environment';
import type { WeatherTimeline } from './weatherTimeline';
import { ironbarkLevel } from './levels/ironbark';
import type { SurpriseSetDef } from '../sim/world/surprisePlan';
import type { StrandedDef } from '../sim/stranded';
import type { SideTripDef } from '../sim/sideTrips';
import type { VehicleId } from './vehicle';
import type { TrackCondition, TrackConditionId } from './trackConditions';

/**
 * Levels. The engine is Over the Cape's, where a level is an episode of a story: its own
 * map, a mission, the conditions the story sets and a load of fuel and spares. Here every
 * level is a playground (no goal, no deadline, no fuel burnt, conditions picked on the
 * welcome screen), and the names are kept so that engine changes carry across.
 */
export type EpisodeId = 'ironbark';

/** Why an episode can end early. */
export type FailReason = 'time' | 'fuel' | 'tyre' | 'engine' | 'swept';

export interface EpisodeLoadout {
  /** Litres in the tank at the start. */
  fuel: number;
  /** Full 20 L jerry cans. */
  jerryCans: number;
  spares: number;
  /** Tyre plugs in the repair kit. */
  plugs: number;
}

/** Someone bogged off the track who'll give you something for winching them out (src/sim/stranded.ts). */
export interface StrandedDriverDef extends StrandedDef {
  look: VehicleId;
  /** Shown as they come free. */
  freed: { title: string; text: string };
}

export interface EpisodeDef {
  id: EpisodeId;
  number: number;
  title: string;
  /** From where to where, for menus. */
  route: string;
  mapId: MapId;
  /** The core mission, one line for the HUD. */
  mission: string;
  /** POI id that completes the mission (none: a playground, which never ends). */
  goal?: string;
  /** Time of day at the start (hours, 13.5 = 1:30 pm). */
  startHour: number;
  weather: Weather;
  /** Weather that changes through the run (a storm coming through), from `weather` at the start. */
  storm?: WeatherTimeline;
  /**
   * Ruts are felt as well as seen (v0.31): a wheel in one sits lower, drags and is held in it
   * (`src/data/rutFeel.ts`). Without it the ruts are only drawn.
   */
  feltRuts?: boolean;
  /**
   * Miss this and the episode ends (hours), with a label for the HUD. With `until`, it
   * only holds until that place (a POI id) is reached, and the HUD shows `mission` till then.
   */
  deadline?: {
    hour: number;
    label: string;
    until?: string;
    mission?: string;
    /** Hours after `hour` the run goes on in the dark before it fails, with no time score. */
    graceHours?: number;
    /** Shown when the deadline passes and the grace starts. */
    graceNote?: string;
  };
  /** Track ids of the climbs and descents timed end to end, with bests kept (src/sim/sectionTimes.ts). */
  timedSections?: readonly string[];
  /** Oncoming 4WDs on narrow tracks: one sets off along each the first time you reach its end. */
  traffic?: readonly { track: string; name: string; look: VehicleId }[];
  /** Drivers bogged off the track who don't have to be helped, but pay in kit if they are. */
  stranded?: readonly StrandedDriverDef[];
  /** Game seconds per real second while driving. */
  clockRate: number;
  /** Optional jobs and sightseeing stops, tracked independently of the main mission. */
  sideTrips?: readonly SideTripDef[];
  /** Fuel burnt per litre the engine really uses (the map shortens the distance). */
  fuelScale: number;
  loadout: EpisodeLoadout;
  /** One-off events on the way, placed afresh each run (a tree coming down, rocks off a bank). */
  surprises?: SurpriseSetDef;
  /**
   * This episode's own numbers for the rolled track conditions (src/data/trackConditions.ts),
   * over the shared ones: its briefing line, how far the creeks stand up or down, and so on.
   */
  conditions?: Partial<
    Record<
      TrackConditionId,
      Partial<Pick<TrackCondition, 'briefing' | 'creekRise' | 'groundBefore' | 'bogDepth' | 'storm'>>
    >
  >;
  /** A way round the main obstacle that costs score: reaching `poi` takes `penalty` points off the finish. */
  bypass?: { poi: string; penalty: number; label: string };
  /** Paragraphs shown before the episode. */
  briefing: string[];
  /** History notes shown on reaching a place (by POI id). */
  notes: Record<string, { title: string; text: string; instruction?: ControlInstruction }>;
  /** Paragraphs shown on completing the mission. */
  wrapUp: string[];
  failures: Record<FailReason, string>;
}

export const episodes: Record<EpisodeId, EpisodeDef> = {
  ironbark: ironbarkLevel,
};

export const episodeOrder: readonly EpisodeId[] = ['ironbark'];

export function isEpisodeId(x: unknown): x is EpisodeId {
  return typeof x === 'string' && x in episodes;
}

/** A level's heading: an episode of a story is numbered; a playground (no goal) is only named. */
export function levelTitle(def: Pick<EpisodeDef, 'number' | 'title' | 'goal'>): string {
  return def.goal ? `Episode ${def.number} · ${def.title}` : def.title;
}

/** Hours as a clock time: 13.25 → "1:15 pm". */
export function clockTime(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
