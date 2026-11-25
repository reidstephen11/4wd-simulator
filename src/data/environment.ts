/**
 * Environment config (SPEC §4, §11). Every light, sky, fog and water value lives
 * here so time of day and weather can drive them later.
 */
export interface EnvironmentConfig {
  sun: {
    color: string;
    intensity: number;
    /** Degrees above the horizon. */
    elevationDeg: number;
    /** Compass bearing the light comes from (0 = north, 90 = east). */
    azimuthDeg: number;
    shadowRadius: number;
  };
  hemisphere: { sky: string; ground: string; intensity: number };
  fog: {
    nearColor: string;
    farColor: string;
    /** Distance where haze starts. */
    start: number;
    /** Distance where haze reaches `maxAmount`. */
    end: number;
    /** Distance over which the colour shifts from near (warm) to far (blue). */
    colorShiftEnd: number;
    maxAmount: number;
  };
  sky: {
    horizon: string;
    zenith: string;
    sunGlow: string;
    sunGlowSize: number;
    groundColor: string;
  };
  toneMapping: 'aces' | 'agx';
  exposure: number;
  /** Global offset added to every water volume (SPEC §11: a single creek level parameter). */
  waterLevelOffset: number;
  /** 0 = dry. Lowers surface grip (SPEC §6.3), darkens the ground and settles the dust. */
  wetness: number;
  /** 0 = none, 1 = steady rain falling. */
  rain: number;
  /**
   * Dark enough for the headlights to light the ground (dusk and night). In daylight the
   * lamps only glow, which keeps their lights out of the scene and its cost.
   */
  lampBeams: boolean;
  /** 0..1 how bright the stars are (night only). */
  stars: number;
  /** Cloud brightness against a midday sky (1 = white cloud). */
  cloudLight: number;
}

export const lateAfternoon: EnvironmentConfig = {
  sun: {
    color: '#FFD9A0',
    intensity: 3.1,
    elevationDeg: 25,
    azimuthDeg: 300,
    shadowRadius: 3,
  },
  hemisphere: { sky: '#BFD6E2', ground: '#8A7961', intensity: 1.8 },
  fog: {
    nearColor: '#DBD1B8',
    farColor: '#A5BAC8',
    start: 140,
    end: 2400,
    colorShiftEnd: 1100,
    maxAmount: 0.82,
  },
  sky: {
    horizon: '#E6D7B8',
    zenith: '#7EACC8',
    sunGlow: '#FFE2B0',
    sunGlowSize: 0.025,
    groundColor: '#9FB4C4',
  },
  toneMapping: 'aces',
  exposure: 0.74,
  waterLevelOffset: 0,
  wetness: 0,
  rain: 0,
  lampBeams: false,
  stars: 0,
  cloudLight: 1,
};

/** The light the welcome screen offers. */
export type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';
/** Clear and dry, overcast after rain (wet ground), or raining. */
export type Weather = 'clear' | 'wet' | 'rain';
export interface Conditions {
  time: TimeOfDay;
  weather: Weather;
}
export const defaultConditions: Conditions = { time: 'afternoon', weather: 'clear' };
export const timesOfDay: readonly TimeOfDay[] = ['morning', 'midday', 'afternoon', 'dusk', 'night'];
export const weathers: readonly Weather[] = ['clear', 'wet', 'rain'];
export const timeLabels: Record<TimeOfDay, string> = {
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Late afternoon',
  dusk: 'Dusk',
  night: 'Night',
};
export const weatherLabels: Record<Weather, string> = {
  clear: 'Clear',
  wet: 'After rain',
  rain: 'Raining',
};

export const isTimeOfDay = (x: unknown): x is TimeOfDay => timesOfDay.includes(x as TimeOfDay);
export const isWeather = (x: unknown): x is Weather => weathers.includes(x as Weather);

/**
 * Clear-sky light for each time of day. The sun's bearing is from the north (Australia):
 * morning light comes from the east-north-east, midday from high in the north, late
 * afternoon from the west-north-west and dusk low in the west. At night the "sun" is a
 * high moon in the north-east: faint blue light, soft shadows and stars.
 */
