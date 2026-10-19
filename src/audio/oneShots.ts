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

/** Inharmonic ringing partials (a struck steel rail or panel), each a fast-decaying sine. */
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
    o.type = 'sine';
    o.frequency.value = hz * (0.97 + Math.random() * 0.06);
    const g = gain(ctx, out);
    o.connect(g);
    pluck(g.gain, at, level, 0.002, decay * (0.6 + Math.random() * 0.6));
    o.start(at);
    o.stop(at + decay * 2.5);
  }
}

/** The chassis knocks a rock: a dull thud, a gritty clack and the frame rails ringing. */
export function knock(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, level: number): void {
  const at = ctx.currentTime;
  const L = level * audioTuning.knock.gain;
  thud(ctx, out, at, 58 + Math.random() * 20, L, 0.18);
  const n = burst(ctx, noise.crunch, at, 0.15);
  const f = filter(ctx, 'bandpass', 700 + Math.random() * 500, 1.1);
  const g = gain(ctx, out);
  n.connect(f).connect(g);
  pluck(g.gain, at, L * 0.7, 0.002, 0.07);
  ring(ctx, out, at, [310, 523, 871, 1460], L * 0.07, 0.35);
}

/** A leaf spring or the body flexing: a short stick-slip squeak (or a lower creak). */
export function squeak(ctx: BaseAudioContext, out: AudioNode, level: number, low: boolean): void {
  const at = ctx.currentTime;
  const dur = low ? 0.18 + Math.random() * 0.3 : 0.06 + Math.random() * 0.16;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const f0 = (low ? 22 : 30) + Math.random() * 25;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.linearRampToValueAtTime(f0 * (0.75 + Math.random() * 0.6), at + dur);
  const band = low ? 450 + Math.random() * 400 : 1700 + Math.random() * 1400;
  const f = filter(ctx, 'bandpass', band, low ? 7 : 12);
  const g = gain(ctx, out);
  o.connect(f).connect(g);
  const L = level * audioTuning.squeak.gain * (low ? 1.3 : 1);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(L, at + dur * 0.25);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Handbrake: the ratchet clicks as the lever comes up; letting it off, one click and a thunk. */
export function ratchet(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, on: boolean): void {
  const at = ctx.currentTime;
  const L = audioTuning.clunk.handbrake;
  for (const t of on ? [0, 0.07, 0.13, 0.18, 0.22] : [0]) {
    const click = burst(ctx, noise.white, at + t, 0.015);
    const f = filter(ctx, 'bandpass', 2800, 3);
    const g = gain(ctx, out);
    click.connect(f).connect(g);
    pluck(g.gain, at + t, L, 0.001, 0.01);
  }
  thud(ctx, out, at + (on ? 0.24 : 0.04), on ? 110 : 85, L * 0.5, 0.07);
}

/** The headlight switch: a pull-knob's click, a little lower for the high-beam stalk. */
export function switchClick(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBank, high: boolean): void {
  const at = ctx.currentTime;
  const L = audioTuning.clunk.lightSwitch;
  const click = burst(ctx, noise.white, at, 0.012);
  const f = filter(ctx, 'bandpass', high ? 1900 : 3200, 2.5);
  const g = gain(ctx, out);
  click.connect(f).connect(g);
  pluck(g.gain, at, L, 0.001, 0.008);
  thud(ctx, out, at + 0.005, high ? 160 : 210, L * 0.35, 0.03);
}

/** Drivetrain clunks: transfer-case range change, an air locker, selecting drive or reverse. */
export function clunk(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: NoiseBank,
  kind: 'range' | 'lockOn' | 'lockOff' | 'gear',
): void {
  const at = ctx.currentTime;
  const C = audioTuning.clunk;
  if (kind === 'range') {
    // Gears sliding into mesh, then a heavy clunk through the floor.
    const grind = burst(ctx, noise.rattle, at, 0.16);
    const gf = filter(ctx, 'bandpass', 1500, 1.4);
    const gg = gain(ctx, out);
    grind.connect(gf).connect(gg);
    pluck(gg.gain, at, C.range * 0.35, 0.02, 0.12);
    thud(ctx, out, at + 0.12, 52, C.range, 0.22);
    ring(ctx, out, at + 0.12, [240, 410, 690], C.range * 0.08, 0.25);
  } else if (kind === 'gear') {
    thud(ctx, out, at, 75, C.gear, 0.12);
    ring(ctx, out, at, [380, 640], C.gear * 0.06, 0.15);
  } else {
    // Air locker: the solenoid clicks, then air hisses into (or out of) the diff.
    const click = burst(ctx, noise.white, at, 0.02);
    const cf = filter(ctx, 'bandpass', 2400, 2);
    const cg = gain(ctx, out);
    click.connect(cf).connect(cg);
    pluck(cg.gain, at, C.locker * 0.8, 0.001, 0.012);
    const hiss = burst(ctx, noise.white, at + 0.03, kind === 'lockOn' ? 0.35 : 0.5);
    const hf = filter(ctx, 'highpass', kind === 'lockOn' ? 3500 : 2500, 0.7);
    const hg = gain(ctx, out);
    hiss.connect(hf).connect(hg);
    pluck(hg.gain, at + 0.03, C.locker * 0.35, 0.01, kind === 'lockOn' ? 0.22 : 0.4);
    if (kind === 'lockOn') thud(ctx, out, at + 0.2, 90, C.locker * 0.5, 0.08);
  }
}
