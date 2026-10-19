import { audioTuning } from '../data/audio';
import { loop, type NoiseBank } from './buffers';
import { kookaburraPhrase, magpiePhrase, playPhrase } from './birds';
import { proximityLevel, windLevel } from './mix';

export interface AmbienceFrame {
  dt: number;
  altitude: number;
  /** Distance (m) to the creek's water edge. */
  creekDistance: number;
  /** Distance (m) to the falls. */
  fallsDistance: number;
  /** 0..1 how hard it is raining. */
  rain: number;
  /** Heard from the driver's seat: the rain drums on the roof. */
  interior: boolean;
}

/** Wind by altitude, creek water near the creek, the falls, rain, and bird calls. */
export class Ambience {
  private readonly windGains: GainNode[] = [];
  private readonly windBands: BiquadFilterNode[] = [];
  private readonly whistle: GainNode;
  private readonly whistleBand: BiquadFilterNode;
  private readonly creek: GainNode;
  private readonly babble: GainNode;
  private readonly babbleBand: BiquadFilterNode;
  private readonly falls: GainNode;
  private readonly rainHiss: GainNode;
  private readonly rainPatter: GainNode;
  private readonly rainRoof: GainNode;
  private readonly roofBand: BiquadFilterNode;
  private nextDrum = 0;
  private gust = 0.5;
  private gustTarget = 0.5;
  private gustTimer = 0;
  private nextBabble = 0;
  private nextBird: number;
  wind = 0;
  water = 0;
  lastBird = '';

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    noise: NoiseBank,
  ) {
    // Two wind beds, panned apart for width.
    for (const pan of [-0.6, 0.6]) {
      const src = loop(ctx, noise.brown);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 400;
      band.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(band).connect(g).connect(p).connect(bus);
      this.windGains.push(g);
      this.windBands.push(band);
    }
    const ws = loop(ctx, noise.white);
    this.whistleBand = ctx.createBiquadFilter();
    this.whistleBand.type = 'bandpass';
    this.whistleBand.Q.value = 12;
    this.whistleBand.frequency.value = 1100;
    this.whistle = ctx.createGain();
    this.whistle.gain.value = 0;
    ws.connect(this.whistleBand).connect(this.whistle).connect(bus);

    // Creek: a broad wash plus a "babble" band that jumps around.
    const cs = loop(ctx, noise.white);
    const cband = ctx.createBiquadFilter();
    cband.type = 'bandpass';
    cband.frequency.value = 1800;
    cband.Q.value = 0.5;
    this.creek = ctx.createGain();
    this.creek.gain.value = 0;
    cs.connect(cband).connect(this.creek).connect(bus);
    const bs = loop(ctx, noise.white);
    this.babbleBand = ctx.createBiquadFilter();
    this.babbleBand.type = 'bandpass';
    this.babbleBand.Q.value = 6;
    this.babbleBand.frequency.value = 1200;
    this.babble = ctx.createGain();
    this.babble.gain.value = 0;
    bs.connect(this.babbleBand).connect(this.babble).connect(bus);

    // The falls: a deep roar.
    const fs = loop(ctx, noise.brown);
    const flp = ctx.createBiquadFilter();
    flp.type = 'lowpass';
    flp.frequency.value = 900;
    this.falls = ctx.createGain();
    this.falls.gain.value = 0;
    fs.connect(flp).connect(this.falls).connect(bus);

    // Rain: a broad hiss of drops on the bush, a lower patter close by, and drumming on
    // the roof heard from inside.
    const band = (type: BiquadFilterType, hz: number, q: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      return f;
    };
    const quiet = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      return g;
    };
    this.rainHiss = quiet();
    loop(ctx, noise.white)
      .connect(band('bandpass', 3800, 0.35))
      .connect(this.rainHiss)
      .connect(bus);
    this.rainPatter = quiet();
    loop(ctx, noise.white)
      .connect(band('bandpass', 1100, 0.9))
      .connect(this.rainPatter)
      .connect(bus);
    this.rainRoof = quiet();
    this.roofBand = band('bandpass', 700, 1.4);
    loop(ctx, noise.brown).connect(this.roofBand).connect(this.rainRoof).connect(bus);

    const B = audioTuning.ambience.birds;
    this.nextBird = ctx.currentTime + B.minInterval * 0.5;
  }

  update(f: AmbienceFrame): void {
    const A = audioTuning.ambience;
    const t = this.ctx.currentTime;

    // Gusts: a slow random walk.
    this.gustTimer -= f.dt;
    if (this.gustTimer <= 0) {
      this.gustTarget = Math.random();
      this.gustTimer = 1.5 + Math.random() * 3;
    }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, f.dt * 0.8);
    const alt = windLevel(f.altitude);
    this.wind = alt;
    const windGain = (A.wind.minGain + (A.wind.maxGain - A.wind.minGain) * alt) * (0.55 + 0.7 * this.gust);
    this.windGains.forEach((g, i) => {
      const wobble = i === 0 ? 1 : 0.85 + 0.3 * (1 - this.gust);
      g.gain.setTargetAtTime(windGain * wobble, t, 0.4);
      this.windBands[i].frequency.setTargetAtTime(220 + 420 * this.gust + 300 * alt, t, 0.5);
    });
    this.whistle.gain.setTargetAtTime(A.wind.whistleGain * alt * alt * this.gust, t, 0.5);
    this.whistleBand.frequency.setTargetAtTime(800 + 900 * this.gust, t, 0.6);

    // Creek and falls by distance.
    const creek = proximityLevel(f.creekDistance, A.creek.range);
    const falls = proximityLevel(f.fallsDistance, A.falls.range);
    this.water = Math.max(creek, falls);
    this.creek.gain.setTargetAtTime(creek * A.creek.gain, t, 0.3);
    this.babble.gain.setTargetAtTime(creek * A.creek.gain * 0.8, t, 0.3);
    this.falls.gain.setTargetAtTime(falls * A.falls.gain, t, 0.3);
    if (creek > 0) {
      // Schedule a little ahead so the babble doesn't depend on the frame rate.
      if (this.nextBabble < t) this.nextBabble = t;
      while (this.nextBabble < t + 0.25) {
        this.babbleBand.frequency.setTargetAtTime(700 + Math.random() * 2000, this.nextBabble, 0.02);
        this.nextBabble += 0.05 + Math.random() * 0.1;
      }
    }

    // Rain: outside it hisses and patters; inside the roof drums and muffles the hiss.
    const R = A.rain;
    const rain = Math.min(1, Math.max(0, f.rain));
    this.rainHiss.gain.setTargetAtTime(rain * R.hiss * (f.interior ? 0.35 : 1), t, 0.3);
    this.rainPatter.gain.setTargetAtTime(rain * R.patter * (f.interior ? 0.5 : 1), t, 0.3);
    if (rain > 0 && f.interior) {
      // Drops land in uneven bursts: jitter the drum's level and pitch a little ahead.
      if (this.nextDrum < t) this.nextDrum = t;
      while (this.nextDrum < t + 0.25) {
        this.rainRoof.gain.setTargetAtTime(rain * R.roof * (0.6 + 0.8 * Math.random()), this.nextDrum, 0.015);
        this.roofBand.frequency.setTargetAtTime(500 + Math.random() * 700, this.nextDrum, 0.02);
        this.nextDrum += 0.03 + Math.random() * 0.05;
      }
    } else this.rainRoof.gain.setTargetAtTime(0, t, 0.2);

    // Birds at random intervals, quieter and rarer up high.
    // In rain they keep quiet.
    if (rain > 0.5) this.nextBird = Math.max(this.nextBird, t + 5);
    if (t >= this.nextBird) {
      const B = A.birds;
      const kooka = Math.random() < B.kookaburraChance;
      const phrase = kooka ? kookaburraPhrase(Math.random) : magpiePhrase(Math.random);
      const near = 0.5 + Math.random() * 0.5;
      playPhrase(
        this.ctx,
        this.bus,
        phrase,
        B.gain * near * (1 - 0.5 * alt),
        Math.random() * 1.6 - 0.8,
        2500 + near * 5000,
      );
      this.lastBird = phrase.kind;
      this.nextBird = t + phrase.duration + B.minInterval + Math.random() * (B.maxInterval - B.minInterval);
    }
  }

  /** Play a bird call now (debug and tests). */
  bird(kind: 'kookaburra' | 'magpie'): void {
    const phrase = kind === 'kookaburra' ? kookaburraPhrase(Math.random) : magpiePhrase(Math.random);
    playPhrase(this.ctx, this.bus, phrase, audioTuning.ambience.birds.gain, 0, 8000);
    this.lastBird = kind;
  }
}
