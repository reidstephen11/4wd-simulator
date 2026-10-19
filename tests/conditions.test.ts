import { describe, expect, it } from 'vitest';
import {
  environmentFor,
  lateAfternoon,
  timesOfDay,
  weathers,
  type EnvironmentConfig,
} from '../src/data/environment';
import { SurfaceId, surfaceGrip } from '../src/data/surfaces';
import { choiceFromSave } from '../src/core/launch';
import { loadRapier } from '../src/sim/physics';
import { defaultSettings, loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { Simulation } from '../src/sim/sim';
import { testWorld } from './world';

const brightness = (hex: string) => {
  const c = parseInt(hex.slice(1), 16);
  return ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
};
const saturation = (hex: string) => {
  const c = parseInt(hex.slice(1), 16);
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  return Math.max(...ch) - Math.min(...ch);
};

describe('time of day and weather', () => {
  it('keeps late afternoon in clear weather exactly as it was', () => {
    expect(environmentFor({ time: 'afternoon', weather: 'clear' })).toEqual(lateAfternoon);
  });

  it('puts the sun where it is in Australia at each time of day', () => {
    const sun = (time: (typeof timesOfDay)[number]) => environmentFor({ time, weather: 'clear' }).sun;
    expect(sun('morning').azimuthDeg).toBeGreaterThan(45);
    expect(sun('morning').azimuthDeg).toBeLessThan(110);
    expect(sun('midday').elevationDeg).toBeGreaterThan(50);
    expect(Math.min(sun('midday').azimuthDeg, 360 - sun('midday').azimuthDeg)).toBeLessThan(30);
    expect(sun('afternoon').azimuthDeg).toBeGreaterThan(250);
    expect(sun('dusk').elevationDeg).toBeLessThan(10);
    expect(sun('dusk').elevationDeg).toBeLessThan(sun('afternoon').elevationDeg);
  });

  it('greys the sky, dims and softens the sun, wets the ground and raises the creek in bad weather', () => {
    for (const time of timesOfDay) {
      const clear = environmentFor({ time, weather: 'clear' });
      const wet = environmentFor({ time, weather: 'wet' });
      const rain = environmentFor({ time, weather: 'rain' });
      const hex = (e: EnvironmentConfig) => [e.sky.zenith, e.sky.horizon, e.fog.nearColor, e.sun.color];
      for (const c of [...hex(clear), ...hex(wet), ...hex(rain)]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
      expect(saturation(wet.sky.zenith)).toBeLessThan(saturation(clear.sky.zenith));
      expect(brightness(rain.sky.zenith)).toBeLessThanOrEqual(brightness(wet.sky.zenith));
      expect(rain.sun.intensity).toBeLessThan(wet.sun.intensity);
      expect(wet.sun.intensity).toBeLessThan(clear.sun.intensity * 0.5);
      expect(wet.sun.shadowRadius).toBeGreaterThan(clear.sun.shadowRadius);
      expect(rain.fog.end).toBeLessThan(clear.fog.end);
      expect([clear.wetness, wet.wetness, rain.wetness]).toEqual([0, 0.7, 1]);
      expect([clear.rain, wet.rain, rain.rain]).toEqual([0, 0, 1]);
      expect(rain.waterLevelOffset).toBeGreaterThan(wet.waterLevelOffset);
    }
  });

  it('gives wet tracks less grip, and the simulation uses the weather it was given', async () => {
    const rain = environmentFor({ time: 'midday', weather: 'rain' });
    expect(surfaceGrip(SurfaceId.Dirt, rain.wetness)).toBeLessThan(0.7);
    expect(surfaceGrip(SurfaceId.Rock, rain.wetness)).toBeLessThan(0.7);
    const sim = new Simulation(await loadRapier(), testWorld(), rain);
    const v = sim.addVehicle('p', sim.campsitePose(testWorld().map.spawnCampsite));
    expect(v.env.wetness).toBe(1);
    expect(v.env.waterLevelOffset).toBeCloseTo(0.12);
    sim.physics.free();
  });

  it('remembers the welcome screen’s choices, and falls back for older or broken saves', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const exploration = { discovered: [], lastCampsite: '' };
    writeSave(
      {
        version: 1,
        exploration,
        settings: defaultSettings,
        map: 'ironbark-park',
        vehicle: 'perentie',
        conditions: { time: 'dusk', weather: 'rain' },
      },
      s,
    );
    expect(choiceFromSave(loadSave(s))).toEqual({
      map: 'ironbark-park',
      vehicle: 'perentie',
      conditions: { time: 'dusk', weather: 'rain' },
    });
    expect(choiceFromSave(null)).toEqual({
      map: 'high-country',
      vehicle: 'shortie',
      conditions: { time: 'afternoon', weather: 'clear' },
    });
    const [key] = [...data.keys()];
    data.set(
      key,
      JSON.stringify({
        version: 1,
        exploration,
        settings: {},
        conditions: { time: 'noon', weather: 'snow' },
      }),
    );
    expect(loadSave(s)!.conditions).toEqual({ time: 'afternoon', weather: 'clear' });
    expect(weathers).toEqual(['clear', 'wet', 'rain']);
  });
});
