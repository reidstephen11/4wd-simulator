import { audioTuning, type TyreLayer } from '../data/audio';
import type { Settings } from '../sim/save/save';
import type { VehicleId } from '../data/vehicle';
import { Ambience } from './ambience';
import { CrawlSounds } from './crawlSounds';
import { createNoiseBank, type NoiseBank } from './buffers';
import { EngineSound, HornSound } from './engineSound';
import type { AudioFrame } from './frame';
import { knockLevel, thumpLevel, trailerBumpLevel } from './mix';
import {
  clunk,
  dentCrunch,
  knock,
  puncture,
  ratchet,
  rockSlide,
  stallClunk,
  switchClick,
  thump,
  treeFall,
} from './oneShots';
import { TrailerSound } from './trailerSound';
import { TyreSound } from './tyreSound';
import { UiSounds } from './uiSounds';
import { WinchSound } from './winchSound';

export type AudioState = 'off' | 'running' | 'suspended' | 'unavailable';

interface Graph {
  ctx: AudioContext;
  noise: NoiseBank;
  master: GainNode;
  analyser: AnalyserNode;
  vehicleDuck: GainNode;
  /** Muffles the vehicle when heard from the driver's seat. */
  cabin: BiquadFilterNode;
  ambienceDuck: GainNode;
  engineBus: GainNode;
  ambienceBus: GainNode;
  fxBus: GainNode;
  uiBus: GainNode;
  engine: EngineSound;
  horn: HornSound;
  tyres: TyreSound;
  crawl: CrawlSounds;
  winch: WinchSound;
  trailer: TrailerSound;
  ambience: Ambience;
  ui: UiSounds;
}

/** What the debug overlay and tests can see. */
export interface AudioInfo {
  state: AudioState;
  /** RMS and peak of the final mix (last ~20 ms). */
  level: number;
  peak: number;
  master: number;
  engine: number;
  ambience: number;
  engineHz: number;
  /** Chassis scrape level (0..1). */
  scrape: number;
  /** 'synth' (AudioWorklet engine), 'oscillator' (fallback) or 'loading'. */
  engineVoice: string;
  winchHz: number;
  /** The trailer's rattle (0..1). */
  trailer: number;
  wind: number;
  water: number;
  tyres: Partial<Record<TyreLayer, number>>;
  lastBird: string;
}

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/**
 * All game sound (SPEC §13), synthesised with the Web Audio API. The audio context is
 * only created on the first click or key press (browser autoplay rules); until then
 * every call is a no-op. Reads game state each frame through `update`.
 */
export class AudioSystem {
  private g: Graph | null = null;
  private settings: Settings;
  private failed = false;
  /** A statechange listener is on the context, waiting for it to run. */
  private stateWatched = false;
  private lastGear = 0;
  private vehicle: VehicleId = 'shortie';
  private readonly buf = new Float32Array(1024);

  /**
   * `primed` is an audio context created by an earlier click (the welcome screen's Drive
   * button), so sound can start straight away instead of waiting for the next gesture.
   */
  constructor(
    settings: Settings,
    private readonly target: Window = window,
    private readonly primed?: AudioContext,
  ) {
    this.settings = { ...settings };
    for (const ev of GESTURES) target.addEventListener(ev, this.onGesture, { capture: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    if (primed) this.start();
  }

  get state(): AudioState {
    if (this.failed) return 'unavailable';
    if (!this.g) return 'off';
    return this.g.ctx.state === 'running' ? 'running' : 'suspended';
  }

  private readonly onGesture = (e: Event): void => {
    // Escape doesn't count as a user gesture for autoplay, so it can't start audio.
    if (e instanceof KeyboardEvent && e.code === 'Escape') return;
    this.start();
  };

  private readonly onVisibility = (): void => {
    const ctx = this.g?.ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  };

  /** Create (or resume) the audio context. Call from a user gesture. */
  start(): void {
    if (this.failed) return;
    if (!this.g) {
      try {
        this.g = this.build();
      } catch (err) {
        this.failed = true;
        console.warn('4WD Simulator: Web Audio is unavailable, the game will be silent.', err);
        this.removeGestureListeners();
        return;
      }
    }
    const ctx = this.g.ctx;
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => undefined);
    if (ctx.state === 'running') this.removeGestureListeners();
    else if (!this.stateWatched) {
      // One listener, however many gestures arrive before the context runs.
      this.stateWatched = true;
      const onState = () => {
        if (ctx.state !== 'running') return;
        ctx.removeEventListener('statechange', onState);
        this.removeGestureListeners();
      };
      ctx.addEventListener('statechange', onState);
    }
  }

  private removeGestureListeners(): void {
    for (const ev of GESTURES) this.target.removeEventListener(ev, this.onGesture, { capture: true });
  }

  private build(): Graph {
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctor) throw new Error('No AudioContext');
    const ctx = this.primed ?? new Ctor({ latencyHint: 'interactive' });
    const noise = createNoiseBank(ctx);
    const gain = (to: AudioNode, value = 1) => {
      const n = ctx.createGain();
      n.gain.value = value;
      n.connect(to);
      return n;
    };
    // master → gentle compressor → analyser → speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    comp.connect(analyser).connect(ctx.destination);
    const master = gain(comp, 0);
    const A = audioTuning;
    const cabin = ctx.createBiquadFilter();
    cabin.type = 'lowpass';
    cabin.frequency.value = A.cabin.openHz;
    cabin.Q.value = 0.5;
    cabin.connect(master);
    const vehicleDuck = gain(cabin);
    const ambienceDuck = gain(master);
    const engineBus = gain(vehicleDuck, 0);
    const fxBus = gain(vehicleDuck);
    const ambienceBus = gain(ambienceDuck, 0);
    const uiBus = gain(master);
    const g: Graph = {
      ctx,
      noise,
      master,
      analyser,
      vehicleDuck,
      cabin,
      ambienceDuck,
      engineBus,
      ambienceBus,
      fxBus,
      uiBus,
      engine: new EngineSound(ctx, engineBus, noise),
      horn: new HornSound(ctx, fxBus),
      tyres: new TyreSound(ctx, fxBus, noise),
      crawl: new CrawlSounds(ctx, fxBus, noise),
      winch: new WinchSound(ctx, fxBus, noise),
      trailer: new TrailerSound(ctx, fxBus, noise),
      ambience: new Ambience(ctx, ambienceBus, noise),
      ui: new UiSounds(ctx, uiBus, noise),
    };
    this.applyVolumes(g, true);
    g.engine.setVehicle(this.vehicle);
    return g;
  }

