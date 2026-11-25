import { environmentAt, type EnvironmentConfig } from './environment';
import type { WeatherTimeline } from './weatherTimeline';

/** Test mode (`?dev`): the address flag that opens it. */
export function isDevMode(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).has('dev');
}

/** Weather set by hand in test mode, instead of the episode's own. */
export interface DevWeather {
  /** Grey cloud over the sky (false: clear blue sky). */
  cloud: boolean;
  /** 0..1 how hard it rains (needs cloud). */
  rain: number;
  /** 0..1 how wet the ground is (grip follows it). */
  wetness: number;
  /** Metres the creeks and rivers stand above their own level. */
  creekRise: number;
}

/** The test panel's weather buttons, mildest first. */
export const devWeatherPresets: ReadonlyArray<{ label: string; weather: DevWeather }> = [
  { label: 'Clear', weather: { cloud: false, rain: 0, wetness: 0, creekRise: 0 } },
  { label: 'Cloudy, wet ground', weather: { cloud: true, rain: 0, wetness: 0.7, creekRise: 0 } },
  { label: 'Light rain', weather: { cloud: true, rain: 0.35, wetness: 0.85, creekRise: 0.2 } },
  { label: 'Heavy storm', weather: { cloud: true, rain: 1, wetness: 1, creekRise: 0.8 } },
];

/**
 * Creek flooding for test mode on an episode with no storm of its own: the banks are made
 * ready to take a rise this high, and the current speeds up with it.
 */
export const devFlood: WeatherTimeline = {
  rain: [],
  ground: { before: 0, soakHours: 1, dryHours: 1 },
  creeks: { risePerHour: 0, maxRise: 1.2, fallPerHour: 0, flowPerMetre: 1.5 },
  notes: [],
  forecast: '',
};

/** The light, weather and creeks for a clock time with the weather set by hand. */
export function devEnvironment(
  hour: number,
  w: DevWeather,
  flood: WeatherTimeline,
): { env: EnvironmentConfig; creekRise: number; flowScale: number } {
  const rain = w.cloud ? Math.min(1, Math.max(0, w.rain)) : 0;
  const wetness = Math.min(1, Math.max(0, w.wetness));
  const env = w.cloud ? environmentAt(hour, 'wet', { rain, wetness }) : environmentAt(hour, 'clear');
  env.wetness = wetness;
  const creekRise = Math.min(flood.creeks.maxRise, Math.max(0, w.creekRise));
  return { env, creekRise, flowScale: 1 + flood.creeks.flowPerMetre * creekRise };
}
