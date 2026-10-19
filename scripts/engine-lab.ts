/**
 * Dev helper: render the engine synthesiser offline, print levels and the strongest
 * spectral peaks per scenario, and write WAV files to listen to.
 * Usage: npx vite-node scripts/engine-lab.ts [outDir] [shortie|perentie]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { EngineSynth, type EngineInputs } from '../src/audio/engine/engineSynth';
import { engineSynthTunings } from '../src/data/audio';

const SR = 48000;
const outDir = process.argv[2] ?? 'test-results/engine-lab';
const engine = engineSynthTunings[(process.argv[3] ?? 'shortie') as keyof typeof engineSynthTunings];
mkdirSync(outDir, { recursive: true });

const base: EngineInputs = {
  rpm: 800,
  load: 0,
  throttle: 0,
  running: true,
  misfire: 0,
  shaftHz: 0,
  whine: 0,
};

type Step = { seconds: number; inputs: Partial<EngineInputs> | ((t: number) => Partial<EngineInputs>) };

function render(steps: Step[], start = false): Float32Array {
  const synth = new EngineSynth(SR, undefined, engine);
  if (start) synth.start();
  const total = Math.round(steps.reduce((s, x) => s + x.seconds, 0) * SR);
  const out = new Float32Array(total);
  let pos = 0;
  let t = 0;
  for (const step of steps) {
    const end = pos + Math.round(step.seconds * SR);
    while (pos < end) {
      const n = Math.min(128, end - pos);
      const inp = { ...base, ...(typeof step.inputs === 'function' ? step.inputs(t) : step.inputs) };
      synth.process(out, inp, pos, pos + n);
      pos += n;
      t += n / SR;
    }
  }
  return out;
}

function stats(x: Float32Array, from = 0.3): { rms: number; peak: number } {
  let s = 0;
  let p = 0;
  const i0 = Math.floor(from * SR);
  for (let i = i0; i < x.length; i++) {
    s += x[i] * x[i];
    p = Math.max(p, Math.abs(x[i]));
    if (!Number.isFinite(x[i])) throw new Error('non-finite sample');
  }
  return { rms: Math.sqrt(s / (x.length - i0)), peak: p };
}

/** Magnitude spectrum (Hann window) of a 1 s slice; returns the strongest peaks below 2 kHz. */
function peaks(x: Float32Array, from: number, count = 8): string {
  const N = 16384;
  const i0 = Math.floor(from * SR);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i0 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft(re, im);
  const mags: { hz: number; db: number }[] = [];
  const binHz = SR / N;
  for (let k = 2; k < 2000 / binHz; k++) {
    const m = Math.hypot(re[k], im[k]);
    const l = Math.hypot(re[k - 1], im[k - 1]);
    const r = Math.hypot(re[k + 1], im[k + 1]);
    if (m > l && m >= r) mags.push({ hz: k * binHz, db: 20 * Math.log10(m + 1e-9) });
  }
  mags.sort((a, b) => b.db - a.db);
  const top = mags[0]?.db ?? 0;
  return mags
    .slice(0, count)
    .sort((a, b) => a.hz - b.hz)
    .map((m) => `${m.hz.toFixed(0)}Hz(${(m.db - top).toFixed(0)})`)
    .join(' ');
}

/** Octave-band levels (dB relative to the loudest band) from 31.5 Hz to 8 kHz. */
function octaves(x: Float32Array, from: number): string {
  const N = 16384;
  const i0 = Math.floor(from * SR);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[i0 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft(re, im);
  const binHz = SR / N;
  const bands = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000].map((c) => {
    let e = 0;
    for (let k = Math.ceil(c / Math.SQRT2 / binHz); k <= Math.floor((c * Math.SQRT2) / binHz); k++)
      e += re[k] * re[k] + im[k] * im[k];
    return 10 * Math.log10(e + 1e-12);
  });
  const top = Math.max(...bands);
  return bands.map((b) => (b - top).toFixed(0).padStart(4)).join('');
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let j = 0; j < len / 2; j++) {
        const wr = Math.cos(ang * j);
        const wi = Math.sin(ang * j);
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + len / 2] * wr - im[i + j + len / 2] * wi;
        const vi = re[i + j + len / 2] * wi + im[i + j + len / 2] * wr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
      }
  }
}

