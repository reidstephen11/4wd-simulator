import { audioTuning } from '../data/audio';
import { loop, type NoiseBank } from './buffers';
import { winchPitch } from './mix';
import { creak } from './oneShots';

export interface WinchFrame {
  attached: boolean;
  /** -1 paying out, 0 idle, 1 reeling in. */
  motor: number;
  /** Cable pull as a fraction of the winch's maximum. */
  load: number;
}

/** Electric winch motor whine (pitch drops under load) and cable creaks when taut. */
export class WinchSound {
  private readonly osc: OscillatorNode;
  private readonly osc2: OscillatorNode;
  private readonly out: GainNode;
  private readonly whir: GainNode;
  private nextCreak = 0;
  hz = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    noise: NoiseBank,
  ) {
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200;
    band.Q.value = 1.4;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.osc.connect(band);
    this.osc2.connect(g2).connect(band);
    band.connect(this.out).connect(bus);
    // Brush and gear whir.
    const n = loop(ctx, noise.white);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200;
    hp.Q.value = 1.5;
    this.whir = ctx.createGain();
    this.whir.gain.value = 0;
    n.connect(hp).connect(this.whir).connect(bus);
    this.osc.start();
    this.osc2.start();
  }

  update(w: WinchFrame): void {
    const W = audioTuning.winch;
    const t = this.ctx.currentTime;
    const running = w.attached && w.motor !== 0;
    const hz = winchPitch(w.load, w.motor);
    this.hz = running ? hz : 0;
    this.osc.frequency.setTargetAtTime(hz, t, 0.12);
    this.osc2.frequency.setTargetAtTime(hz * 2.01, t, 0.12);
    const level = running ? W.gain * (0.7 + 0.5 * Math.min(1, w.load)) : 0;
    this.out.gain.setTargetAtTime(level, t, running ? 0.05 : 0.12);
    this.whir.gain.setTargetAtTime(running ? W.gain * 0.25 : 0, t, 0.08);

    // Creaks come more often the harder the cable pulls.
    if (w.attached && w.load > W.creakFrom) {
      if (this.nextCreak === 0) this.nextCreak = t + Math.random() / W.creakRate;
      else if (t >= this.nextCreak) {
        creak(this.ctx, this.bus, 0.4 + 0.6 * Math.min(1, w.load));
        const rate = W.creakRate * Math.min(1, w.load);
        this.nextCreak = t + (0.3 + Math.random() * 1.4) / Math.max(0.3, rate);
      }
    } else this.nextCreak = 0;
  }
}