const clearSkies: Record<TimeOfDay, EnvironmentConfig> = {
  morning: {
    ...lateAfternoon,
    sun: { color: '#FFE6C4', intensity: 2.9, elevationDeg: 18, azimuthDeg: 70, shadowRadius: 3 },
    hemisphere: { sky: '#C3D7E6', ground: '#857865', intensity: 1.75 },
    fog: { ...lateAfternoon.fog, nearColor: '#DAD6CB', farColor: '#A9BED0', start: 120 },
    sky: {
      horizon: '#E8DCC6',
      zenith: '#82B2D2',
      sunGlow: '#FFEBC8',
      sunGlowSize: 0.03,
      groundColor: '#A3B8C8',
    },
    exposure: 0.76,
  },
  midday: {
    ...lateAfternoon,
    sun: { color: '#FFF5E6', intensity: 3.0, elevationDeg: 62, azimuthDeg: 5, shadowRadius: 2 },
    hemisphere: { sky: '#C8DCEA', ground: '#8C7C64', intensity: 1.7 },
    fog: { ...lateAfternoon.fog, nearColor: '#D9D8D0', farColor: '#AFC3D2', start: 160 },
    sky: {
      horizon: '#DCE4E6',
      zenith: '#5E9BCA',
      sunGlow: '#FFF6E2',
      sunGlowSize: 0.02,
      groundColor: '#A6BCCB',
    },
    exposure: 0.66,
  },
  afternoon: lateAfternoon,
  dusk: {
    ...lateAfternoon,
    sun: { color: '#FFAE6E', intensity: 2.3, elevationDeg: 6, azimuthDeg: 285, shadowRadius: 4 },
    hemisphere: { sky: '#A4B4C8', ground: '#6E5E4E', intensity: 1.35 },
    fog: { ...lateAfternoon.fog, nearColor: '#D9B89C', farColor: '#8094AE', start: 110, maxAmount: 0.86 },
    sky: {
      horizon: '#F0B88C',
      zenith: '#506F98',
      sunGlow: '#FFC488',
      sunGlowSize: 0.06,
      groundColor: '#8094AE',
    },
    exposure: 0.82,
    lampBeams: true,
  },
  night: {
    ...lateAfternoon,
    sun: { color: '#A9BEE6', intensity: 0.42, elevationDeg: 40, azimuthDeg: 35, shadowRadius: 5 },
    hemisphere: { sky: '#33476B', ground: '#1C1B1D', intensity: 0.42 },
    fog: {
      nearColor: '#18202E',
      farColor: '#1E283A',
      start: 50,
      end: 1500,
      colorShiftEnd: 800,
      maxAmount: 0.92,
    },
    sky: {
      horizon: '#1E2A40',
      zenith: '#070C18',
      sunGlow: '#C9D6F2',
      sunGlowSize: 0.008,
      groundColor: '#161E2C',
    },
    exposure: 0.95,
    lampBeams: true,
    stars: 1,
    cloudLight: 0.14,
  },
};

/** How far a weather turns the sky grey, and what it does to the ground and creek. */
interface WeatherEffect {
  grey: number;
  /** How dark the cloud is (1 = bright overcast). */
  dark: number;
  sun: number;
  shadowRadius: number;
  fog: { start: number; end: number; maxAmount: number };
  wetness: number;
  rain: number;
  waterLevelOffset: number;
}

const weatherEffects: Record<Weather, WeatherEffect> = {
  clear: {
    grey: 0,
    dark: 1,
    sun: 1,
    shadowRadius: 0,
    fog: { start: 1, end: 1, maxAmount: 0 },
    wetness: 0,
    rain: 0,
    waterLevelOffset: 0,
  },
  wet: {
    grey: 0.7,
    dark: 1,
    sun: 0.32,
    shadowRadius: 9,
    fog: { start: 0.6, end: 0.65, maxAmount: 0.04 },
    wetness: 0.7,
    rain: 0,
    waterLevelOffset: 0.05,
  },
  rain: {
    grey: 0.88,
    dark: 0.8,
    sun: 0.16,
    shadowRadius: 12,
    fog: { start: 0.3, end: 0.3, maxAmount: 0.1 },
    wetness: 1,
    rain: 1,
    waterLevelOffset: 0.12,
  },
};

/** Overcast greys the colours are drawn towards, at midday brightness. */
const OVERCAST = {
  sun: '#E6E7E6',
  hemiSky: '#BCC3C8',
  hemiGround: '#6F6A60',
  fogNear: '#C3C7C8',
  fogFar: '#9DA8B1',
  horizon: '#C4C9CC',
  zenith: '#8E9AA5',
  sunGlow: '#D8DADB',
};

