import { audioTuning, type TyreLayer } from '../data/audio';
import { loop, type NoiseBank } from './buffers';
import { emptyWeights, tyreWeights, type LayerWeights, type WheelSound } from './mix';
import { splash } from './oneShots';

interface LayerSpec {
  buffer: keyof NoiseBank;
  filter: BiquadFilterType;
  /** Playback rate at standstill and at full speed (faster grains when moving fast). */
  rate: [number, number];
}

const LAYERS: Record<TyreLayer, LayerSpec> = {
  dirt: { buffer: 'crunch', filter: 'bandpass', rate: [0.6, 1.4] },
  gravel: { buffer: 'rattle', filter: 'highpass', rate: [0.7, 1.5] },
  grass: { buffer: 'white', filter: 'bandpass', rate: [1, 1] },
  rock: { buffer: 'crunch', filter: 'lowpass', rate: [0.5, 1] },
  mud: { buffer: 'squelch', filter: 'lowpass', rate: [0.8, 1.3] },
  water: { buffer: 'white', filter: 'bandpass', rate: [1, 1] },
  wood: { buffer: 'crunch', filter: 'bandpass', rate: [0.4, 0.9] },
  scrub: { buffer: 'white', filter: 'bandpass', rate: [1, 1] },
  squeal: { buffer: 'white', filter: 'bandpass', rate: [1, 1] },
};

interface Layer {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  spec: LayerSpec;
}

/**
 * Tyre noise (SPEC §13): one filtered noise layer per surface, cross-faded by how many
 * wheels are on each surface and scaled by wheel speed and slip.
 */
export class TyreSound {
  private readonly layers = new Map<TyreLayer, Layer>();
  readonly weights: LayerWeights = emptyWeights();
  private readonly prevWater = [0, 0, 0, 0];
  private lastSplash = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    private readonly noise: NoiseBank,
  ) {
    for (const [name, spec] of Object.entries(LAYERS) as [TyreLayer, LayerSpec][]) {
      const cfg = audioTuning.tyres.layers[name];
      const src = loop(ctx, noise[spec.buffer]);
      const f = ctx.createBiquadFilter();
      f.type = spec.filter;
      f.frequency.value = cfg.filterHz;
      f.Q.value = cfg.q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(bus);
      this.layers.set(name, { src, filter: f, gain, spec });
    }
  }

  update(wheels: readonly WheelSound[], speed: number): void {
    const t = this.ctx.currentTime;
    tyreWeights(wheels, speed, this.weights);
    const fast = Math.min(1, Math.abs(speed) / audioTuning.tyres.fullSpeed);
    for (const [name, l] of this.layers) {
      const w = this.weights[name];
      let level = w * audioTuning.tyres.layers[name].gain;
      if (name === 'squeal' && w > 0) {
        // Stick-slip: the pitch and level chatter as the rubber grabs and lets go.
        const base = audioTuning.tyres.layers.squeal.filterHz;
        l.filter.frequency.setTargetAtTime(base * (0.8 + 0.5 * Math.random()), t, 0.02);
        level *= 0.55 + 0.9 * Math.random();
      }
      l.gain.gain.setTargetAtTime(level, t, name === 'squeal' ? 0.02 : 0.08);
      const [r0, r1] = l.spec.rate;
      if (r0 !== r1) l.src.playbackRate.setTargetAtTime(r0 + (r1 - r0) * fast, t, 0.1);
    }
    // Splash when a wheel drops into water at speed.
    const depth = audioTuning.tyres.waterDepth;
    for (let i = 0; i < wheels.length && i < 4; i++) {
      const water = wheels[i].water;
      const entered = this.prevWater[i] < depth * 0.5 && water > depth;
      if (entered && Math.abs(speed) > 2.5 && t - this.lastSplash > 0.25) {
        splash(this.ctx, this.bus, this.noise, Math.min(1, Math.abs(speed) / 8));
        this.lastSplash = t;
      }
      this.prevWater[i] = water;
    }
  }
}
