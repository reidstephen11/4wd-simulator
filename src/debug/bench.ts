import type { Game } from '../core/game';
import {
  qualityFor,
  qualityPresets,
  shownQuality,
  type QualityLevel,
  type QualityPreset,
} from '../data/quality';
import { isTouchDevice } from '../ui/touchControls';
import { headingOf } from '../sim/vehicle/math';

/** How long each setting is timed, and how much of the start is skipped while it settles. */
const SECONDS = 6;
const SETTLE = 1.5;

/** Where a step is timed from: a place and the way the car faces (degrees, 0 = north). */
export interface BenchView {
  name: string;
  x: number;
  z: number;
  headingDeg: number;
}

/**
 * One timed step. `quality` is a graphics preset ('own': the one this device plays on),
 * `sharpness` the resolution drawn (the preset's own, a multiple of it, or the screen's full
 * resolution), `draws` how many times the whole picture is drawn each frame, and `hide` what is
 * left out.
 */
export interface BenchStep {
  name: string;
  view: number;
  quality: QualityLevel | 'own';
  sharpness: 'preset' | 'screen' | number;
  draws: number;
  hide?: 'shadows' | 'trees' | 'groundCover';
}

/** The three places timed: an ordinary view, the widest one, and the one with water. */
export const benchViews: readonly BenchView[] = [
  { name: 'Knoll track', x: 15, z: 165, headingDeg: 80 },
  { name: 'Summit, looking west', x: 50, z: 10, headingDeg: 270 },
  { name: 'Ford, looking across', x: -104, z: 40, headingDeg: 270 },
];

const step = (
  name: string,
  view: number,
  quality: BenchStep['quality'] = 'own',
  sharpness: BenchStep['sharpness'] = 'preset',
  draws = 1,
  hide?: BenchStep['hide'],
): BenchStep => ({ name, view, quality, sharpness, draws, hide });

/**
 * The headroom test (v0.23). The first phone test only took things away, and a phone that holds
 * its screen's refresh rate reads the same on every line. This one adds load until the frame
 * rate drops: a sharper picture, the higher graphics presets (High too, which a phone is never
 * given in play), and the whole picture drawn two, three and four times a frame, which says how
 * many times over the graphics chip could draw what it draws now. Then the widest view and the
 * water, and at the widest view the old take-aways, for a phone that is already slow there.
 */
export const benchSteps: readonly BenchStep[] = [
  step('As normal', 0),
  step('Sharper x1.5', 0, 'own', 1.5),
  step('Sharper x2', 0, 'own', 2),
  step('Full sharpness', 0, 'own', 'screen'),
  step('Medium', 0, 'medium'),
  step('Medium, full sharp', 0, 'medium', 'screen'),
  step('High', 0, 'high'),
  step('High, full sharp', 0, 'high', 'screen'),
  step('Drawn twice', 0, 'own', 'preset', 2),
  step('Drawn 3 times', 0, 'own', 'preset', 3),
  step('Drawn 4 times', 0, 'own', 'preset', 4),
  step('As normal', 1),
  step('Medium', 1, 'medium'),
  step('High', 1, 'high'),
  step('High, full sharp', 1, 'high', 'screen'),
  step('No shadows', 1, 'own', 'preset', 1, 'shadows'),
  step('No trees', 1, 'own', 'preset', 1, 'trees'),
  step('No ground cover', 1, 'own', 'preset', 1, 'groundCover'),
  step('As normal', 2),
  step('Medium', 2, 'medium'),
  step('High', 2, 'high'),
  step('High, full sharp', 2, 'high', 'screen'),
];

/** One line of the results: the step, frames a second, and the usual and worst frame (ms). */
export function benchLine(name: string, median: number, worst: number): string {
  const fps = (1000 / Math.max(1, median)).toFixed(0).padStart(3);
  return `${name.padEnd(19)}${fps} fps ${median.toFixed(0).padStart(3)}/${worst.toFixed(0)} ms`;
}

/**
 * `?bench`: parks the car at three places in turn and times the frames while the load is put
 * up step by step (`benchSteps`), so a phone can show how much it has in hand. The results
 * stay on screen.
 */
export class Bench {
  private index = -1;
  private t = 0;
  private frames: number[] = [];
  private cpu: number[] = [];
  private allCpu: number[] = [];
  private best = Infinity;
  private readonly results: string[] = [];
  private readonly el: HTMLElement;
  private quality: QualityLevel | 'own' = 'own';
  done = false;