function mixHex(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1), 16),
    cb = parseInt(b.slice(1), 16);
  const ch = (c: number, k: number) => (c >> k) & 255;
  const out = [16, 8, 0].map((k) => Math.round(ch(ca, k) + (ch(cb, k) - ch(ca, k)) * t));
  return `#${out
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Scale a colour's brightness, keeping its hue. */
function shadeHex(a: string, k: number): string {
  return mixHex('#000000', a, Math.min(1, Math.max(0, k)));
}

/**
 * The environment for a time of day and weather: the clear-sky light for the time,
 * turned towards overcast greys (darker towards dusk), with weaker, softer sunlight,
 * nearer haze, wet ground and falling rain as the weather says.
 */
export function environmentFor(c: Conditions): EnvironmentConfig {
  return withWeather(clearSkies[c.time], c.weather, c.time === 'night');
}

/**
 * The light at a clock time (hours), for an episode's moving sun: the clear-sky presets
 * pinned to the hour they show and blended between, then the weather on top.
 */
export const presetHours: ReadonlyArray<readonly [number, TimeOfDay]> = [
  [7.75, 'morning'],
  [12.5, 'midday'],
  [16.5, 'afternoon'],
  [17.9, 'dusk'],
  [19, 'night'],
];

/** The headlights light the ground from this hour (dusk coming on). */
export const lampBeamsFromHour = 17.5;

/**
 * A storm passing over (src/data/weatherTimeline.ts): how hard it is raining (0..1),
 * which turns the sky from the after-rain overcast to the raining one, and how wet the
 * ground is. The creek level offset stays the after-rain one: the puddles were laid for
 * it, and the storm raises the creeks on their own.
 */
export interface Storm {
  rain: number;
  wetness: number;
}

export function environmentAt(hour: number, weather: Weather, storm?: Storm): EnvironmentConfig {
  const h = Math.min(presetHours[presetHours.length - 1][0], Math.max(presetHours[0][0], hour));
  let i = 0;
  while (i < presetHours.length - 2 && h > presetHours[i + 1][0]) i++;
  const [h0, a] = presetHours[i];
  const [h1, b] = presetHours[i + 1];
  const t = (h - h0) / (h1 - h0);
  const base = blendEnvironment(clearSkies[a], clearSkies[b], t);
  base.lampBeams = hour >= lampBeamsFromHour;
  const night = hour >= presetHours[presetHours.length - 1][0] - 0.25;
  if (!storm) return withWeather(base, weather, night);
  const w = weatherEffects.wet;
  const r = weatherEffects.rain;
  const k = Math.min(1, Math.max(0, storm.rain));
  const n = (a: number, b: number) => a + (b - a) * k;
  return withEffect(
    base,
    {
      grey: n(w.grey, r.grey),
      dark: n(w.dark, r.dark),
      sun: n(w.sun, r.sun),
      shadowRadius: n(w.shadowRadius, r.shadowRadius),
      fog: {
        start: n(w.fog.start, r.fog.start),
        end: n(w.fog.end, r.fog.end),
        maxAmount: n(w.fog.maxAmount, r.fog.maxAmount),
      },
      wetness: storm.wetness,
      rain: k,
      waterLevelOffset: w.waterLevelOffset,
    },
    night,
  );
}

function blendEnvironment(a: EnvironmentConfig, b: EnvironmentConfig, t: number): EnvironmentConfig {
  const n = (x: number, y: number) => x + (y - x) * t;
  const c = (x: string, y: string) => mixHex(x, y, t);
  // Bearings go the short way round (north-east moon to west-north-west sun).
  const turn = ((((b.sun.azimuthDeg - a.sun.azimuthDeg) % 360) + 540) % 360) - 180;
  return {
    sun: {
      color: c(a.sun.color, b.sun.color),
      intensity: n(a.sun.intensity, b.sun.intensity),
      elevationDeg: n(a.sun.elevationDeg, b.sun.elevationDeg),
      azimuthDeg: (a.sun.azimuthDeg + turn * t + 360) % 360,
      shadowRadius: n(a.sun.shadowRadius, b.sun.shadowRadius),
    },
    hemisphere: {
      sky: c(a.hemisphere.sky, b.hemisphere.sky),
      ground: c(a.hemisphere.ground, b.hemisphere.ground),
      intensity: n(a.hemisphere.intensity, b.hemisphere.intensity),
    },
    fog: {
      nearColor: c(a.fog.nearColor, b.fog.nearColor),
      farColor: c(a.fog.farColor, b.fog.farColor),
      start: n(a.fog.start, b.fog.start),
      end: n(a.fog.end, b.fog.end),
      colorShiftEnd: n(a.fog.colorShiftEnd, b.fog.colorShiftEnd),
      maxAmount: n(a.fog.maxAmount, b.fog.maxAmount),
    },
    sky: {
      horizon: c(a.sky.horizon, b.sky.horizon),
      zenith: c(a.sky.zenith, b.sky.zenith),
      sunGlow: c(a.sky.sunGlow, b.sky.sunGlow),
      sunGlowSize: n(a.sky.sunGlowSize, b.sky.sunGlowSize),
      groundColor: c(a.sky.groundColor, b.sky.groundColor),
    },
    toneMapping: a.toneMapping,
    exposure: n(a.exposure, b.exposure),
    waterLevelOffset: n(a.waterLevelOffset, b.waterLevelOffset),
    wetness: n(a.wetness, b.wetness),
    rain: n(a.rain, b.rain),
    lampBeams: t < 0.5 ? a.lampBeams : b.lampBeams,
    stars: n(a.stars, b.stars),
    cloudLight: n(a.cloudLight, b.cloudLight),
  };
}

function withWeather(base: EnvironmentConfig, weather: Weather, night: boolean): EnvironmentConfig {
  return weather === 'clear' ? base : withEffect(base, weatherEffects[weather], night);
}

function withEffect(base: EnvironmentConfig, w: WeatherEffect, night: boolean): EnvironmentConfig {
  // Grey overcast is darker the lower the sun is, and darkest at night under the moon.
  const light = night ? 0.13 : 0.55 + 0.45 * Math.min(1, Math.max(0, base.sun.elevationDeg) / 40);
  const g = w.grey;
  const grey = (from: string, to: string) => mixHex(from, shadeHex(to, light * w.dark), g);
  return {
    ...base,
    sun: {
      ...base.sun,
      color: grey(base.sun.color, OVERCAST.sun),
      intensity: base.sun.intensity * w.sun,
      shadowRadius: base.sun.shadowRadius + w.shadowRadius,
    },
    hemisphere: {
      sky: grey(base.hemisphere.sky, OVERCAST.hemiSky),
      ground: grey(base.hemisphere.ground, OVERCAST.hemiGround),
      // Cloud scatters the light it takes from the sun.
      intensity: base.hemisphere.intensity * (1 + 0.25 * g),
    },
    fog: {
      ...base.fog,
      nearColor: grey(base.fog.nearColor, OVERCAST.fogNear),
      farColor: grey(base.fog.farColor, OVERCAST.fogFar),
      start: base.fog.start * w.fog.start,
      end: base.fog.end * w.fog.end,
      maxAmount: Math.min(0.95, base.fog.maxAmount + w.fog.maxAmount),
    },
    sky: {
      ...base.sky,
      horizon: grey(base.sky.horizon, OVERCAST.horizon),
      zenith: grey(base.sky.zenith, OVERCAST.zenith),
      sunGlow: grey(base.sky.sunGlow, OVERCAST.sunGlow),
      sunGlowSize: base.sky.sunGlowSize * (1 - g * 0.8),
      groundColor: grey(base.sky.groundColor, OVERCAST.fogFar),
    },
    exposure: base.exposure * (1 + 0.12 * g),
    waterLevelOffset: base.waterLevelOffset + w.waterLevelOffset,
    wetness: w.wetness,
    rain: w.rain,
    // Overcast hides the stars.
    stars: 0,
  };
}

/**
 * Puddles on the dirt and gravel tracks when it's wet (src/sim/world/puddles.ts):
 * shallow dips in the wheel tracks that hold water, more and deeper while it rains.
 */
export const puddleTuning = {
  /** Metres between chances of a puddle along a track, and the chance of one there. */
  wet: { spacing: 24, chance: 0.6, depth: 0.08 },
  rain: { spacing: 18, chance: 0.85, depth: 0.12 },
  /** Size along and across the track (m). */
  length: [2.4, 5.5] as const,
  width: [1.6, 3.0] as const,
  /** Water doesn't lie on steeper track than this (rise per metre). */
  maxGrade: 0.04,
  /** Keep this far (m) from the ends of a track, its junctions and the creek. */
  clearEnds: 6,
  clearCreek: 8,
  /** ...and this far (m) beyond the edge of a park station's obstacle line. */
  clearLines: 4,
};
