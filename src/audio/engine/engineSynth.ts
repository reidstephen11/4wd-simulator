import { engineSynthTuning, type EngineSynthTuning } from '../../data/audio';
import { Biquad, DcBlock, Noise, OnePole, Pipe, clamp01 } from './dsp';

/** What the engine is doing, read once per audio block. */
export interface EngineInputs {
  rpm: number;
  /** 0..1 how hard the engine is working. */
  load: number;
  /** 0..1 throttle opening. */
  throttle: number;
  running: boolean;
  /** 0..1 chance that a cylinder fails to fire (water in the intake). */
  misfire: number;
  /** Transfer-case input shaft speed (rev/s), for gear whine. */
  shaftHz: number;
  /** 0..1 gear whine level (louder in low range and under load). */
  whine: number;
}

type Mode = 'run' | 'crank' | 'catch';

const DECAY_SIZE = 1024;
/** Pulses are cut off this many decay constants after their peak (e^-8 ≈ 0.03%). */
const DECAY_SPAN = 8;
const DECAY = (() => {
  const s = new Float32Array(DECAY_SIZE + 1);
  for (let i = 0; i <= DECAY_SIZE; i++) s[i] = Math.exp((-i / DECAY_SIZE) * DECAY_SPAN);
  return s;
})();

/**
 * Exhaust blowdown pressure pulse at `phi` degrees after the valve opens: a fast,
 * smooth rise over `rise` degrees, then an exponential fall with constant `decay`.
 */
function pulse(phi: number, rise: number, decay: number): number {
  if (phi <= 0) return 0;
  if (phi < rise) return 0.5 - 0.5 * Math.cos((Math.PI * phi) / rise);
  const u = (phi - rise) / decay;
  if (u >= DECAY_SPAN) return 0;
  const f = (u / DECAY_SPAN) * DECAY_SIZE;
  const i = f | 0;
  return DECAY[i] + (DECAY[i + 1] - DECAY[i]) * (f - i);
}

/** Rational tanh approximation, used as a gentle limiter on the final mix. */
function softClip(x: number): number {
  const c = x < -3 ? -3 : x > 3 ? 3 : x;
  return (c * (27 + c * c)) / (27 + 9 * c * c);
}

/**
 * Engine synthesiser (SPEC §13): by default the 4.2 L petrol six of a 1970s 40 Series,
 * or any other engine its tuning describes (the Perentie's four-cylinder diesel adds a
 * combustion knock). Each cylinder sends an exhaust pressure pulse down its manifold runner
 * once per two crank turns; the pulses run through a head pipe, muffler and tailpipe
 * whose resonances stay fixed in frequency while the firing rate sweeps through them.
 * Intake roar, valve-train tick, fan noise, the starter motor and transfer-case gear
 * whine are mixed in. No Web Audio here: the AudioWorklet calls `process` per block.
 */
export class EngineSynth {
  private readonly sr: number;
  private readonly T: EngineSynthTuning;
  private readonly cylinders: number;
  /** Crank degrees between firings, and between valve closings. */
  private readonly spacing: number;
  private readonly tickDeg: number;
  private readonly noise: Noise;
  private mode: Mode = 'run';
  private modeTime = 0;
  /** Crank angle (degrees) within the 720° four-stroke cycle. */
  private theta = 0;
  private rpmNow: number;
  private readonly rpmSmooth: OnePole;
  private readonly crankSpin: OnePole;
  private readonly manifold: OnePole;
  private readonly lope: OnePole;
  private lopeTarget = 0;
  private readonly falling: OnePole;
  private lastRpm: number;

  // Per firing slot (index in firing order).
  private readonly age: Float64Array;
  private readonly amp: Float64Array;
  private readonly rise: Float64Array;
  private readonly decay: Float64Array;
  private readonly offset: Float64Array;

  private readonly pulseDc: DcBlock;
  private readonly headPipe: Pipe;
  private readonly muffler: Biquad;
  private readonly boom: Biquad;
  private readonly tailPipe: Pipe;
  private readonly radiate: Biquad;
  private readonly block: Biquad;
  private readonly tickA: Biquad;
  private readonly tickB: Biquad;
  private tickAge = 0;
  private readonly intakeBand: Biquad;
  private readonly intakeDc: DcBlock;
  private readonly honk: Biquad;
  private readonly fan: Biquad;
  private readonly whistle: Biquad;
  private readonly starterLevel: OnePole;
  private starterPhase = 0;
  private readonly starterBand: Biquad;
  private readonly brushBand: Biquad;
  private readonly whineLevel: OnePole;
  private readonly whineShaft: OnePole;
  private whinePhase = 0;
  private readonly whineWobble: OnePole;
  private readonly knockA: Biquad;
  private readonly knockB: Biquad;
  /** Knock impulse from a firing this sample (diesel only). */
  private knock = 0;