  /** Play this vehicle's engine (the start-up comes from the sim's 'starting' event). */
  setVehicle(id: VehicleId): void {
    if (id === this.vehicle) return;
    this.vehicle = id;
    this.g?.engine.setVehicle(id);
  }

  setSettings(s: Settings): void {
    this.settings = { ...s };
    if (this.g) this.applyVolumes(this.g, false);
  }

  private applyVolumes(g: Graph, immediate: boolean): void {
    const A = audioTuning;
    const curve = (v: number) => Math.pow(Math.min(1, Math.max(0, v)), A.volumeCurve);
    const set = (p: AudioParam, v: number) => {
      if (immediate) p.value = v;
      else p.setTargetAtTime(v, g.ctx.currentTime, 0.03);
    };
    set(g.master.gain, A.headroom * curve(this.settings.masterVolume));
    set(g.engineBus.gain, curve(this.settings.engineVolume));
    set(g.ambienceBus.gain, curve(this.settings.ambienceVolume));
  }

  /** Follow the game state; call once per rendered frame. */
  update(f: AudioFrame): void {
    const g = this.g;
    if (!g || g.ctx.state !== 'running') return;
    const t = g.ctx.currentTime;
    const A = audioTuning;
    g.vehicleDuck.gain.setTargetAtTime(
      (f.paused ? A.pausedVehicleGain : 1) * (f.interior ? A.cabin.gain : 1),
      t,
      0.08,
    );
    g.cabin.frequency.setTargetAtTime(f.interior ? A.cabin.closedHz : A.cabin.openHz, t, 0.12);
    g.ambienceDuck.gain.setTargetAtTime(f.paused ? A.pausedAmbienceGain : 1, t, 0.2);
    g.engine.update(f.engine);
    g.horn.set(f.horn && !f.paused);
    g.tyres.update(f.wheels, f.speed);
    g.crawl.update(f.crawl);
    // Selecting drive or reverse clunks through the driveline; with a manual gearbox
    // every change of gear (and into or out of neutral) does.
    const gearKey = f.neutral ? -0.25 : f.gear;
    const changed = f.manualGearbox
      ? gearKey !== this.lastGear
      : Math.sign(f.gear + 0.5) !== Math.sign(this.lastGear + 0.5);
    if (changed && !f.paused) clunk(g.ctx, g.fxBus, g.noise, 'gear');
    this.lastGear = f.manualGearbox ? gearKey : f.gear;
    g.winch.update(f.winch);
    g.trailer.update(f.paused ? null : f.trailer);
    g.ambience.update(f.ambience);
  }

  // --- One-off events ---------------------------------------------------------

  /** A stall clunks; starting up or restarting plays the starter and the engine catching. */
  engineEvent(e: 'stalled' | 'restarted' | 'starting'): void {
    if (!this.live()) return;
    if (e === 'stalled') this.g?.engine.stalled();
    else this.g?.engine.restarted();
  }

  /** A wheel hit something (suspension compression speed, m/s). */
  wheelImpact(speed: number): void {
    const g = this.live();
    const level = thumpLevel(speed);
    if (g && level > 0) thump(g.ctx, g.fxBus, g.noise, level);
  }

  /** A trailer wheel hit something (spring compression speed, m/s), with this many drums on board. */
  trailerBump(speed: number, drums: number): void {
    const g = this.live();
    const level = trailerBumpLevel(speed);
    if (g && level > 0) g.trailer.bump(level, drums);
  }