  constructor(private readonly g: Game) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;left:6px;top:6px;z-index:99999;max-width:96vw;padding:8px 10px;border-radius:8px;' +
      'background:rgba(0,0,0,0.85);color:#fff;font:12px/1.35 monospace;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(this.el);
    this.show('Phone test: starting…');
  }

  private show(text: string): void {
    this.el.textContent = text;
  }

  /** The preset this device plays on. */
  private own(): QualityPreset {
    return qualityFor(this.g.settings.quality, isTouchDevice());
  }

  /** Call once a frame with the frame's length (s) and the game code's time in it (ms). */
  update(frameDt: number, cpuMs: number): void {
    if (this.done) return;
    // A note stops the game on a touch screen: put it away.
    document.querySelector<HTMLElement>('.history-card.reading')?.click();
    if (this.g.loop.paused) {
      if (this.index < 0) this.show('Phone test: press Drive to start it.');
      return;
    }
    if (this.index < 0) {
      this.start(0);
      return;
    }
    this.t += frameDt;
    if (this.t > SETTLE) {
      this.frames.push(frameDt * 1000);
      this.cpu.push(cpuMs);
    }
    const s = benchSteps[this.index];
    if (this.t < SECONDS) {
      this.show(
        `Phone test: ${benchViews[s.view].name}, ${s.name} (${this.index + 1} of ${benchSteps.length})…\n${this.results.join('\n')}`,
      );
      return;
    }
    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1] ?? 0;
    const worst = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    this.allCpu.push(...this.cpu);
    if (median > 0) this.best = Math.min(this.best, median);
    this.results.push(benchLine(s.name, median, worst));
    if (this.index + 1 < benchSteps.length) {
      this.start(this.index + 1);
      return;
    }
    this.apply(benchSteps[0]);
    this.done = true;
    const cpu = [...this.allCpu].sort((a, b) => a - b)[this.allCpu.length >> 1] ?? 0;
    const hz = Number.isFinite(this.best) ? Math.round(1000 / this.best) : 0;
    this.show(
      `Phone test done: ${innerWidth}x${innerHeight}, pixel ratio ${devicePixelRatio},\n` +
        `plays on ${shownQuality(this.g.settings.quality, isTouchDevice())}; fastest ${hz} fps; game code ${cpu.toFixed(0)} ms a frame\n` +
        `(each line: fps, usual/worst frame in ms)\n` +
        `${this.results.join('\n')}\n\nPlease send a screenshot of this.`,
    );
  }

  /** Park the car for a view: on the nearest track for the first, on the spot for the others. */
  private park(view: BenchView): void {
    let best = { d: Infinity, x: view.x, z: view.z, heading: view.headingDeg };
    if (view === benchViews[0])
      for (const t of this.g.world.features.tracks) {
        const { xs, zs, count } = t.poly;
        for (let k = 0; k + 1 < count; k++) {
          const d = Math.hypot(xs[k] - view.x, zs[k] - view.z);
          if (d < best.d)
            best = { d, x: xs[k], z: zs[k], heading: headingOf(xs[k + 1] - xs[k], zs[k + 1] - zs[k]) };
        }
      }
    window.__game?.teleport(best.x, best.z, best.heading);
  }

  /** Put the graphics as a step asks: preset, sharpness, how many times drawn, what is hidden. */
  private apply(s: BenchStep): void {
    const view = this.g.view;
    if (s.quality !== this.quality) {
      this.quality = s.quality;
      view.setQuality(s.quality === 'own' ? this.own() : qualityPresets[s.quality]);
    }
    const preset = s.quality === 'own' ? this.own() : qualityPresets[s.quality];
    const screen = window.devicePixelRatio || 1;
    const base = Math.min(screen, preset.pixelRatio);
    view.benchPixelRatio(
      s.sharpness === 'screen'
        ? screen
        : s.sharpness === 'preset'
          ? base
          : Math.min(screen, base * s.sharpness),
    );
    view.benchDraws = s.draws;
    const shadows = preset.shadows && s.hide !== 'shadows';
    if (view.renderer.shadowMap.enabled !== shadows) {
      view.renderer.shadowMap.enabled = shadows;
      view.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
    }
    const trees = view.vegetation.group.getObjectByName('trees');
    if (trees) trees.visible = s.hide !== 'trees';
    for (const name of ['ground-cover', 'meadow']) {
      const o = view.vegetation.group.getObjectByName(name);
      if (o) o.visible = s.hide !== 'groundCover';
    }
  }

  private start(index: number): void {
    const s = benchSteps[index];
    if (index === 0 || benchSteps[index - 1].view !== s.view) {
      this.park(benchViews[s.view]);
      this.results.push(`-- ${benchViews[s.view].name}`);
    }
    this.index = index;
    this.t = 0;
    this.frames = [];
    this.cpu = [];
    this.apply(s);
  }
}
