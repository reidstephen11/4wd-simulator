import { describe, expect, it } from 'vitest';
import { devEnvironment, devFlood, devWeatherPresets, isDevMode } from '../src/data/devWeather';
import { EpisodeRun } from '../src/sim/episode';
import { storyLevel } from './fixtures/story';

describe('test mode', () => {
  it('opens only with ?dev in the address', () => {
    expect(isDevMode('?dev')).toBe(true);
    expect(isDevMode('?debug&dev')).toBe(true);
    expect(isDevMode('?debug')).toBe(false);
    expect(isDevMode('')).toBe(false);
  });

  it('sets the rain, the ground and the rivers as asked', () => {
    const storm = devWeatherPresets.find((p) => p.label === 'Heavy storm')?.weather;
    if (!storm) throw new Error('no storm preset');
    const w = devEnvironment(15, storm, devFlood);
    expect(w.env.rain).toBe(1);
    expect(w.env.wetness).toBe(1);
    expect(w.creekRise).toBeCloseTo(storm.creekRise);
    expect(w.flowScale).toBeGreaterThan(1);
    const clear = devEnvironment(15, devWeatherPresets[0].weather, devFlood);
    expect(clear.env.rain).toBe(0);
    expect(clear.env.wetness).toBe(0);
    expect(clear.creekRise).toBe(0);
    expect(clear.flowScale).toBe(1);
  });

  it('keeps rain off under a clear sky and the rivers within what the banks allow', () => {
    const w = devEnvironment(12, { cloud: false, rain: 1, wetness: 0.5, creekRise: 9 }, devFlood);
    expect(w.env.rain).toBe(0);
    expect(w.env.wetness).toBe(0.5);
    expect(w.creekRise).toBe(devFlood.creeks.maxRise);
  });

  it('can stop the clock and lift the time limit', () => {
    const run = new EpisodeRun(storyLevel, { hour: 10, elapsed: 0 }, true);
    run.clockStopped = true;
    run.tick(600);
    expect(run.hour).toBe(10);
    run.noTimeLimit = true;
    run.hour = 40;
    expect(run.hoursLeft()).toBe(Infinity);
  });
});
