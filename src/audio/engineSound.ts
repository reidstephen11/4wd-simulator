import { audioTuning, engineSynthTunings } from '../data/audio';
import { vehicleTuning, type VehicleId } from '../data/vehicle';
import { vehicles } from '../data/vehicles';
import { loop, type NoiseBank } from './buffers';
import { ENGINE_PROCESSOR } from './engine/processorName';
import workletUrl from './engine/engineWorklet?worker&url';
import { engineGain, firingHz } from './mix';
import { starter, stallClunk } from './oneShots';

export interface EngineFrame {
  rpm: number;
  load: number;
  throttle: number;
  running: boolean;
  /** Flooding is cutting the power right now. */
  powerCut: boolean;
  /** 0..1 chance that a cylinder misfires (water in the intake). */
  misfire: number;
  /** Transfer-case input shaft speed (rev/s), for gear whine. */
  shaftHz: number;
  /** 0..1 transfer-case and gearbox whine level. */
  whine: number;
}

const SMOOTH = 0.04;

/** One way of making the engine sound. */
interface EngineVoice {
  readonly kind: 'synth' | 'oscillator';
  update(e: EngineFrame): void;
  /** Starter motor, then the engine catches. */
  start(): void;
  /** Sound like this vehicle's engine. */
  setVehicle(id: VehicleId): void;
  readonly level: number;
}

/**
 * Engine (SPEC §13). Uses the inline-six synthesiser on the audio thread
 * (engine/engineSynth.ts) and falls back to an oscillator engine where AudioWorklet
 * isn't available. The worklet module loads asynchronously; a start requested before
 * it is ready plays once it is.
 */
export class EngineSound {
  private voice: EngineVoice | null = null;
  private startPending = false;
  private vehicle: VehicleId = 'shortie';
  hz = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    private readonly noise: NoiseBank,
  ) {
    const fallback = () => this.useVoice(new OscillatorEngine(ctx, bus, noise));
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') fallback();
    else
      ctx.audioWorklet
        .addModule(workletUrl)
        .then(() => this.useVoice(new SynthEngine(ctx, bus)))
        .catch(fallback);
  }

  private useVoice(v: EngineVoice): void {
    this.voice = v;
    v.setVehicle(this.vehicle);
    if (this.startPending) v.start();
    this.startPending = false;
  }

  update(e: EngineFrame): void {
    this.hz = Math.max(4, firingHz(e.rpm, engineSynthTunings[this.vehicle].firingOrder.length));
    this.voice?.update(e);
  }

  /** Switch to another vehicle's engine (the caller plays the start-up after a swap). */
  setVehicle(id: VehicleId): void {
    this.vehicle = id;
    this.voice?.setVehicle(id);
  }

  stalled(): void {
    stallClunk(this.ctx, this.bus, this.noise);
  }

  /** Play the starter and the engine catching (after a stall, or when sound first starts). */
  restarted(): void {
    if (this.voice) this.voice.start();
    else this.startPending = true;
  }

  get level(): number {
    return this.voice?.level ?? 0;
  }

  /** Which engine sound is playing ('loading' until the worklet module is ready). */
  get kind(): EngineVoice['kind'] | 'loading' {
    return this.voice?.kind ?? 'loading';
  }
}

/** The inline-six synthesiser running in an AudioWorkletNode. */
class SynthEngine implements EngineVoice {
  readonly kind = 'synth';
  private readonly node: AudioWorkletNode;
  private readonly out: GainNode;
  private readonly params: Record<
    'rpm' | 'load' | 'throttle' | 'running' | 'misfire' | 'shaftHz' | 'whine',
    AudioParam
  >;

  constructor(
    private readonly ctx: AudioContext,
    bus: AudioNode,
  ) {
    this.node = new AudioWorkletNode(ctx, ENGINE_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const param = (name: string) => this.node.parameters.get(name) as AudioParam;
    this.params = {
      rpm: param('rpm'),
      load: param('load'),
      throttle: param('throttle'),
      running: param('running'),
      misfire: param('misfire'),
      shaftHz: param('shaftHz'),
      whine: param('whine'),
    };
    this.out = ctx.createGain();
    this.out.gain.value = audioTuning.engine.synthGain;
    this.node.connect(this.out).connect(bus);
  }

  update(e: EngineFrame): void {
    const t = this.ctx.currentTime;
    const p = this.params;
    p.rpm.setTargetAtTime(Math.max(0, e.rpm), t, 0.02);
    p.load.setTargetAtTime(e.load, t, 0.03);
    p.throttle.setTargetAtTime(e.throttle, t, 0.02);
    p.running.setValueAtTime(e.running ? 1 : 0, t);
    p.misfire.setValueAtTime(e.powerCut ? Math.max(0.85, e.misfire) : e.misfire, t);
    p.shaftHz.setTargetAtTime(e.shaftHz, t, 0.03);
    p.whine.setTargetAtTime(e.whine, t, 0.05);
  }

  start(): void {
    this.node.port.postMessage({ type: 'start' });
  }

  setVehicle(id: VehicleId): void {
    this.node.port.postMessage({ type: 'vehicle', id });
  }

  get level(): number {
    return this.out.gain.value;
  }
}

/**
 * Fallback engine: a harmonic-rich oscillator at the firing frequency, a crank-rate
 * rumble under it and combustion noise pulsed at the firing rate. Load brings in noise
 * and distortion and opens the filter.
 */
class OscillatorEngine implements EngineVoice {
  readonly kind = 'oscillator';
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
  private cylinders = 6;
  private engine = vehicleTuning.engine;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    noise: NoiseBank,
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
    const hz = Math.max(4, firingHz(e.rpm, this.cylinders));
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

    const eng = this.engine;
    let level = engineGain(e.rpm, e.load, e.throttle, eng.idleRpm, eng.redlineRpm);
    // Stalling: the pitch follows the rpm down and the level fades with it.
    if (!e.running) level *= Math.min(1, e.rpm / 600);
    if (e.powerCut) level *= E.sputterGain;
    if (t < this.mutedUntil) level = 0;
    this.out.gain.setTargetAtTime(level, t, e.powerCut ? 0.015 : 0.05);
  }

  setVehicle(id: VehicleId): void {
    this.cylinders = engineSynthTunings[id].firingOrder.length;
    this.engine = vehicles[id].tuning.engine;
  }

  start(): void {
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