  constructor(sampleRate: number, seed = 0x2f40, tuning: EngineSynthTuning = engineSynthTuning) {
    const sr = (this.sr = sampleRate);
    const T = (this.T = tuning);
    const n = (this.cylinders = T.firingOrder.length);
    this.spacing = 720 / n;
    this.tickDeg = 720 / (2 * n);
    this.rpmNow = this.lastRpm = T.idleRpm;
    this.age = new Float64Array(n);
    this.amp = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.decay = new Float64Array(n);
    this.offset = new Float64Array(n);
    this.noise = new Noise(seed);
    this.rpmSmooth = new OnePole(sr, 1).timeConstant(0.03);
    this.rpmSmooth.y = T.idleRpm;
    this.crankSpin = new OnePole(sr, 1).timeConstant(0.07);
    this.manifold = new OnePole(sr, 1).timeConstant(T.manifoldSeconds);
    this.lope = new OnePole(sr, 1).timeConstant(0.12);
    this.falling = new OnePole(sr, 1).timeConstant(0.25);
    for (let k = 0; k < n; k++) this.age[k] = (720 - this.spacing * k) % 720;

    const X = T.exhaust;
    this.pulseDc = new DcBlock(sr, 15);
    this.headPipe = new Pipe(
      sr,
      X.headPipe.length,
      X.soundSpeed,
      X.headPipe.reflection,
      X.headPipe.dampingHz,
    );
    this.muffler = new Biquad(sr).lowpass(X.muffler.cutoffHz, X.muffler.q);
    this.boom = new Biquad(sr).peaking(X.muffler.boomHz, X.muffler.boomQ, X.muffler.boomDb);
    this.tailPipe = new Pipe(
      sr,
      X.tailPipe.length,
      X.soundSpeed,
      X.tailPipe.reflection,
      X.tailPipe.dampingHz,
    );
    this.radiate = new Biquad(sr).highpass(X.radiationHz, 0.6);
    this.block = new Biquad(sr).lowpass(T.block.cutoffHz, 0.8);
    this.tickA = new Biquad(sr).bandpass(T.valves.hz[0], T.valves.q);
    this.tickB = new Biquad(sr).bandpass(T.valves.hz[1], T.valves.q);
    this.intakeBand = new Biquad(sr).bandpass(T.intake.noiseHz, 0.7);
    this.intakeDc = new DcBlock(sr, 30);
    this.honk = new Biquad(sr).bandpass(T.intake.honkHz, T.intake.honkQ);
    this.fan = new Biquad(sr).bandpass(T.fan.hz, 0.6);
    this.whistle = new Biquad(sr).bandpass(T.overrun.whistleHz, 6);
    this.starterLevel = new OnePole(sr, 1).timeConstant(0.03);
    this.starterBand = new Biquad(sr).bandpass(T.starter.toneHz, 1.3);
    this.brushBand = new Biquad(sr).bandpass(T.starter.brushHz, 1.5);
    this.whineLevel = new OnePole(sr, 1).timeConstant(0.08);
    this.whineShaft = new OnePole(sr, 1).timeConstant(0.05);
    this.whineWobble = new OnePole(sr, 30);
    const K = T.knock ?? { hz: [1500, 2900], q: 5 };
    this.knockA = new Biquad(sr).bandpass(K.hz[0], K.q);
    this.knockB = new Biquad(sr).bandpass(K.hz[1], K.q);
  }

  /** Engine speed the synthesiser is producing right now (follows the starter sequence). */
  get rpm(): number {
    return this.rpmNow;
  }

  get cranking(): boolean {
    return this.mode !== 'run';
  }

  /** Starter motor cranks, then the engine catches, flares and settles to idle. */
  start(): void {
    this.mode = 'crank';
    this.modeTime = 0;
    this.crankSpin.y = 0;
  }

