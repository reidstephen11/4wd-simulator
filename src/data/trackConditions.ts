import { mulberry32 } from '../sim/world/rng';
import type { MapDef } from '../sim/world/mapTypes';
import type { WeatherTimeline } from './weatherTimeline';

/**
 * How the track is found on the day. The CREB closes in the wet and reopens about April,
 * so a June run can meet it anywhere from greasy and half-healed to dusty and hard: the
 * same track, in a different state. One is rolled from the run's seed, so a restart from
 * a camp (which keeps the seed) finds the track as it was, and `?seed=N` repeats a day.
 *
 * Everything scales off `reopened`, which is the track as the game had it before this:
 * the authored creek levels, bog depths and the storm in `crebWeather.ts` are its numbers,
 * so that roll plays exactly as v1.32 did.
 */
export type TrackConditionId = 'dry' | 'reopened' | 'wet';

export interface TrackCondition {
  id: TrackConditionId;
  /** For the briefing's conditions line. */
  label: string;
  /** A sentence for the briefing, in the owner's voice. */
  briefing: string;
  /** Ground wetness before the rain, replacing the storm's own `ground.before`. */
  groundBefore: number;
  /** Metres every creek stands above its authored level before the rain. */
  creekRise: number;
  /** Bog and sump depths scale by this. */
  bogDepth: number;
  /** The storm's rain, and the rise it brings, scale by this. */
  storm: number;
}

/**
 * The three states, and how often each comes up. Weighted towards `reopened` because that
 * is what June usually is; `dry` is a late, hard-packed opening and `wet` an early one with
 * the creeks still carrying water off the range.
 */
export const trackConditions: readonly (TrackCondition & { weight: number })[] = [
  {
    id: 'dry',
    label: 'Dry',
    briefing:
      'The track has been open a while and dried out hard: the clay holds, the bogs have shrunk back and the creeks are down. The storm will still find you in the afternoon.',
    groundBefore: 0.25,
    creekRise: 0,
    bogDepth: 0.55,
    storm: 0.65,
    weight: 0.3,
  },
  {
    id: 'reopened',
    label: 'Just reopened',
    briefing:
      'The track has just reopened after the wet and it rained overnight: the clay is greasy, the bogs are still soft and the creeks are up a little.',
    groundBefore: 0.7,
    creekRise: 0,
    bogDepth: 1,
    storm: 1,
    weight: 0.4,
  },
  {
    id: 'wet',
    label: 'Wet',
    briefing:
      'It reopened early and the range is still letting go of the wet: the clay is slick, the bogs are deep and every creek is running. The storm on top of this will be the worst of the day.',
    groundBefore: 0.9,
    creekRise: 0.12,
    bogDepth: 1.35,
    storm: 1.3,
    weight: 0.3,
  },
];

export const isTrackConditionId = (x: unknown): x is TrackConditionId =>
  trackConditions.some((c) => c.id === x);

export const conditionById = (id: TrackConditionId): TrackCondition =>
  trackConditions.find((c) => c.id === id) ?? trackConditions[1];

/** A condition with an episode's own numbers for it laid over the shared ones. */
export function conditionFor(
  condition: TrackCondition,
  own?: Partial<Record<TrackConditionId, Partial<TrackCondition>>>,
): TrackCondition {
  const o = own?.[condition.id];
  return o ? { ...condition, ...o } : condition;
}

/** The condition for a run's seed. The same seed always gives the same day. */
export function rollTrackCondition(seed: number): TrackCondition {
  // A seed of its own, so adding or moving a surprise does not change the weather.
  const roll = mulberry32((Math.floor(Math.abs(seed)) || 1) * 2654435761 + 101)();
  const total = trackConditions.reduce((t, c) => t + c.weight, 0);
  let at = roll * total;
  for (const c of trackConditions) {
    at -= c.weight;
    if (at < 0) return c;
  }
  return trackConditions[trackConditions.length - 1];
}

/**
 * The storm as this condition meets it: the same shape of afternoon, wetter or drier. The
 * rain is scaled (and capped at steady heavy rain), the ground starts where the condition
 * says, and the creeks stand a little higher and rise further in the wet.
 */
export function stormFor(base: WeatherTimeline, condition: TrackCondition): WeatherTimeline;
export function stormFor(base: undefined, condition: TrackCondition): undefined;
export function stormFor(
  base: WeatherTimeline | undefined,
  condition: TrackCondition,
): WeatherTimeline | undefined;
export function stormFor(
  base: WeatherTimeline | undefined,
  condition: TrackCondition,
): WeatherTimeline | undefined {
  if (!base) return undefined;
  const s = condition.storm;
  // A condition that changes nothing hands back the very same storm, so the just-reopened
  // roll is the game exactly as it was before track conditions.
  if (s === 1 && condition.creekRise === 0 && condition.groundBefore === base.ground.before) return base;
  return {
    ...base,
    rain: base.rain.map(([hour, amount]) => [hour, Math.min(1, amount * s)] as const),
    ground: { ...base.ground, before: condition.groundBefore },
    creeks: {
      ...base.creeks,
      standing: (base.creeks.standing ?? 0) + condition.creekRise,
      risePerHour: base.creeks.risePerHour * s,
      maxRise: base.creeks.maxRise * s,
    },
  };
}

/**
 * The map with this condition's bogs: the hollows are in the same places, dug deeper or
 * shallower. Only the bog depths change, so the tracks, creeks and everything built from
 * them stay where they are.
 */
export function mapForCondition(map: MapDef, condition: TrackCondition): MapDef {
  if (condition.bogDepth === 1) return map;
  const scale = condition.bogDepth;
  return {
    ...map,
    tracks: map.tracks.map((t) =>
      t.rough && (t.rough.bogDepth !== undefined || t.rough.sumpDepth !== undefined)
        ? {
            ...t,
            rough: {
              ...t.rough,
              ...(t.rough.bogDepth !== undefined ? { bogDepth: t.rough.bogDepth * scale } : {}),
              ...(t.rough.sumpDepth !== undefined ? { sumpDepth: t.rough.sumpDepth * scale } : {}),
            },
          }
        : t,
    ),
  };
}
