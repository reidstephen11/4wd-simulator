import { describe, expect, it } from 'vitest';
import {
  defaultConditions,
  environmentAt,
  environmentFor,
  lateAfternoon,
  timesOfDay,
  weathers,
  type EnvironmentConfig,
} from '../src/data/environment';
import { SurfaceId, surfaceGrip } from '../src/data/surfaces';
import { choiceFromSave } from '../src/core/launch';
import { loadRapier } from '../src/sim/physics';
import { loadSave, writeSave } from '../src/sim/save/save';
import { startCheckpoint } from '../src/sim/episode';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { vehicleLoadout } from '../src/data/vehicles';
import { MemoryStore, saveData } from './helpers/saves';
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
    // A copy, not the preset: the simulation writes the rain into the environment it is given,
    // and a storm set in test mode stayed in the shared preset, so Clear kept the rain (v0.22).
    const given = environmentFor({ time: 'afternoon', weather: 'clear' });
    expect(given).not.toBe(lateAfternoon);
    given.rain = 1;
    expect(environmentFor({ time: 'afternoon', weather: 'clear' }).rain).toBe(0);
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

  it('starts the welcome screen on the last level and vehicle, carrying on a run under way', () => {
    const s = new MemoryStore();
    const standard = ironbarkLevel.loadout;
    // Every vehicle is open (since v2.06): the saved one is kept. A playground's time and
    // weather are always picked, so with none saved the choice starts on the defaults.
    writeSave(saveData({ vehicle: 'perentie' }), s);
    expect(choiceFromSave(loadSave(s))).toEqual({
      episode: 'ironbark',
      vehicle: 'perentie',
      resume: false,
      replay: defaultConditions,
      load: vehicleLoadout(standard, 'perentie'),
    });
    expect(choiceFromSave(null)).toEqual({
      episode: 'ironbark',
      vehicle: 'shortie',
      resume: false,
      replay: defaultConditions,
      load: vehicleLoadout(standard, 'shortie'),
    });
    const checkpoint = startCheckpoint(ironbarkLevel, 'first-camp', 'shortie');
    writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint } } }), s);
    expect(choiceFromSave(loadSave(s)).resume).toBe(true);
    // The conditions picked last are kept, finished or not (a playground never is); broken
    // ones are dropped, and the choice goes back to the defaults.
    writeSave(saveData({ replay: { time: 'dusk', weather: 'rain' } }), s);
    expect(choiceFromSave(loadSave(s)).replay).toEqual({ time: 'dusk', weather: 'rain' });
    s.setItem(
      [...s.data.keys()][0],
      JSON.stringify({ version: 1, settings: {}, replay: { time: 'noon', weather: 'snow' } }),
    );
    expect(loadSave(s)!.replay).toBeNull();
    expect(choiceFromSave(loadSave(s)).replay).toEqual(defaultConditions);
    expect(weathers).toEqual(['clear', 'wet', 'rain']);
  });

  it('moves the sun with an episode’s clock: midday high in the north, dusk low in the west, then night', () => {
    const noon = environmentAt(12.5, 'clear');
    const afternoon = environmentAt(16.5, 'clear');
    const dusk = environmentAt(17.9, 'clear');
    const night = environmentAt(20, 'clear');
    expect(noon.sun.elevationDeg).toBeGreaterThan(55);
    expect(afternoon.sun.elevationDeg).toBeLessThan(noon.sun.elevationDeg);
    expect(dusk.sun.elevationDeg).toBeLessThan(10);
    expect(night.stars).toBe(1);
    // Halfway between the presets the light is halfway between them, turning the short way round.
    const mid = environmentAt(14.5, 'clear');
    expect(mid.sun.elevationDeg).toBeCloseTo((noon.sun.elevationDeg + afternoon.sun.elevationDeg) / 2, 5);
    const az = (mid.sun.azimuthDeg + 360) % 360;
    expect(az > 300 || az < 10).toBe(true);
    // The headlights light the ground from dusk, and the weather still greys the sky.
    expect(environmentAt(17.4, 'clear').lampBeams).toBe(false);
    expect(environmentAt(17.6, 'clear').lampBeams).toBe(true);
    expect(environmentAt(13, 'wet').wetness).toBeGreaterThan(0.5);
    expect(saturation(environmentAt(13, 'wet').sky.zenith)).toBeLessThan(
      saturation(environmentAt(13, 'clear').sky.zenith),
    );
  });
});