  /** Fill `out[from..to)` with engine sound for these inputs. */
  process(out: Float32Array, inp: EngineInputs, from = 0, to = out.length): void {
    const sr = this.sr;
    const T = this.T;
    const dt = 1 / sr;
    const n = this.noise;
    const S = T.starter;
    const spacing = this.spacing;
    const pressureGoal = Math.max(clamp01(inp.throttle), clamp01(inp.load) * 0.85);
    const whineGoal = clamp01(inp.whine);
    for (let i = from; i < to; i++) {
      this.modeTime += dt;
      if (this.mode === 'crank' && this.modeTime > S.seconds) {
        this.mode = 'catch';
        this.modeTime = 0;
      } else if (this.mode === 'catch' && this.modeTime > T.catch.seconds) this.mode = 'run';

      // Engine speed: from the simulation, or from the starter sequence.
      const target = this.rpmSmooth.process(Math.max(0, inp.rpm));
      let rpm: number;
      let combustion = inp.running;
      let manifold = this.manifold.process(pressureGoal);
      if (this.mode === 'crank') {
        const spin = this.crankSpin.process(S.rpm);
        // Each compression stroke slows the crank (three per turn on a six, two on a four).
        const c = 0.5 + 0.5 * Math.cos((2 * Math.PI * (this.theta % spacing)) / spacing);
        rpm = spin * (1 - S.compressionDip * c * c);
        combustion = false;
      } else if (this.mode === 'catch') {
        const t = this.modeTime;
        const flare = T.catch.flareRpm * (1 - Math.exp(-t / 0.07));
        const settle = Math.exp(-Math.max(0, t - T.catch.flareSeconds) / T.catch.settleSeconds);
        rpm = target + (flare - target) * settle;
        manifold = Math.max(manifold, 0.75 * settle);
      } else {
        rpm = target;
        // A dying engine shudders through its last compressions.
        if (!inp.running && rpm < 420) {
          const c = 0.5 + 0.5 * Math.cos((2 * Math.PI * (this.theta % spacing)) / spacing);
          rpm *= 1 - 0.35 * c * c;
        }
      }
      // Idle lope: the rpm wanders a little from cycle to cycle.
      const idleness = clamp01(1 - (rpm - 700) / 900) * (1 - manifold);
      rpm += this.lope.process(this.lopeTarget) * idleness;
      this.rpmNow = rpm;
      const falling = this.falling.process(rpm < this.lastRpm - 0.02 ? 1 : 0);
      this.lastRpm = rpm;

      const degPerSec = Math.max(0, rpm) * 6;
      const dTheta = degPerSec * dt;
      this.theta += dTheta;
      if (this.theta >= 720) this.theta -= 720;
      const pressure = T.pressure.idle + (1 - T.pressure.idle) * Math.pow(manifold, 0.8);
      const overrun = manifold < 0.05 && rpm > T.overrun.fromRpm && falling > 0.5;

      // Exhaust pulses and intake suction per cylinder.
      let pulses = 0;
      let suction = 0;
      for (let k = 0; k < this.cylinders; k++) {
        let a = this.age[k] + dTheta;
        if (a >= 720) {
          a -= 720;
          this.fire(k, degPerSec, combustion, pressure, idleness, overrun, inp.misfire, rpm);
        }
        this.age[k] = a;
        pulses += this.amp[k] * pulse(a - this.offset[k], this.rise[k], this.decay[k]);
        suction += pulse(a - T.intake.openDeg, T.intake.riseDeg, T.intake.decayDeg);
      }

      // Gas rushing past the valves is turbulent: rougher under load.
      const rough = T.turbulence.idle + (T.turbulence.load - T.turbulence.idle) * manifold;
      pulses *= 1 + rough * n.next();
      // Exhaust system: head pipe, muffler (with its low boom), tailpipe, radiation.
      const p = this.pulseDc.process(pulses);
      const head = this.headPipe.process(p);
      const muffled = this.boom.process(this.muffler.process(head)) + head * T.exhaust.muffler.leak;
      const exhaust = this.radiate.process(this.tailPipe.process(muffled));
      const body = this.block.process(p);

      // Valve train: a light tick each time a valve closes (twelve per cycle on the six).
      this.tickAge += dTheta;
      let impulse = 0;
      if (this.tickAge >= this.tickDeg) {
        this.tickAge -= this.tickDeg;
        if (rpm > 60) impulse = (0.55 + 0.45 * n.unit()) * (0.35 + 0.65 * clamp01(rpm / 4000));
      }
      const tick = this.tickA.process(impulse) + 0.7 * this.tickB.process(impulse);

      // Intake: carburettor and air-cleaner roar, louder with throttle and revs.
      const revs = clamp01(rpm / 4000);
      const intakeLevel = Math.pow(manifold, 1.5) * (0.25 + 0.75 * revs);
      const intake = this.intakeBand.process(n.next()) * (0.3 + suction) * intakeLevel * T.intake.noiseGain;
      const honk = this.honk.process(this.intakeDc.process(suction)) * intakeLevel * T.intake.honkGain;
      const fan = this.fan.process(n.next()) * revs * revs * T.fan.gain;
      const whistle =
        this.whistle.process(n.next()) *
        (1 - manifold) *
        clamp01((rpm - T.overrun.fromRpm) / 2500) *
        T.overrun.whistleGain;

      // Starter motor: pinion gear whine and brush buzz while cranking.
      const starterOn = this.starterLevel.process(this.mode === 'crank' ? 1 : 0);
      let starter = 0;
      if (starterOn > 1e-3) {
        this.starterPhase += ((Math.max(0, rpm) / 60) * S.meshPerCrankTurn) / sr;
        this.starterPhase -= Math.floor(this.starterPhase);
        const saw = 2 * this.starterPhase - 1;
        starter =
          (this.starterBand.process(saw) + 0.4 * this.brushBand.process(n.next())) * starterOn * S.gain;
      }

      // Transfer case and gearbox whine, pitched to the shaft speed.
      const whineOn = this.whineLevel.process(whineGoal);
      let whine = 0;
      if (whineOn > 1e-4) {
        const shaft = this.whineShaft.process(Math.max(0, inp.shaftHz));
        this.whinePhase += shaft / sr;
        this.whinePhase -= Math.floor(this.whinePhase);
        const w = 2 * Math.PI * this.whinePhase;
        const G = T.whine;
        const mesh =
          Math.sin(w * G.teeth[0]) +
          G.second * Math.sin(w * G.teeth[1]) +
          G.harmonic * Math.sin(w * 2 * G.teeth[0]);
        const wobble = 1 + G.wobble * this.whineWobble.process(n.next() * 8);
        whine = mesh * (1 + G.shaftAm * Math.sin(w)) * wobble * whineOn * G.gain;
      }

      // Diesel knock: the sharp pressure rise of each combustion rings the block.
      let knock = 0;
      if (T.knock) {
        knock = (this.knockA.process(this.knock) + 0.6 * this.knockB.process(this.knock)) * T.knock.gain;
        this.knock = 0;
      }

      const mix =
        exhaust * T.exhaust.gain +
        knock +
        body * T.block.gain +
        tick * T.valves.gain +
        intake +
        honk +
        fan +
        whistle +
        starter +
        whine;
      out[i] = softClip(mix * T.outputGain);
    }
  }