function wav(name: string, x: Float32Array): void {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + x.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(`${outDir}/${name}.wav`, buf);
}

const scenarios: Record<string, { steps: Step[]; start?: boolean }> = {
  idle: { steps: [{ seconds: 3, inputs: {} }] },
  'crawl-1100-load': { steps: [{ seconds: 3, inputs: { rpm: 1100, throttle: 0.35, load: 0.35 } }] },
  'stall-2000-wot': { steps: [{ seconds: 3, inputs: { rpm: 2000, throttle: 1, load: 1 } }] },
  'cruise-2500-light': { steps: [{ seconds: 3, inputs: { rpm: 2500, throttle: 0.25, load: 0.2 } }] },
  'redline-4300-wot': { steps: [{ seconds: 3, inputs: { rpm: 4300, throttle: 1, load: 1 } }] },
  'overrun-3500-0': {
    steps: [{ seconds: 3, inputs: (t) => ({ rpm: 3500 - t * 700, throttle: 0, load: 0 }) }],
  },
  'low-range-whine': {
    steps: [{ seconds: 3, inputs: { rpm: 1500, throttle: 0.5, load: 0.5, shaftHz: 10, whine: 1 } }],
  },
  'start-up': { start: true, steps: [{ seconds: 4, inputs: {} }] },
  'rev-sweep': {
    steps: [
      { seconds: 1, inputs: {} },
      {
        seconds: 2.5,
        inputs: (t) => ({ rpm: 800 + Math.min(1, (t - 1) / 2.5) * 3400, throttle: 1, load: 0.4 }),
      },
      { seconds: 2.5, inputs: (t) => ({ rpm: 4200 - Math.min(1, (t - 3.5) / 2.5) * 3400, throttle: 0 }) },
      { seconds: 1, inputs: {} },
    ],
  },
  // Everything in one file: start-up, idle, crawling in low range, a full-throttle
  // stall against a rock, a rev up and the overrun back down.
  demo: {
    start: true,
    steps: [
      { seconds: 4, inputs: {} },
      {
        seconds: 4,
        inputs: (t) => ({
          rpm: 1050 + 60 * Math.sin(t * 2.1),
          throttle: 0.3,
          load: 0.35,
          shaftHz: 6.5,
          whine: 1,
        }),
      },
      {
        seconds: 2.5,
        inputs: (t) => ({ rpm: 1100 + Math.min(1, t - 8) * 900, throttle: 1, load: 1, whine: 0.6 }),
      },
      {
        seconds: 3,
        inputs: (t) => ({ rpm: 2000 + Math.min(1, (t - 10.5) / 2.5) * 2200, throttle: 1, load: 0.5 }),
      },
      { seconds: 3, inputs: (t) => ({ rpm: 4200 - Math.min(1, (t - 13.5) / 2.5) * 3400, throttle: 0 }) },
      { seconds: 2, inputs: {} },
    ],
  },
  'flooded-sputter': {
    steps: [{ seconds: 3, inputs: { rpm: 900, throttle: 0.3, load: 0.3, misfire: 0.45 } }],
  },
};

for (const [name, sc] of Object.entries(scenarios)) {
  const x = render(sc.steps, sc.start);
  const s = stats(x);
  console.log(
    `${name.padEnd(20)} rms ${s.rms.toFixed(3)} (${(20 * Math.log10(s.rms)).toFixed(1)} dB) peak ${s.peak.toFixed(2)}  ${peaks(x, 1)}`,
  );
  console.log(`${''.padEnd(20)} octaves 31..8k:${octaves(x, 1)}`);
  wav(name, x);
}
