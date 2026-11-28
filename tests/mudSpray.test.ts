import { describe, expect, it } from 'vitest';
import { particleTuning } from '../src/data/particles';
import { qualityPresets } from '../src/data/quality';
import { mudFleck, mudRate, mudThrow, wheelTurning } from '../src/render/mudSpray';

describe('mud spray (v2.30)', () => {
  it('a bogged car in a forward gear throws mud backwards, whichever way its speed flickers', () => {
    // Bogged: the wheels spin, the car barely moves and its speed reads a little either side of zero.
    expect(wheelTurning(0.03, 0.9, 0)).toBe(1);
    expect(wheelTurning(-0.03, 0.9, 0)).toBe(1);
    expect(wheelTurning(-0.3, 0.6, 2)).toBe(1);
    // Thrown the way the tread leaves the ground: backwards (against the car's nose).
    for (const speed of [0.03, -0.03]) {
      const t = mudThrow(wheelTurning(speed, 0.9, 0), 0.9, 0.5);
      expect(t.along).toBeLessThan(-1);
      expect(t.behind).toBeLessThan(0);
    }
  });

  it('bogged in reverse it throws mud forwards', () => {
    expect(wheelTurning(-0.03, 0.9, -1)).toBe(-1);
    expect(wheelTurning(0.03, 0.9, -1)).toBe(-1);
    const t = mudThrow(-1, 0.9, 0.5);
    expect(t.along).toBeGreaterThan(1);
    expect(t.behind).toBeGreaterThan(0);
  });

  it('a wheel that is rolling, not spinning, turns the way the car is going', () => {
    // Rolling back down a climb in a forward gear with the throttle shut.
    expect(wheelTurning(-2, 0, 1)).toBe(-1);
    expect(wheelTurning(4, 0.05, 1)).toBe(1);
    // Reversing without wheelspin.
    expect(wheelTurning(-1.5, 0, -1)).toBe(-1);
  });

  it('the harder the wheel spins, the faster the mud leaves it', () => {
    expect(Math.abs(mudThrow(1, 1, 0.5).along)).toBeGreaterThan(Math.abs(mudThrow(1, 0.2, 0.5).along));
  });

  it('flecks are 2 to 5 cm across, with fewer than one in ten a clod of up to 8 cm', () => {
    let clods = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      // Two independent draws spread over 0..1.
      const f = mudFleck(((i * 0.61803398875) % 1) as number, ((i * 0.3819660113 + 0.37) % 1) as number);
      const across = f.radius * 2;
      expect(across).toBeGreaterThanOrEqual(0.02);
      expect(across).toBeLessThanOrEqual(0.08);
      if (across > 0.05) clods++;
      // Stretched along its path, never squashed.
      expect(f.stretch).toBeGreaterThan(1.2);
      expect(f.stretch).toBeLessThan(3.5);
    }
    expect(clods).toBeGreaterThan(0);
    expect(clods / n).toBeLessThan(0.1);
  });

  it('throws more pieces than the 45 a second of full wheelspin it used to, inside the pool', () => {
    const full = mudRate(1, 0);
    expect(full).toBeGreaterThan(45 * 1.8);
    // Four wheels at full spin for a fleck's longest life still fit the pool, on the preset that
    // throws the most (v2.37: on High they did not, and flecks and splashes were dropped).
    const most = Math.max(...Object.values(qualityPresets).map((q) => q.particles));
    expect(most).toBeGreaterThan(1);
    expect(4 * full * most * particleTuning.mud.life[1]).toBeLessThan(particleTuning.maxChunks);
    // Rolling through mud without spin throws some too, more with speed.
    expect(mudRate(0, 6)).toBeGreaterThan(mudRate(0, 1));
    expect(mudRate(0, 0)).toBe(0);
  });
});
