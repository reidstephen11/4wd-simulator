import { audioTuning } from '../data/audio';
import { burst, type NoiseBank } from './buffers';

/** Short percussive envelope on a gain param: quick rise, exponential fall. */
export function pluck(g: AudioParam, at: number, peak: number, attack: number, decay: number): void {
  g.setValueAtTime(0, at);
  g.linearRampToValueAtTime(peak, at + attack);
  g.setTargetAtTime(0, at + attack, decay / 3);
}

function gain(ctx: BaseAudioContext, out: AudioNode, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(out);
  return g;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

/** A low sine "thud" that drops in pitch. */
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

/** Suspension thump: low thud plus a short muffled knock. */
export function thump(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, level: number): void {
  const at = ctx.currentTime;
  const L = level * audioTuning.thump.gain;
  thud(ctx, out, at, 62 + Math.random() * 18, L, 0.16);
  const n = burst(ctx, noise.brown, at, 0.2);
  const f = filter(ctx, 'lowpass', 380);
  const g = gain(ctx, out);
  n.connect(f).connect(g);
  pluck(g.gain, at, L * 0.6, 0.003, 0.08);
}

/** Body hit hard enough to dent: crunch of noise, a thud and a short metallic ring. */
export function dentCrunch(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, level: number): void {
  const at = ctx.currentTime;
  const L = level * audioTuning.dent.gain;
  thud(ctx, out, at, 55, L, 0.25);
  const n = burst(ctx, noise.crunch, at, 0.35);
  const f = filter(ctx, 'bandpass', 1300, 0.8);
  const g = gain(ctx, out);
  n.connect(f).connect(g);
  pluck(g.gain, at, L * 0.9, 0.002, 0.18);
  for (const hz of [380, 517, 1240]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz * (0.97 + Math.random() * 0.06);
    const og = gain(ctx, out);
    o.connect(og);
    pluck(og.gain, at, L * 0.12, 0.002, 0.45);
    o.start(at);
    o.stop(at + 0.8);
  }
}

/** Water splash when a wheel hits the creek at speed. */
export function splash(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, level: number): void {
  const at = ctx.currentTime;
  const n = burst(ctx, noise.white, at, 0.7);
  const f = filter(ctx, 'bandpass', 900, 0.6);
  f.frequency.setValueAtTime(1600, at);
  f.frequency.exponentialRampToValueAtTime(500, at + 0.5);
  const g = gain(ctx, out);
  n.connect(f).connect(g);
  pluck(g.gain, at, level * audioTuning.tyres.splashGain, 0.01, 0.5);
}

/** Engine stall: a final shudder and clunk. */
export function stallClunk(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank): void {
  const at = ctx.currentTime + 0.28;
  const L = audioTuning.engine.stallClunkGain;
  thud(ctx, out, at, 48, L, 0.3);
  const n = burst(ctx, noise.crunch, at, 0.25);
  const f = filter(ctx, 'lowpass', 700);
  const g = gain(ctx, out);
  n.connect(f).connect(g);
  pluck(g.gain, at, L * 0.4, 0.004, 0.15);
}

/** Starter motor cranking before the engine catches. */
export function starter(ctx: BaseAudioContext, out: AudioNode): void {
  const s = audioTuning.engine.starter;
  const at = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(s.hz * 0.8, at);
  o.frequency.linearRampToValueAtTime(s.hz, at + s.seconds);
  const f = filter(ctx, 'bandpass', 650, 1.4);
  // Each compression stroke slows the starter: pulse the level.
  const pulse = ctx.createOscillator();
  pulse.type = 'square';
  pulse.frequency.value = s.pulseHz;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  const g = gain(ctx, out);
  const amp = gain(ctx, g, 0.6);
  pulse.connect(depth).connect(amp.gain);
  o.connect(f).connect(amp);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(s.gain, at + 0.03);
  g.gain.setValueAtTime(s.gain, at + s.seconds - 0.08);
  g.gain.linearRampToValueAtTime(0, at + s.seconds);
  o.start(at);
  pulse.start(at);
  o.stop(at + s.seconds + 0.05);
  pulse.stop(at + s.seconds + 0.05);
}

/** Wooden creak of a taut cable: a stick-slip buzz through a narrow resonance. */
export function creak(ctx: BaseAudioContext, out: AudioNode, level: number): void {
  const at = ctx.currentTime;
  const dur = 0.12 + Math.random() * 0.3;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const f0 = 35 + Math.random() * 40;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.8), at + dur);
  const f = filter(ctx, 'bandpass', 900 + Math.random() * 900, 9);
  const g = gain(ctx, out);
  o.connect(f).connect(g);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level * audioTuning.winch.creakGain, at + dur * 0.3);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.start(at);
  o.stop(at + dur + 0.02);
}
