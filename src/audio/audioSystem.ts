import { audioTuning, type TyreLayer } from '../data/audio';
import type { Settings } from '../sim/save/save';
import { Ambience } from './ambience';
import { CrawlSounds } from './crawlSounds';
import { createNoiseBank, type NoiseBank } from './buffers';
import { EngineSound, HornSound } from './engineSound';
import type { AudioFrame } from './frame';
import { knockLevel, thumpLevel } from './mix';
import { clunk, dentCrunch, knock, thump } from './oneShots';
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
  private lastGear = 0;
  private readonly buf = new Float32Array(1024);

  constructor(
    settings: Settings,
    private readonly target: Window = window,
  ) {
    this.settings = { ...settings };
    for (const ev of GESTURES) target.addEventListener(ev, this.onGesture, { capture: true });
    document.addEventListener('visibilitychange', this.onVisibility);
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
    else ctx.addEventListener('statechange', () => ctx.state === 'running' && this.removeGestureListeners());
  }

  private removeGestureListeners(): void {
    for (const ev of GESTURES) this.target.removeEventListener(ev, this.onGesture, { capture: true });
  }

  private build(): Graph {
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctor) throw new Error('No AudioContext');
    const ctx = new Ctor({ latencyHint: 'interactive' });
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
    const vehicleDuck = gain(master);
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
      ambience: new Ambience(ctx, ambienceBus, noise),
      ui: new UiSounds(ctx, uiBus, noise),
    };
    this.applyVolumes(g, true);
    // The engine starts up when sound first comes on.
    g.engine.restarted();
    return g;
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
    g.vehicleDuck.gain.setTargetAtTime(f.paused ? A.pausedVehicleGain : 1, t, 0.08);
    g.ambienceDuck.gain.setTargetAtTime(f.paused ? A.pausedAmbienceGain : 1, t, 0.2);
    g.engine.update(f.engine);
    g.horn.set(f.horn && !f.paused);
    g.tyres.update(f.wheels, f.speed);
    g.crawl.update(f.crawl);
    // Selecting drive or reverse clunks through the driveline.
    if (Math.sign(f.gear + 0.5) !== Math.sign(this.lastGear + 0.5) && !f.paused)
      clunk(g.ctx, g.fxBus, g.noise, 'gear');
    this.lastGear = f.gear;
    g.winch.update(f.winch);
    g.ambience.update(f.ambience);
  }

  // --- One-off events ---------------------------------------------------------

  engineEvent(e: 'stalled' | 'restarted'): void {
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

  /** The chassis knocked a rock (impulse, N·s). */
  bodyKnock(impulse: number): void {
    const g = this.live();
    const level = knockLevel(impulse);
    if (g && level > 0) knock(g.ctx, g.fxBus, g.noise, level);
  }

  /** Transfer-case range change or an air locker engaging / releasing. */
  drivetrainClunk(kind: 'range' | 'lockOn' | 'lockOff'): void {
    const g = this.live();
    if (g) clunk(g.ctx, g.fxBus, g.noise, kind);
  }

  /** The body was dented (impact speed, m/s). */
  dent(impact: number): void {
    const g = this.live();
    if (g) dentCrunch(g.ctx, g.fxBus, g.noise, Math.min(1, Math.max(0.35, (impact - 2.5) / 6)));
  }

  discovery(): void {
    this.live()?.ui.chime();
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
      wind: g?.ambience.wind ?? 0,
      water: g?.ambience.water ?? 0,
      tyres,
      lastBird: g?.ambience.lastBird ?? '',
    };
  }
}
