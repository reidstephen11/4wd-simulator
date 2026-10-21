import { describe, expect, it } from 'vitest';
import { EngineSynth, type EngineInputs } from '../src/audio/engine/engineSynth';
import { firingHz } from '../src/audio/mix';
import { dieselSynthTuning, td42SynthTuning } from '../src/data/audio';

const SR = 48000;
const base: EngineInputs = {
  rpm: 800,
  load: 0,
  throttle: 0,
  running: true,
  misfire: 0,
  shaftHz: 0,
  whine: 0,
};

function render(seconds: number, inputs: Partial<EngineInputs>, synth = new EngineSynth(SR)): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  const inp = { ...base, ...inputs };
  for (let i = 0; i < out.length; i += 128) synth.process(out, inp, i, Math.min(out.length, i + 128));
  return out;
}

function rms(x: Float32Array, from = 0): number {
  let s = 0;
  for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / (x.length - from));
}

/** Signal power at one frequency (Goertzel), over the second half of the buffer. */
function power(x: Float32Array, hz: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = x.length >> 1; i < x.length; i++) {
    const s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

describe('engine synthesiser', () => {
  it('stays finite and inside full scale at idle, full load, redline and overrun', () => {
    for (const inp of [
      {},
      { rpm: 2000, throttle: 1, load: 1 },
      { rpm: 4600, throttle: 1, load: 1 },
      { rpm: 3500, throttle: 0 },
      { rpm: 1500, throttle: 0.5, load: 0.5, shaftHz: 12, whine: 1 },
    ]) {
      const x = render(1, inp);
      let peak = 0;
      for (const v of x) peak = Number.isFinite(v) ? Math.max(peak, Math.abs(v)) : Infinity;
      expect(peak).toBeLessThanOrEqual(1);
      expect(rms(x, SR / 4)).toBeGreaterThan(0.01);
    }
  });

  it('a six fires three times per crank turn, and the pitch follows the revs', () => {
    expect(firingHz(800)).toBeCloseTo(40, 5);
    for (const rpm of [900, 1800, 3000]) {
      const x = render(1.5, { rpm, throttle: 0.6, load: 0.6 });
      const f = firingHz(rpm);
      // Strong at the firing frequency and its second harmonic, not between them.
      expect(power(x, f)).toBeGreaterThan(power(x, f * 1.27) * 8);
      expect(power(x, 2 * f)).toBeGreaterThan(power(x, f * 1.73) * 4);
    }
  });

  it('is much louder under load than at closed throttle at the same revs', () => {
    const closed = rms(render(1, { rpm: 2000 }), SR / 4);
    const open = rms(render(1, { rpm: 2000, throttle: 1, load: 1 }), SR / 4);
    expect(open).toBeGreaterThan(closed * 2.5);
  });

  it('cranks on the starter, catches, flares and settles to the engine speed', () => {
    const synth = new EngineSynth(SR);
    synth.start();
    expect(synth.cranking).toBe(true);
    render(0.5, {}, synth);
    expect(synth.rpm).toBeGreaterThan(80);
    expect(synth.rpm).toBeLessThan(260);
    render(0.65, {}, synth);
    expect(synth.rpm).toBeGreaterThan(1000);
    render(2, {}, synth);
    expect(synth.cranking).toBe(false);
    expect(Math.abs(synth.rpm - 800)).toBeLessThan(60);
  });

  it('goes quiet when the engine has stopped', () => {
    const running = rms(render(1, {}), SR / 4);
    const stopped = rms(render(1, { rpm: 0, running: false }), SR / 4);
    expect(stopped).toBeLessThan(running * 0.1);
  });

  it('misfires when the intake takes in water', () => {
    const clean = rms(render(2, { rpm: 900, throttle: 0.3, load: 0.3 }), SR / 2);
    const flooded = rms(render(2, { rpm: 900, throttle: 0.3, load: 0.3, misfire: 0.6 }), SR / 2);
    expect(flooded).toBeLessThan(clean * 0.85);
  });

  it('adds a gear whine pitched to the transfer-case shaft', () => {
    const plain = render(1, { rpm: 1500, throttle: 0.4, load: 0.4, shaftHz: 10 });
    const whine = render(1, { rpm: 1500, throttle: 0.4, load: 0.4, shaftHz: 10, whine: 1 });
    // 43 teeth on the first mesh: 430 Hz.
    expect(power(whine, 430)).toBeGreaterThan(power(plain, 430) * 10);
  });

  it('is deterministic for a given seed', () => {
    const a = render(0.5, { rpm: 1200, throttle: 0.4, load: 0.4 }, new EngineSynth(SR, 7));
    const b = render(0.5, { rpm: 1200, throttle: 0.4, load: 0.4 }, new EngineSynth(SR, 7));
    expect(a).toEqual(b);
  });

  it("the Perentie's four-cylinder diesel fires twice per crank turn and clatters at idle", () => {
    const diesel = () => new EngineSynth(SR, 3, dieselSynthTuning);
    for (const inp of [
      { rpm: 700 },
      { rpm: 1900, throttle: 1, load: 1 },
      { rpm: 3650, throttle: 1, load: 1 },
    ]) {
      let peak = 0;
      for (const v of render(1, inp, diesel()))
        peak = Number.isFinite(v) ? Math.max(peak, Math.abs(v)) : Infinity;
      expect(peak).toBeLessThanOrEqual(1);
    }
    for (const rpm of [900, 1800]) {
      const f = firingHz(rpm, 4);
      const x = render(1.5, { rpm, throttle: 0.6, load: 0.6 }, diesel());
      expect(power(x, f)).toBeGreaterThan(power(x, f * 1.27) * 4);
    }
    // Combustion knock rings at 1 to 2 kHz: far more there, against the exhaust's low
    // end, than from the petrol six at the same revs.
    const band = (x: Float32Array, from: number, to: number) => {
      let sum = 0;
      for (let f = from; f <= to; f += 11) sum += power(x, f);
      return sum;
    };
    const clatter = (x: Float32Array) => band(x, 1300, 3200) / band(x, 40, 400);
    expect(clatter(render(1.5, { rpm: 750 }, diesel()))).toBeGreaterThan(
      3 * clatter(render(1.5, { rpm: 750 })),
    );
    // On the road it isn't shrill: less above 2.5 kHz than the petrol six, and the
    // gearbox whine (37 teeth on the shaft) is a faint hum, not a turbo-like whistle.
    const cruise = { rpm: 2600, throttle: 0.4, load: 0.4, shaftHz: 33, whine: 0.2 };
    const hiss = (x: Float32Array) => band(x, 2500, 5000) / band(x, 40, 400);
    const road = render(1.5, cruise, diesel());
    expect(hiss(road)).toBeLessThan(0.5 * hiss(render(1.5, cruise)));
    const whine = 37 * 33;
    const near = band(road, whine - 80, whine - 30) / 5;
    expect(power(road, whine)).toBeLessThan(10 * near);
  });

  it("the GQ Patrol's six-cylinder diesel fires three times per crank turn and still clatters", () => {
    const td42 = () => new EngineSynth(SR, 3, td42SynthTuning);
    for (const inp of [
      { rpm: 650 },
      { rpm: 2000, throttle: 1, load: 1 },
      { rpm: 4050, throttle: 1, load: 1 },
    ]) {
      let peak = 0;
      for (const v of render(1, inp, td42()))
        peak = Number.isFinite(v) ? Math.max(peak, Math.abs(v)) : Infinity;
      expect(peak).toBeLessThanOrEqual(1);
    }
    for (const rpm of [900, 1800]) {
      const f = firingHz(rpm, 6);
      const x = render(1.5, { rpm, throttle: 0.6, load: 0.6 }, td42());
      expect(power(x, f)).toBeGreaterThan(power(x, f * 1.27) * 4);
    }
    const band = (x: Float32Array, from: number, to: number) => {
      let sum = 0;
      for (let f = from; f <= to; f += 11) sum += power(x, f);
      return sum;
    };
    const clatter = (x: Float32Array) => band(x, 1300, 3200) / band(x, 40, 400);
    expect(clatter(render(1.5, { rpm: 700 }, td42()))).toBeGreaterThan(
      2 * clatter(render(1.5, { rpm: 700 })),
    );
  });
});
