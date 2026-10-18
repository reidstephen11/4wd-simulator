import { audioTuning } from '../data/audio';
import { SurfaceId } from '../data/surfaces';
import { loop, type NoiseBank } from './buffers';
import { scrapeLevel, squeakRate } from './mix';
import { squeak } from './oneShots';

/** What the crawling sounds read from the game each frame. */
export interface CrawlFrame {
  dt: number;
  /** Chassis contact with the ground: force (N), sliding speed (m/s) and surface. */
  body: { force: number; slide: number; surface: SurfaceId };
  /** Vehicle weight (N). */
  weight: number;
  /** Summed suspension movement of the grounded wheels (m/s). */
  articulation: number;
  speed: number;
}

/**
 * Rock-crawling sounds: the chassis grinding over rock (frame rails and skid plates
 * ringing, grit crunching, chattering as it sticks and slips) and leaf springs and the
 * body squeaking as the axles articulate.
 */
export class CrawlSounds {
  private readonly metal: GainNode;
  private readonly metalBands: BiquadFilterNode[] = [];
  private readonly grit: GainNode;
  private readonly gritFilter: BiquadFilterNode;
  private nextSqueak = 0;
  scrape = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    noise: NoiseBank,
  ) {
    this.metal = ctx.createGain();
    this.metal.gain.value = 0;
    const src = loop(ctx, noise.white);
    for (const [hz, q] of [
      [1250, 3],
      [2650, 5],
      [4100, 6],
    ]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = hz;
      f.Q.value = q;
      src.connect(f).connect(this.metal);
      this.metalBands.push(f);
    }
    this.metal.connect(bus);
    this.grit = ctx.createGain();
    this.grit.gain.value = 0;
    this.gritFilter = ctx.createBiquadFilter();
    this.gritFilter.type = 'lowpass';
    this.gritFilter.frequency.value = 900;
    loop(ctx, noise.crunch).connect(this.gritFilter).connect(this.grit).connect(bus);
  }

  update(f: CrawlFrame): void {
    const t = this.ctx.currentTime;
    const S = audioTuning.scrape;
    const level = scrapeLevel(f.body.force, f.body.slide, f.weight);
    this.scrape = level;
    // Metal rings on rock; on dirt or timber it's mostly a dull drag.
    const metal = f.body.surface === SurfaceId.Rock ? 1 : f.body.surface === SurfaceId.Wood ? 0.4 : 0.15;
    // Stick-slip chatter, faster as it slides faster.
    const chatter = level > 0 ? 0.45 + Math.random() * 1.1 : 0;
    this.metal.gain.setTargetAtTime(level * metal * chatter * S.gain, t, 0.015);
    this.grit.gain.setTargetAtTime(level * (0.5 + 0.5 * Math.random()) * S.gain * 0.9, t, 0.02);
    const pitch = 0.85 + 0.4 * Math.min(1, f.body.slide / S.fullSlide);
    this.metalBands.forEach((b, i) => b.frequency.setTargetAtTime([1250, 2650, 4100][i] * pitch, t, 0.05));
    this.gritFilter.frequency.setTargetAtTime(
      500 + 900 * pitch * (f.body.surface === SurfaceId.Rock ? 1 : 0.6),
      t,
      0.05,
    );

    // Springs and body squeak at random, more often the more the axles work.
    const rate = squeakRate(f.articulation, f.speed);
    this.nextSqueak -= f.dt;
    if (rate > 0 && this.nextSqueak <= 0) {
      squeak(this.ctx, this.bus, 0.5 + 0.5 * Math.random(), Math.random() < 0.35);
      this.nextSqueak = (0.4 + Math.random() * 1.2) / rate;
    } else if (rate === 0) this.nextSqueak = Math.max(this.nextSqueak, 0.3);
  }
}
