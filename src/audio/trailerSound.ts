import { audioTuning } from '../data/audio';
import { burst, loop, type NoiseBank } from './buffers';
import { trailerRattleLevel } from './mix';
import { pluck } from './oneShots';

/** What the trailer's sound reads from the game each frame. */
export interface TrailerFrame {
  /** Speed of the towing vehicle (m/s). */
  speed: number;
  /** Summed spring movement of the trailer's grounded wheels (m/s). */
  roughness: number;
  /** Full drums on board. */
  drums: number;
}

function gain(ctx: BaseAudioContext, out: AudioNode, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(out);
  return g;
}

function band(
  ctx: BaseAudioContext,
  hz: number,
  q: number,
  type: BiquadFilterType = 'bandpass',
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

/** A low sine thud dropping in pitch. */
function thud(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  hz: number,
  level: number,
  decay: number,
): void {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(hz, at);
  o.frequency.exponentialRampToValueAtTime(hz * 0.6, at + decay);
  const g = gain(ctx, out);
  o.connect(g);
  pluck(g.gain, at, level, 0.004, decay);
  o.start(at);
  o.stop(at + decay * 2);
}

/** Struck steel: inharmonic partials, each a fast-decaying sine. */
function ring(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  partials: number[],
  level: number,
  decay: number,
): void {
  for (const hz of partials) {
    const o = ctx.createOscillator();
    o.frequency.value = hz * (0.97 + Math.random() * 0.06);
    const g = gain(ctx, out);
    o.connect(g);
    pluck(g.gain, at, level, 0.002, decay * (0.6 + Math.random() * 0.6));
    o.start(at);
    o.stop(at + decay * 2.5);
  }
}

/**
 * The trailer behind the car: its sheet-steel box and safety chains rattling over rough
 * ground, a bang from the box (or a hollow boom from full drums) on a hard hit, and the
 * coupling going on and off the ball.
 */
export class TrailerSound {
  private readonly rattle: GainNode;
  private readonly chains: GainNode;
  level = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    private readonly noise: NoiseBank,
  ) {
    this.rattle = gain(ctx, bus);
    const src = loop(ctx, noise.rattle);
    // The box's panels: a low clatter and a tinny upper band.
    src.connect(band(ctx, 650, 1.6)).connect(this.rattle);
    src.connect(band(ctx, 1900, 2.5)).connect(this.rattle);
    this.chains = gain(ctx, bus);
    loop(ctx, noise.rattle)
      .connect(band(ctx, 4200, 0.8, 'highpass'))
      .connect(this.chains);
  }

  /** Follow the trailer; null when nothing is on the back. */
  update(f: TrailerFrame | null): void {
    const t = this.ctx.currentTime;
    const T = audioTuning.trailer;
    const level = f ? trailerRattleLevel(f.roughness, f.speed, f.drums) : 0;
    this.level = level;
    // Loose panels chatter unevenly.
    const chatter = level > 0 ? 0.5 + Math.random() : 0;
    this.rattle.gain.setTargetAtTime(level * chatter * T.rattleGain, t, 0.02);
    this.chains.gain.setTargetAtTime(level * T.rattleGain * 0.35, t, 0.05);
  }

  /** A wheel hit hard: the empty box bangs; full drums boom and knock against each other. */
  bump(level: number, drums: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const L = level * audioTuning.trailer.bumpGain;
    thud(ctx, this.bus, at, 70 + Math.random() * 15, L * 0.8, 0.14);
    const n = burst(ctx, this.noise.crunch, at, 0.12);
    const g = gain(ctx, this.bus);
    n.connect(band(ctx, 1400, 1)).connect(g);
    pluck(g.gain, at, L * 0.5, 0.002, 0.06);
    if (drums > 0) {
      // Steel drums are hollow above the diesel: a low boom and a clank where two touch.
      ring(ctx, this.bus, at + 0.01, [118, 197, 331], L * 0.22, 0.5);
      ring(ctx, this.bus, at + 0.03, [880, 1370], L * 0.06, 0.2);
    } else ring(ctx, this.bus, at, [430, 710, 1150, 1760], L * 0.09, 0.3);
  }

  /** Hitching: the jockey wheel wound up, then the coupling dropping onto the ball (and back). */
  coupling(on: boolean): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const L = audioTuning.trailer.couplingGain;
    // The jockey wheel's handle: a few turns of a dry thread.
    const wind = on ? 0.25 : 0;
    for (let k = 0; k < 5; k++) {
      const c = burst(ctx, this.noise.white, at + (on ? k * 0.05 : 0.3 + k * 0.05), 0.02);
      const g = gain(ctx, this.bus);
      c.connect(band(ctx, 2600, 4)).connect(g);
      pluck(g.gain, at + (on ? k * 0.05 : 0.3 + k * 0.05), L * 0.25, 0.001, 0.015);
    }
    // The coupling's latch and the socket meeting the ball.
    thud(ctx, this.bus, at + wind, on ? 95 : 120, L, 0.1);
    ring(ctx, this.bus, at + wind, [640, 1080, 1830], L * 0.12, 0.25);
  }

  /** Over on its side: steel scraping and a heavy thud. */
  tipped(drums: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const L = audioTuning.trailer.bumpGain;
    thud(ctx, this.bus, at, 50, L, 0.3);
    const n = burst(ctx, this.noise.crunch, at, 0.6);
    const g = gain(ctx, this.bus);
    n.connect(band(ctx, 1200, 0.8)).connect(g);
    pluck(g.gain, at, L * 0.7, 0.004, 0.4);
    ring(ctx, this.bus, at, drums > 0 ? [118, 197, 331, 880] : [430, 710, 1150], L * 0.12, 0.5);
  }

  /** The A-frame meets the towbar's tongue. */
  jackknifed(): void {
    const at = this.ctx.currentTime;
    const L = audioTuning.trailer.couplingGain;
    thud(this.ctx, this.bus, at, 80, L * 0.8, 0.12);
    ring(this.ctx, this.bus, at, [520, 890, 1490], L * 0.14, 0.3);
  }
}
