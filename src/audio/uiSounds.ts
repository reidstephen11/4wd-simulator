import { audioTuning } from '../data/audio';
import { burst, type NoiseBank } from './buffers';
import { pluck } from './oneShots';

/** Interface sounds: discovery chime and map rustle. */
export class UiSounds {
  /** A soft echo shared by the chimes. */
  private readonly echo: DelayNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noise: NoiseBank,
  ) {
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(wet).connect(out);
  }

  chime(): void {
    chime(this.ctx, this.out, this.echo);
  }

  /** One soft bell note: a gate passed. */
  tick(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    o.frequency.value = 1318.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(this.out);
    g.connect(this.echo);
    pluck(g.gain, t, audioTuning.ui.chimeGain * 0.55, 0.005, 0.6);
    o.start(t);
    o.stop(t + 1);
  }

  rustle(level = 1): void {
    rustle(this.ctx, this.out, this.noise, level);
  }
}

/** Gentle rising bell chime for a discovery. */
function chime(ctx: BaseAudioContext, out: AudioNode, echo: AudioNode): void {
  const at = ctx.currentTime + 0.02;
  const L = audioTuning.ui.chimeGain;
  const notes = [659.3, 830.6, 987.8, 1318.5];
  notes.forEach((hz, i) => {
    const t = at + i * 0.1;
    for (const [mult, type, level] of [
      [1, 'sine', 1],
      [2, 'triangle', 0.18],
      [3.01, 'sine', 0.07],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz * mult;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(out);
      g.connect(echo);
      pluck(g.gain, t, L * level * (i === notes.length - 1 ? 1.1 : 0.8), 0.006, 1.3);
      o.start(t);
      o.stop(t + 2);
    }
  });
}

/** Soft rustle of a paper map being unfolded (or folded, quieter). */
function rustle(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, level = 1): void {
  const at = ctx.currentTime;
  const L = audioTuning.ui.rustleGain * level;
  const count = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const t = at + i * (0.045 + Math.random() * 0.05);
    const dur = 0.03 + Math.random() * 0.07;
    const src = burst(ctx, Math.random() < 0.5 ? noise.crunch : noise.white, t, dur + 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500 + Math.random() * 1500;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 4000 + Math.random() * 2500;
    bp.gain.value = 6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(hp).connect(bp).connect(g).connect(out);
    pluck(g.gain, t, L * (0.5 + Math.random() * 0.5), 0.008, dur);
  }
}
