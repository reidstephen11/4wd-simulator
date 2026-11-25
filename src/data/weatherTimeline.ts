import { environmentAt, type EnvironmentConfig, type Weather } from './environment';

/**
 * Weather that changes during an episode: rain coming and going through the day, the
 * ground soaking it up and the creeks rising with it. An episode sets one in its
 * definition (`EpisodeDef.storm`); everything here follows from the clock alone, so a
 * camp's checkpoint (which keeps the hour) brings back the weather and the creeks as
 * they were then.
 */
export interface WeatherTimeline {
  /**
   * How hard it rains (0 = not at all, 1 = steady heavy rain) at clock times (hours),
   * blended between; before the first point and after the last it holds those values.
   */
  rain: ReadonlyArray<readonly [hour: number, amount: number]>;
  ground: {
    /** Wetness before the rain (the episode's own weather: 0.7 after rain). */
    before: number;
    /** Hours for the ground to soak up most (63%) of the way to the rain's wetness, and to dry back. */
    soakHours: number;
    dryHours: number;
  };
  creeks: {
    /**
     * Metres every creek stands above its authored level before the rain, for a track found
     * wetter than it was drawn (src/data/trackConditions.ts). 0 where absent.
     */
    standing?: number;
    /** Metres an hour the creeks rise at first in steady rain. */
    risePerHour: number;
    /** Highest they get (m above their own level): the rise slows towards it. */
    maxRise: number;
    /** Once the rain eases, the share of the rise that drains away an hour. */
    fallPerHour: number;
    /** Extra current per metre of rise, as a share of each creek's own flow. */
    flowPerMetre: number;
    /** Creeks that rise less than the rest (small ones off the hills), by id: their share of the rise. */
    shares?: Record<string, number>;
  };
  /** HUD notes at clock times (hours): the first drops, the rain easing. */
  notes: ReadonlyArray<{ hour: number; text: string }>;
  /** A few words for the menus and the loading screen ("storm from mid-afternoon"). */
  forecast: string;
}

/** The weather at one clock time. */
export interface WeatherNow {
  /** 0..1 how hard it's raining. */
  rain: number;
  /** 0..1 how wet the ground is (surface grip follows it). */
  wetness: number;
  /** Metres the creeks stand above their own level. */
  creekRise: number;
  /** Their current as a multiple of their own. */
  flowScale: number;
}

/** Steps of a game minute: cheap enough to work out from the start every few minutes. */
const STEP = 1 / 60;

export function rainAt(t: WeatherTimeline, hour: number): number {
  const r = t.rain;
  if (r.length === 0) return 0;
  if (hour <= r[0][0]) return r[0][1];
  for (let i = 1; i < r.length; i++)
    if (hour <= r[i][0]) {
      const [h0, a] = r[i - 1];
      const [h1, b] = r[i];
      return a + ((b - a) * (hour - h0)) / (h1 - h0 || 1);
    }
  return r[r.length - 1][1];
}

/**
 * The weather at a clock time: the rain from the timeline, and the ground and the creeks
 * worked out minute by minute from the first point. The ground soaks towards full wetness
 * while it rains and dries slowly after; the creeks rise while it rains, more slowly as they
 * near their highest, and fall back once it eases.
 */
export function weatherAt(t: WeatherTimeline, hour: number): WeatherNow {
  const start = t.rain[0]?.[0] ?? hour;
  const g = t.ground;
  const c = t.creeks;
  let soak = 0;
  let rise = 0;
  for (let h = start; h < hour; h += STEP) {
    const dt = Math.min(STEP, hour - h);
    const r = rainAt(t, h + dt / 2);
    soak += ((r - soak) * dt) / (r > soak ? g.soakHours : g.dryHours);
    rise += (c.risePerHour * r * (1 - rise / c.maxRise) - c.fallPerHour * rise * (1 - r)) * dt;
    rise = Math.max(0, rise);
  }
  const standing = c.standing ?? 0;
  return {
    rain: rainAt(t, hour),
    wetness: g.before + (1 - g.before) * soak,
    creekRise: standing + rise,
    flowScale: 1 + c.flowPerMetre * (standing + rise),
  };
}

/**
 * An episode's light and weather at a clock time: its own weather, with the storm (if it
 * has one) passing over, and how high and fast the creeks run.
 */
export function episodeWeatherAt(
  hour: number,
  weather: Weather,
  storm?: WeatherTimeline,
): { env: EnvironmentConfig; creekRise: number; flowScale: number } {
  if (!storm) return { env: environmentAt(hour, weather), creekRise: 0, flowScale: 1 };
  const now = weatherAt(storm, hour);
  return {
    env: environmentAt(hour, weather, { rain: now.rain, wetness: now.wetness }),
    creekRise: now.creekRise,
    flowScale: now.flowScale,
  };
}