  /** A cylinder's exhaust valve opens: set its pulse for this cycle. */
  private fire(
    k: number,
    degPerSec: number,
    combustion: boolean,
    pressure: number,
    idleness: number,
    overrun: boolean,
    misfire: number,
    rpm: number,
  ): void {
    const n = this.noise;
    const T = this.T;
    const cyl = T.firingOrder[k] - 1;
    const R = T.runners;
    let a: number;
    let sharp = 1;
    if (!combustion) a = T.pressure.compression;
    else if (n.unit() < misfire) a = T.pressure.compression;
    else if (rpm > T.limiterRpm && n.unit() < 0.5) a = T.pressure.compression;
    else if (overrun && n.unit() < T.overrun.misfire) a = T.pressure.compression;
    else if (overrun && n.unit() < T.overrun.popChance) {
      a = T.overrun.popGain;
      sharp = 0.55;
    } else {
      a = pressure;
      if (T.knock) {
        const K = T.knock;
        this.knock =
          (K.idle * idleness + K.load * clamp01(pressure) * (1 - idleness)) * (0.75 + 0.5 * n.unit());
      }
    }
    const jitter = T.jitter.load + (T.jitter.idle - T.jitter.load) * idleness;
    this.amp[k] = Math.max(0, a * R.strength[cyl] * (1 + jitter * n.gauss()));
    // Blowdown is quicker at high pressure; its length is set in time, so in crank
    // degrees it is short at idle (separate pops) and long at high revs (a roar).
    const P = T.pulse;
    const load = clamp01(pressure);
    const degPerMs = degPerSec / 1000;
    const runner = 1 + 0.15 * R.delayMs[cyl];
    this.rise[k] = Math.max(P.minRiseDeg, (P.riseMs[0] + (P.riseMs[1] - P.riseMs[0]) * load) * degPerMs);
    this.decay[k] =
      Math.min(
        P.maxDecayDeg,
        Math.max(P.minDecayDeg, (P.decayMs[0] + (P.decayMs[1] - P.decayMs[0]) * load) * degPerMs),
      ) *
      runner *
      sharp;
    this.offset[k] = (R.delayMs[cyl] / 1000) * degPerSec + n.unit() * T.jitter.timingDeg * (0.4 + idleness);
    // Once a cycle, pick where the idle wanders next.
    if (k === 0) this.lopeTarget = n.gauss() * T.jitter.lopeRpm;
  }
}
