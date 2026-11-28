import { describe, expect, it } from 'vitest';
import { limiterBouncing, limiterFiring, limiterProximity } from '../src/audio/engine/limiter';
import {
  engineSynthTuning,
  engineSynthTunings,
  v8DieselSynthTuning,
  type EngineSynthTuning,
} from '../src/data/audio';
import { vehicles } from '../src/data/vehicles';
import type { VehicleId } from '../src/data/vehicle';

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

  it('every engine has limiter character of its fuel: petrol ignition cut, diesel fuel cut', () => {
    for (const id of Object.keys(vehicles) as VehicleId[]) {
      const T: EngineSynthTuning = engineSynthTunings[id];
      // Only the diesels have a combustion knock in their sound.
      expect(T.limiter?.kind, id).toBe(T.knock ? 'fuel' : 'ignition');
      // No turbo, no extra turbo dump on a lift-off at the limiter.
      if (!T.turbo) expect(T.limiter?.dump, id).toBe(0);
    }
  });

  it("each sound limiter sits where its vehicle's rev limit puts it", () => {
    // The 40 Series and the LC79 bounce at the physics limit. Everyone else follows the
    // Range Rover: the sound limiter 4% above it, so the note builds and holds at the limit
    // with every cylinder firing, and the bounce is heard only if the revs are pushed past it.
    const bounceAtLimit: readonly VehicleId[] = ['shortie', 'forty', 'ute40', 'lc79'];
    for (const id of Object.keys(vehicles) as VehicleId[]) {
      const redline = vehicles[id].tuning.engine.redlineRpm;
      const ratio = engineSynthTunings[id].limiterRpm / redline;
      if (bounceAtLimit.includes(id)) expect(ratio, id).toBe(1);
      else expect(ratio, id).toBeCloseTo(1.04, 2);
    }
  });

  it('the build-up starts in the last tenth of the revs and is well under way at the limit', () => {
    for (const id of Object.keys(vehicles) as VehicleId[]) {
      const T: EngineSynthTuning = engineSynthTunings[id];
      const redline = vehicles[id].tuning.engine.redlineRpm;
      const L = T.limiter!;
      expect(limiterProximity(redline * 0.9, T.limiterRpm, L.approach), id).toBe(0);
      expect(limiterProximity(redline, T.limiterRpm, L.approach), id).toBeGreaterThan(0.2);
    }
  });
});
