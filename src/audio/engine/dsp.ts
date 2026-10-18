/**
 * Small sample-by-sample DSP pieces for the synthesisers that run inside an
 * AudioWorklet. Plain classes with no Web Audio dependency, so they can be unit tested.
 */

/** RBJ cookbook biquad in transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(private readonly sampleRate: number) {}

  lowpass(hz: number, q = Math.SQRT1_2): this {
    const { cos, alpha } = this.prep(hz, q);
    return this.set((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
  }

  highpass(hz: number, q = Math.SQRT1_2): this {
    const { cos, alpha } = this.prep(hz, q);
    return this.set((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
  }

  /** Band-pass with 0 dB gain at the centre. */
  bandpass(hz: number, q: number): this {
    const { cos, alpha } = this.prep(hz, q);
    return this.set(alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha);
  }

  peaking(hz: number, q: number, gainDb: number): this {
    const { cos, alpha } = this.prep(hz, q);
    const A = Math.pow(10, gainDb / 40);
    return this.set(1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A);
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = this.z2 = 0;
  }

  private prep(hz: number, q: number): { cos: number; alpha: number } {
    const w0 = (2 * Math.PI * Math.min(hz, this.sampleRate * 0.45)) / this.sampleRate;
    return { cos: Math.cos(w0), alpha: Math.sin(w0) / (2 * q) };
  }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
}

/** One-pole smoother / low-pass: `y += (x - y) * k`. */
export class OnePole {
  y = 0;
  private k = 1;

  constructor(
    private readonly sampleRate: number,
    hz: number,
  ) {
    this.cutoff(hz);
  }

  cutoff(hz: number): this {
    this.k = 1 - Math.exp((-2 * Math.PI * hz) / this.sampleRate);
    return this;
  }

  /** Set the response by time constant (s) instead of cutoff. */
  timeConstant(seconds: number): this {
    this.k = 1 - Math.exp(-1 / (Math.max(1e-5, seconds) * this.sampleRate));
    return this;
  }

  process(x: number): number {
    this.y += (x - this.y) * this.k;
    return this.y;
  }
}

/** First-order DC blocker (high-pass at roughly `hz`). */
export class DcBlock {
  private x1 = 0;
  private y1 = 0;
  private readonly r: number;

  constructor(sampleRate: number, hz = 20) {
    this.r = Math.exp((-2 * Math.PI * hz) / sampleRate);
  }

  process(x: number): number {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** A pipe section: a delay line with a lossy, inverting end reflection (feedback comb). */
export class Pipe {
  private readonly buf: Float32Array;
  private idx = 0;
  private readonly loss: OnePole;

  /**
   * @param length Pipe length (m); the wave travels there and back.
   * @param soundSpeed Speed of sound in the gas (m/s); hot exhaust is ~500 m/s.
   * @param reflection Reflection at the far end (negative for an open end).
   * @param dampingHz High frequencies above this lose energy each round trip.
   */
  constructor(
    sampleRate: number,
    length: number,
    soundSpeed: number,
    private readonly reflection: number,
    dampingHz: number,
  ) {
    const samples = Math.max(1, Math.round(((2 * length) / soundSpeed) * sampleRate));
    this.buf = new Float32Array(samples);
    this.loss = new OnePole(sampleRate, dampingHz);
  }

  process(x: number): number {
    const back = this.loss.process(this.buf[this.idx]);
    const y = x + this.reflection * back;
    this.buf[this.idx] = y;
    this.idx = this.idx + 1 === this.buf.length ? 0 : this.idx + 1;
    return y;
  }
}

/** Fast seeded white noise in [-1, 1) (xorshift32). */
export class Noise {
  private s: number;

  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }

  next(): number {
    let s = this.s;
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    this.s = s;
    return (s / 4294967296) * 2 - 1;
  }

  /** Uniform in [0, 1). */
  unit(): number {
    return (this.next() + 1) * 0.5;
  }

  /** Roughly normal (mean 0, sd 1): sum of four uniforms. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next()) * 0.866;
  }
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
