import { describe, expect, it } from 'vitest';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { benchLine, benchSteps, benchViews } from '../src/debug/bench';
import { ironbarkWorld } from './world';

/** The phone's headroom test (`?bench`, v0.23). */
describe('the phone headroom test', () => {
  it('parks at three places on dry ground inside the level', () => {
    const t = ironbarkWorld().terrain;
    expect(benchViews.length).toBe(3);
    for (const v of benchViews) {
      expect(Math.abs(v.x), v.name).toBeLessThan(ironbarkMap.wall[0] - 10);
      expect(Math.abs(v.z), v.name).toBeLessThan(ironbarkMap.wall[1] - 10);
      expect(t.waterDepthAt(v.x, v.z), v.name).toBe(0);
    }
  });

  it('times every view as it is played first, then with more load', () => {
    for (let view = 0; view < benchViews.length; view++) {
      const steps = benchSteps.filter((s) => s.view === view);
      expect(steps[0], benchViews[view].name).toMatchObject({
        quality: 'own',
        sharpness: 'preset',
        draws: 1,
      });
      expect(steps[0].hide).toBeUndefined();
      expect(steps.some((s) => s.quality === 'high' && s.sharpness === 'screen')).toBe(true);
    }
    // The views come one after another, never revisited (each change teleports the car).
    const order = benchSteps.map((s) => s.view);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The whole picture drawn up to four times over at the first view, and High at full
    // sharpness two and three times over at the widest.
    expect(benchSteps.filter((s) => s.draws > 1).map((s) => `${s.quality} ${s.draws}`)).toEqual([
      'own 2',
      'own 3',
      'own 4',
      'high 2',
      'high 3',
    ]);
  });

  it('writes lines that fit an upright phone (about 45 characters at this size)', () => {
    for (const s of benchSteps) {
      expect(s.name.length, s.name).toBeLessThanOrEqual(18);
      expect(benchLine(s.name, 16.7, 33.4).length, s.name).toBeLessThanOrEqual(40);
    }
    expect(benchLine('As normal', 16.7, 18.2)).toBe('As normal           60 fps  17/18 ms');
  });
});
