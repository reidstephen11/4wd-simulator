import { describe, expect, it } from 'vitest';
import { limiterBouncing, limiterFiring, limiterProximity } from '../src/audio/engine/limiter';
import { engineSynthTuning, engineSynthTunings, v8DieselSynthTuning } from '../src/data/audio';

describe('rev-limiter state', () => {
  const petrol = engineSynthTuning.limiter!;
  const diesel = v8DieselSynthTuning.limiter!;

  it('is quiet well below the limiter and full at or past it', () => {
    expect(limiterProximity(2500, 4300, 260)).toBe(0);
    expect(limiterProximity(4040, 4300, 260)).toBe(0);
    expect(limiterProximity(4170, 4300, 260)).toBeCloseTo(0.5, 5);
    expect(limiterProximity(4300, 4300, 260)).toBe(1);
    expect(limiterProximity(4600, 4300, 260)).toBe(1);
    expect(limiterBouncing(4299, 4300)).toBe(false);
    expect(limiterBouncing(4300, 4300)).toBe(true);
  });

  it('always fires below the limiter, so cruise and crawl stay unchanged', () => {
    const cuts = [1, 1, 1, 1];
    for (let i = 0; i < 16; i++) {
      expect(limiterFiring(3000, 4300, i, cuts, 1, 0)).toBe('fire');
      expect(limiterFiring(4099, 4100, i, diesel.pattern, 1, 0)).toBe('fire');
    }
  });

  it('the short-wheelbase petrol bounce is an uneven ignition-cut rhythm', () => {
    const got = Array.from({ length: petrol.pattern.length }, (_, i) =>
      limiterFiring(4300, 4300, i, petrol.pattern, 0, 0),
    );
    expect(got).toEqual(['fire', 'cut', 'fire', 'fire', 'cut', 'fire', 'cut', 'cut']);
    expect(limiterFiring(4300, 4300, 1, petrol.pattern, 1, 0)).toBe('pop');
    expect(limiterFiring(4300, 4300, 1, petrol.pattern, 0.2, 0.5)).toBe('cut');
    expect(petrol.kind).toBe('ignition');
  });

  it('the LC79 diesel chop is a steadier fuel-cut, with only rare pops', () => {
    const got = Array.from({ length: diesel.pattern.length }, (_, i) =>
      limiterFiring(4100, 4100, i, diesel.pattern, 0, 0),
    );
    expect(got).toEqual(['fire', 'fire', 'cut', 'cut']);
    expect(diesel.kind).toBe('fuel');
    expect(diesel.bouncePop).toBeLessThan(petrol.bouncePop);
    expect(diesel.overrunPop).toBeLessThan(petrol.overrunPop);
  });

  it('a weak step is a partial burn, not a pop', () => {
    expect(limiterFiring(4300, 4300, 0, [2], 1, 0)).toBe('weak');
  });

  it('only the short-wheelbase six and the LC79 V8 have limiter character', () => {
    expect(engineSynthTunings.shortie.limiter?.kind).toBe('ignition');
    expect(engineSynthTunings.lc79.limiter?.kind).toBe('fuel');
    for (const id of ['camel', 'perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'sooty80'] as const) {
      expect(engineSynthTunings[id].limiter, id).toBeUndefined();
    }
  });
});
