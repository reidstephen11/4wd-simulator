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
  /** 0 = dry. Lowers surface grip (SPEC §6.3). Fixed at 0 for v0.1. */
  wetness: number;
}

export const lateAfternoon: EnvironmentConfig = {
  sun: {
    color: '#FFD9A0',
    intensity: 2.6,
    elevationDeg: 25,
    azimuthDeg: 300,
    shadowRadius: 3,
  },
  hemisphere: { sky: '#BFD6E2', ground: '#8A6A4A', intensity: 1.15 },
  fog: {
    nearColor: '#E8CFA6',
    farColor: '#9FB4C4',
    start: 90,
    end: 2400,
    colorShiftEnd: 1100,
    maxAmount: 0.82,
  },
  sky: {
    horizon: '#F2D3A0',
    zenith: '#8DB3C9',
    sunGlow: '#FFE2B0',
    sunGlowSize: 0.12,
    groundColor: '#9FB4C4',
  },
  toneMapping: 'aces',
  exposure: 0.62,
  waterLevelOffset: 0,
  wetness: 0,
};
