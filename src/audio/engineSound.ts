import { audioTuning } from '../data/audio';
import { vehicleTuning } from '../data/vehicle';
import { loop, type NoiseBank } from './buffers';
import { engineGain, firingHz } from './mix';
import { starter, stallClunk } from './oneShots';

export interface EngineFrame {
  rpm: number;
  load: number;
  throttle: number;
  running: boolean;
  /** Flooding is cutting the power right now. */
  powerCut: boolean;
}

const SMOOTH = 0.04;

/**
 * Engine (SPEC §13): a harmonic-rich oscillator at the firing frequency, a crank-rate
 * rumble under it and combustion noise pulsed at the firing rate. Load brings in noise
 * and distortion and opens the filter.
 */
export class EngineSound {
  private readonly osc: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly pulse: OscillatorNode;
  private readonly noiseBand: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private readonly clean: GainNode;
  private readonly dirty: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly out: GainNode;
  /** Mute while the starter cranks after a restart. */
  private mutedUntil = 0;
  hz = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    private readonly noise: NoiseBank,
  ) {
    const E = audioTuning.engine;
    const real = new Float32Array(E.harmonics.length + 1);
    const imag = new Float32Array(E.harmonics.length + 1);
    E.harmonics.forEach((a, i) => {
      // Alternate phases so the wave looks like sharp firing pulses.
      real[i + 1] = i % 2 === 0 ? a * 0.5 : 0;
      imag[i + 1] = a;
    });
    this.osc = ctx.createOscillator();
    this.osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    this.sub = ctx.createOscillator();
    this.sub.type = 'triangle';
    const subGain = ctx.createGain();
    subGain.gain.value = E.halfOrderGain;

    // Combustion noise, amplitude-pulsed at the firing rate.
    const src = loop(ctx, noise.brown);
    this.noiseBand = ctx.createBiquadFilter();
    this.noiseBand.type = 'bandpass';
    this.noiseBand.Q.value = 1.2;
    const pulsed = ctx.createGain();
    pulsed.gain.value = 0.5;
    this.pulse = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    this.pulse.connect(depth).connect(pulsed.gain);
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = E.noise.idle;
    src.connect(this.noiseBand).connect(pulsed).connect(this.noiseGain);

    const sum = ctx.createGain();
    sum.gain.value = 0.5;
    this.osc.connect(sum);
    this.sub.connect(subGain).connect(sum);
    this.noiseGain.connect(sum);

    // Clean and distorted paths, cross-faded by load.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(4 * x) / Math.tanh(4);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    this.clean = ctx.createGain();
    this.dirty = ctx.createGain();
    this.dirty.gain.value = 0;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.Q.value = 0.9;
    sum.connect(this.clean).connect(this.lowpass);
    sum.connect(shaper).connect(this.dirty).connect(this.lowpass);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.lowpass.connect(this.out).connect(bus);

    for (const o of [this.osc, this.sub, this.pulse]) o.start();
  }

  update(e: EngineFrame): void {
    const E = audioTuning.engine;
    const t = this.ctx.currentTime;
    const hz = Math.max(4, firingHz(e.rpm));
    this.hz = hz;
    this.osc.frequency.setTargetAtTime(hz, t, SMOOTH);
    this.sub.frequency.setTargetAtTime(hz / 2, t, SMOOTH);
    this.pulse.frequency.setTargetAtTime(hz, t, SMOOTH);
    this.noiseBand.frequency.setTargetAtTime(Math.min(4000, hz * 7 + 200), t, SMOOTH);
    this.noiseGain.gain.setTargetAtTime(E.noise.idle + (E.noise.load - E.noise.idle) * e.load, t, 0.08);
    this.lowpass.frequency.setTargetAtTime(
      E.filter.base + e.rpm * E.filter.perRpm + e.load * E.filter.loadHz,
      t,
      0.06,
    );
    this.clean.gain.setTargetAtTime(1 - E.grit * e.load, t, 0.08);
    this.dirty.gain.setTargetAtTime(0.1 + E.grit * e.load, t, 0.08);

    const eng = vehicleTuning.engine;
    let level = engineGain(e.rpm, e.load, e.throttle, eng.idleRpm, eng.redlineRpm);
    // Stalling: the pitch follows the rpm down and the level fades with it.
    if (!e.running) level *= Math.min(1, e.rpm / 600);
    if (e.powerCut) level *= E.sputterGain;
    if (t < this.mutedUntil) level = 0;
    this.out.gain.setTargetAtTime(level, t, e.powerCut ? 0.015 : 0.05);
  }

  stalled(): void {
    stallClunk(this.ctx, this.bus, this.noise);
  }

  restarted(): void {
    starter(this.ctx, this.bus);
    this.mutedUntil = this.ctx.currentTime + audioTuning.engine.starter.seconds * 0.75;
  }

  get level(): number {
    return this.out.gain.value;
  }
}

/** Two-tone horn. */
export class HornSound {
  private readonly out: GainNode;
  on = false;

  constructor(
    private readonly ctx: AudioContext,
    bus: AudioNode,
  ) {
    const H = audioTuning.horn;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.8;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2.5 * ((i / 255) * 2 - 1));
    shaper.curve = curve;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    for (const hz of H.tones) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = hz;
      o.connect(f);
      o.start();
    }
    f.connect(shaper).connect(this.out).connect(bus);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.out.gain.setTargetAtTime(on ? audioTuning.horn.gain : 0, this.ctx.currentTime, on ? 0.01 : 0.03);
  }
}