  /** The trailer hitched or unhitched, came round against the car, or went over. */
  trailerEvent(kind: 'hitched' | 'unhitched' | 'jackknifed' | 'tipped', drums: number): void {
    const t = this.live()?.trailer;
    if (!t) return;
    if (kind === 'hitched' || kind === 'unhitched') t.coupling(kind === 'hitched');
    else if (kind === 'jackknifed') t.jackknifed();
    else t.tipped(drums);
  }

  /** The chassis knocked a rock (impulse, N·s). */
  bodyKnock(impulse: number): void {
    const g = this.live();
    const level = knockLevel(impulse);
    if (g && level > 0) knock(g.ctx, g.fxBus, g.noise, level);
  }

  /** Transfer-case range change or an air locker engaging / releasing. */
  drivetrainClunk(kind: 'range' | 'lockOn' | 'lockOff' | 'windup'): void {
    const g = this.live();
    if (!g) return;
    if (kind === 'windup') {
      const osc = g.ctx.createOscillator();
      const gain = g.ctx.createGain();
      const now = g.ctx.currentTime;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.55);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.035, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(g.fxBus);
      osc.start(now);
      osc.stop(now + 0.65);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } else clunk(g.ctx, g.fxBus, g.noise, kind);
  }

  /** The handbrake ratchets on or clunks off. */
  parkBrake(on: boolean): void {
    const g = this.live();
    if (g) ratchet(g.ctx, g.fxBus, g.noise, on);
  }

  /** The headlight switch clicks (high: the high-beam stalk). */
  lightSwitch(high: boolean): void {
    const g = this.live();
    if (g) switchClick(g.ctx, g.fxBus, g.noise, high);
  }

  /** Mechanical damage: a tyre cut, a suspension corner bent, the engine hurt or wrecked. */
  damage(part: 'tyre' | 'suspension' | 'engine', wrecked = false): void {
    const g = this.live();
    if (!g) return;
    if (part === 'tyre') puncture(g.ctx, g.fxBus, g.noise);
    else if (part === 'suspension') dentCrunch(g.ctx, g.fxBus, g.noise, 0.9);
    else if (wrecked) stallClunk(g.ctx, g.fxBus, g.noise);
    else knock(g.ctx, g.fxBus, g.noise, 0.8);
  }

  /** The body was dented (impact speed, m/s). */
  dent(impact: number): void {
    const g = this.live();
    if (g) dentCrunch(g.ctx, g.fxBus, g.noise, Math.min(1, Math.max(0.35, (impact - 2.5) / 6)));
  }

  /** A surprise up ahead: a tree coming down (landing after `seconds`) or rocks off a bank. */
  surprise(kind: 'treefall' | 'rockfall', seconds: number): void {
    const g = this.live();
    if (!g) return;
    if (kind === 'treefall') treeFall(g.ctx, g.fxBus, g.noise, seconds);
    else rockSlide(g.ctx, g.fxBus, g.noise, seconds);
  }

  discovery(): void {
    this.live()?.ui.chime();
  }

  /** Driven through the next gate on a gate trail. */
  gate(): void {
    this.live()?.ui.tick();
  }

  /** The car touched a gate flag's stake. */
  flag(): void {
    const g = this.live();
    if (g) knock(g.ctx, g.fxBus, g.noise, 0.35);
  }

  mapOpened(): void {
    this.live()?.ui.rustle(1);
  }

  mapClosed(): void {
    this.live()?.ui.rustle(0.55);
  }

  /** Play a bird call now (debug). */
  bird(kind: 'kookaburra' | 'magpie'): void {
    this.live()?.ambience.bird(kind);
  }

  private live(): Graph | null {
    return this.g && this.g.ctx.state === 'running' ? this.g : null;
  }

  // --- Inspection -------------------------------------------------------------

  /** RMS and peak of the final mix right now. */
  measure(): { rms: number; peak: number } {
    const g = this.g;
    if (!g) return { rms: 0, peak: 0 };
    g.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.buf.length; i++) {
      sum += this.buf[i] * this.buf[i];
      peak = Math.max(peak, Math.abs(this.buf[i]));
    }
    return { rms: Math.sqrt(sum / this.buf.length), peak };
  }

  info(): AudioInfo {
    const g = this.g;
    const m = this.measure();
    const tyres: Partial<Record<TyreLayer, number>> = {};
    if (g) for (const [k, w] of Object.entries(g.tyres.weights)) if (w > 0.01) tyres[k as TyreLayer] = w;
    return {
      state: this.state,
      level: m.rms,
      peak: m.peak,
      master: g?.master.gain.value ?? 0,
      engine: g?.engineBus.gain.value ?? 0,
      ambience: g?.ambienceBus.gain.value ?? 0,
      engineHz: g?.engine.hz ?? 0,
      scrape: g?.crawl.scrape ?? 0,
      engineVoice: g?.engine.kind ?? 'off',
      winchHz: g?.winch.hz ?? 0,
      trailer: g?.trailer.level ?? 0,
      wind: g?.ambience.wind ?? 0,
      water: g?.ambience.water ?? 0,
      tyres,
      lastBird: g?.ambience.lastBird ?? '',
    };
  }
}
