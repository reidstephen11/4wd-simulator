import { mulberry32 } from '../sim/world/rng';

/** Looping noise buffers, generated once when audio starts. */
export interface NoiseBank {
  white: AudioBuffer;
  /** Deep rumbly noise (integrated white noise). */
  brown: AudioBuffer;
  /** Sparse soft grains: dirt crunch, rock knocks. */
  crunch: AudioBuffer;
  /** Dense sharp clicks: gravel rattle. */
  rattle: AudioBuffer;
  /** Slow wet blobs: mud squelch. */
  squelch: AudioBuffer;
}

type Fill = (data: Float32Array, rate: number, rand: () => number) => void;

function make(ctx: BaseAudioContext, seconds: number, seed: number, fill: Fill): AudioBuffer {
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(seconds * rate), rate);
  const data = buf.getChannelData(0);
  fill(data, rate, mulberry32(seed));
  // Normalise so every buffer peaks near 1.
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
  // Short fade at the loop point so it doesn't click.
  const fade = Math.min(256, data.length >> 2);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    data[i] *= g;
    data[data.length - 1 - i] *= g;
  }
  return buf;
}

/** Bursts of white noise with exponential decay, placed at random. */
function grains(bed: number, perSecond: number, decayS: number, amp: [number, number]): Fill {
  return (data, sr, rand) => {
    const n = data.length;
    const count = Math.floor((n / sr) * perSecond);
    const decay = Math.max(1, decayS * sr);
    for (let k = 0; k < count; k++) {
      const start = Math.floor(rand() * n);
      const a = amp[0] + (amp[1] - amp[0]) * rand();
      const len = Math.min(n - start, Math.floor(decay * 5));
      for (let i = 0; i < len; i++) data[start + i] += (rand() * 2 - 1) * a * Math.exp(-i / decay);
    }
    // A little background bed under the grains.
    for (let i = 0; i < n; i++) data[i] += (rand() * 2 - 1) * bed;
  };
}

export function createNoiseBank(ctx: BaseAudioContext): NoiseBank {
  return {
    white: make(ctx, 2, 11, (d, _r, rand) => {
      for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
    }),
    brown: make(ctx, 3, 12, (d, _r, rand) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
        d[i] = last;
      }
    }),
    crunch: make(ctx, 2, 13, grains(0.04, 70, 0.004, [0.2, 1])),
    rattle: make(ctx, 2, 14, grains(0.02, 260, 0.0012, [0.1, 1])),
    squelch: make(ctx, 3, 15, (d, sr, rand) => {
      // Brown noise shaped by slow random swells.
      let last = 0;
      let env = 0;
      let target = 0;
      for (let i = 0; i < d.length; i++) {
        if (i % Math.floor(sr * 0.09) === 0) target = rand() < 0.45 ? rand() : 0.05;
        env += (target - env) * 0.0015;
        last = (last + 0.03 * (rand() * 2 - 1)) / 1.03;
        d[i] = last * env;
      }
    }),
  };
}

/** A looping source of a buffer, started at a random offset. */
export function loop(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  offset = Math.random(),
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(0, offset * buffer.duration);
  return src;
}

/** A one-shot source of a buffer from a random point, stopped after `seconds`. */
export function burst(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  at: number,
  seconds: number,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(at, Math.random() * buffer.duration);
  src.stop(at + seconds);
  return src;
}
