import { controllers, defaultController, type ControllerType } from '../data/controllers';
import { icons, type PoiIcon } from './icons';
import { cameraPresets, type CameraPreset } from '../data/camera';
import {
  CrawlGauges,
  formatSpeed,
  phoneTiltRisk,
  type GaugeMode,
  type GaugeState,
  type SpeedUnits,
} from './crawlGauges';
import type { HeadlightMode } from '../data/headlights';
import { railItems, touchNotice, warningView, type RailItem } from './alerts';
import { VehicleGauges, type VehicleGaugeState } from './vehicleGauges';
import { Instruments, type Lamp } from './instruments';
import { damageTuning } from '../data/damage';
import { defaultHudStyle, type HudStyle } from '../data/hudStyles';

/** The mission line stays this long, then folds away until it changes or time runs short. */
export const MISSION_FADE_MS = 4500;
/** A road's or a course's hint shows under its name this long after you reach it. */
export const HINT_FADE_MS = 8000;

/** Labels already printed on the on-screen buttons. A prompt with only these keys repeats them. */
const TOUCH_BUTTON_KEYS = new Set([
  'USE',
  'GAS',
  'BRAKE',
  'HAND',
  'TOOLS',
  'LOW',
  'MAP',
  'II',
  'LIGHTS',
  'IN',
  'OUT',
  'UPRIGHT',
  'BACK',
]);

/** True when every key in a touch prompt is already a button, so the badge can be dropped. */
export function echoesTouchButton(keys: string): boolean {
  const parts = keys.split(' / ');
  return parts.length > 0 && parts.every((part) => TOUCH_BUTTON_KEYS.has(part));
}

export interface Prompt {
  /** Key or button glyphs, e.g. "E" or "Hold J". */
  keys: string;
  text: string;
  /** 0..1 progress ring (hold actions). */
  progress?: number;
}

export interface CompassPoi {
  id: string;
  kind: PoiIcon;
  /** Bearing from the player (degrees, 0 = north). */
  bearing: number;
}

/** The episode's mission and clock (top left). */
export interface EpisodeHud {
  title: string;
  mission: string;
  /** "2:35 pm" (empty when the clock is stopped for a replay). */
  clock: string;
  deadline: string;
  /** Under half an hour of game time left. */
  urgent: boolean;
  /** For the clock dial: the hour now (null while it stands still), when it gets dark and the finish. */
  hour?: number | null;
  darkHour?: number | null;
  finishHour?: number | null;
}

/** Fuel and what's on board to fix and refill with. */
export interface SuppliesHud extends VehicleGaugeState {
  jerryCans: number;
  spares: number;
  plugs: number;
}

/** The trailer line beside the supplies. */
export interface TrailerHud {
  name: string;
  /** Drums of diesel on board, the trailer's mass with its load (kg) and the most it may weigh. */
  drums: number;
  kg: number;
  limit: number;
  overloaded: boolean;
  /** On the back, over on its side, come round against the car, or standing unhitched `distance` m away. */
  state: 'towing' | 'tipped' | 'jackknifed' | 'left';
  distance: number;
}

export interface HudState {
  gauges: GaugeState;
  /** A trailer on the back, or one left standing (null: none). */
  trailer?: TrailerHud | null;
  episode: EpisodeHud | null;
  supplies: SuppliesHud | null;
  /** Gates on a gate trail: the next one to drive (0 before the first), and the lap so far. */
  gates: GateState | null;
  /** A scored crawl run in progress. */
  run: { name: string; seconds: number; points: number } | null;
  /** Camera heading (degrees, 0 = north). */
  heading: number;
  pois: CompassPoi[];
  range: 'high' | 'low';
  transfer?: { mode: string; hubsLocked: boolean; centreLocked: boolean; fullTime: boolean; windup: number };
  frontLocked: boolean;
  rearLocked: boolean;
  precisionCrawl: boolean;
  /** The park brake is on. */
  parkBrake: boolean;
  /** Headlights: a green lamp for low beam, a blue one for high beam, as on the dash. */
  lights: HeadlightMode;
  /** `recovery`: the way back to the line after a recovery, shown off the track (v2.24). */
  courseHint: { title: string; text: string; controls: string; recovery?: boolean } | null;
  planksCarried: number;
  planksTotal: number;
  winchAttached: boolean;
  winchDoubleLine?: boolean;
  treeProtector?: boolean;
  /** 0 = fine, 1 = flooding (warning), 2 = stalled. */
  engine: 0 | 1 | 2;
  /**
   * Mechanical damage, when anything is damaged: engine health and each corner's (the
   * worse of its tyre and suspension), 1 = as new. Wheels in the vehicle's order, with
   * which are front and which are on the left.
   */
  damage: { engine: number; corners: { health: number; front: boolean; left: boolean }[] } | null;
  prompts: Prompt[];
}

/**
 * In-game HUD (SPEC §9): compass strip (top centre), status cluster (bottom left),
 * context prompts (bottom centre), and messages and discovery cards in the top right
 * corner, out of the view of the track ahead. Plain DOM; mostly-clear screen.
 */
export class Hud {
  readonly el: HTMLElement;
  private controller: ControllerType = defaultController;
  onCameraReset: (() => void) | null = null;
  /** Every message card as it is shown (the headset's dash panel repeats them, v1.98). */
  onToast: ((text: string, ms: number) => void) | null = null;
  onCameraPreset: (() => void) | null = null;
  private readonly status: HTMLElement;
  /** Lamps, phone warnings, the place name and the mission: short lines by the dials. */
  private readonly stack: HTMLElement;
  private readonly instruments: Instruments;
  /** How the HUD looks (Settings). */
  style: HudStyle = defaultHudStyle;
  /** Set by the game: after dusk the panels dim, like a dash's lights. */
  night = false;
  private lastHintTitle = '';
  private hintRevealUntil = 0;
  private lastPalette = '';
  private readonly rangeEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly gearEl: HTMLElement;
  private readonly parkEl: HTMLElement;
  private readonly lightsEl: HTMLElement;
  private readonly damageEl: HTMLElement;
  private lastDamageKey = '';
  private readonly driveButtons: HTMLButtonElement[];
  private readonly courseHint: HTMLElement;
  private readonly planksEl: HTMLElement;
  private readonly winchEl: HTMLElement;
  private readonly engineEl: HTMLElement;
  private readonly promptsEl: HTMLElement;
  private readonly alertRail: HTMLElement;
  private readonly alertsEl: HTMLElement;
  private readonly noticesEl: HTMLElement;
  private readonly toasts: HTMLElement;
  /** When a touch warning was first shown, so an advisory can shrink after a few seconds. */
  private readonly alertSeen = new Map<string, number>();
  /** Tapped chips stay open until this time. */
  private readonly alertExpanded = new Map<string, number>();
  private lastAlertKey = '';
  private readonly discovery: HTMLElement;
  private readonly cameraHelpEl: HTMLElement;
  private readonly cameraHint: HTMLElement;
  private readonly cameraResetKey: HTMLElement;
  private readonly cameraPresetButton: HTMLButtonElement;
  private readonly gauges: CrawlGauges;
  private readonly runEl: HTMLElement;
  private readonly gateEl: HTMLElement;
  private readonly missionEl: HTMLElement;
  private readonly suppliesPanel: HTMLElement;
  private readonly vehicleGauges: VehicleGauges;
  private readonly suppliesEl: HTMLElement;
  private readonly trailerEl: HTMLElement;
  private lastTrailerKey = '';
  private lastMissionKey = '';
  private lastMissionPlace = '';
  private missionRevealUntil = 0;
  private lastSuppliesKey = '';
  /** Crawl gauges: 'auto' shows them in low range, precision crawl or the driver's seat. */
  gaugeMode: GaugeMode = 'auto';
  /** Speed units from the settings, for the status strip and the crawl gauges. */
  set units(u: SpeedUnits) {
    this.gauges.units = u;
  }
  get units(): SpeedUnits {
    return this.gauges.units;
  }
  /** The top right stack of discovery cards and messages; the history card joins it. */
  get notices(): HTMLElement {
    return this.noticesEl;
  }
  /** Set by the game: the driver's-seat camera is in use. */
  cockpitView = false;
  private lastPromptKey = '';

  constructor(root: HTMLElement, driveAction: (action: 'frontDiff' | 'rearDiff' | 'precision') => void) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-readout">
      <div class="status paper">
        <div class="status-range" title="Transfer range">H</div>
        <div class="status-speed" title="Speed and gear"><span class="status-speed-value">0.0 km/h</span><span class="status-gear">1</span></div>
        <button type="button" class="status-drive" data-drive="frontDiff" aria-label="Front differential lock" aria-pressed="false" title="Front diff lock: Z / L1 menu">F OPEN</button>
        <button type="button" class="status-drive" data-drive="rearDiff" aria-label="Rear differential lock" aria-pressed="false" title="Rear diff lock: X / L1 menu">R OPEN</button>
        <button type="button" class="status-drive" data-drive="precision" aria-label="Precision crawl" aria-pressed="false" title="Precision crawl: P / L1 menu. Hold throttle for walking pace.">CRAWL</button>
        <div class="status-park" title="Handbrake on: Space / □">P</div>
        <div class="status-item status-lights" title="Headlights: N / L1 menu">${icons.headlight}</div>
        <div class="status-item status-damage" title="Damage"></div>
        <div class="status-item status-planks" title="Recovery planks on board">${icons.planks}<span class="status-label">Planks</span><span class="status-planks-count">2/2</span></div>
        <div class="status-item status-winch" title="Winch attached">${icons.winch}</div>
        <div class="status-item status-engine" title="Engine flooding">${icons.engine}</div>
      </div>
      <div class="supplies paper hidden">
        <div class="supplies-footer">
        <div class="status-item status-supplies"></div>
        <div class="status-item status-trailer hidden">${icons.trailer}<span class="trailer-text"></span><span class="trailer-kg"></span></div>
        </div>
      </div>
      </div>
      <div class="hud-stack">
      <div class="course-hint paper hidden"><strong></strong><span></span><small></small></div>
      <div class="mission paper hidden"><small></small><strong></strong><span class="mission-clock"></span></div>
      </div>
      <div class="prompts"></div>
      <div class="camera-help paper">
        <span class="camera-hint">Drag to orbit · Scroll to zoom</span>
        <button type="button" class="camera-preset" aria-label="Camera view" title="Cycle wheel-placement views: C / hold L1 + click right stick">View<span class="camera-preset-name">: <span>Follow</span></span> <kbd>C</kbd></button>
        <button type="button" class="camera-reset" aria-label="Reset view" title="Return behind the vehicle"><span class="camera-reset-label">Reset view</span><span class="camera-reset-icon" aria-hidden="true">⟲</span> <kbd>V</kbd></button>
      </div>
      <div class="gate-count paper hidden"></div>
      <div class="crawl-run paper hidden"><strong></strong><span class="crawl-run-time"></span><span class="crawl-run-points"></span></div>
      <div class="notices"><div class="discovery"></div><div class="toasts"></div></div>`;
    root.appendChild(this.el);
    this.stack = this.el.querySelector('.hud-stack') as HTMLElement;
    // Phone warnings and notices: a short line each in the stack, under the lamps.
    const rail = document.createElement('div');
    rail.className = 'alert-rail';
    rail.setAttribute('aria-live', 'polite');
    rail.innerHTML = '<div class="alerts"></div>';
    this.stack.insertBefore(rail, this.stack.firstChild);
    this.instruments = new Instruments(this.el, this.stack);
    this.gauges = new CrawlGauges(this.el);
    this.runEl = this.el.querySelector('.crawl-run') as HTMLElement;
    this.missionEl = this.el.querySelector('.mission') as HTMLElement;
    this.suppliesPanel = this.el.querySelector('.supplies') as HTMLElement;
    this.vehicleGauges = new VehicleGauges(this.suppliesPanel);
    this.suppliesPanel.prepend(this.vehicleGauges.el);
    this.vehicleGauges.el.addEventListener('click', (e) => {
      if (!document.body.classList.contains('touch-mode')) return;
      if (!(e.target as HTMLElement).closest('.vehicle-strip')) return;
      e.stopPropagation();
      this.vehicleGauges.toggleOpen();
      this.missionRevealUntil = performance.now() + MISSION_FADE_MS;
      this.lastMissionKey = '';
    });
    this.suppliesEl = this.el.querySelector('.status-supplies') as HTMLElement;
    this.trailerEl = this.el.querySelector('.status-trailer') as HTMLElement;
    // The trailer line sits with the place and mission lines next to the instruments.
    this.trailerEl.classList.add('paper');
    this.stack.appendChild(this.trailerEl);
    this.gateEl = this.el.querySelector('.gate-count') as HTMLElement;
    this.status = this.el.querySelector('.status') as HTMLElement;
    this.rangeEl = this.el.querySelector('.status-range') as HTMLElement;
    this.speedEl = this.el.querySelector('.status-speed-value') as HTMLElement;
    this.gearEl = this.el.querySelector('.status-gear') as HTMLElement;
    this.parkEl = this.el.querySelector('.status-park') as HTMLElement;
    this.lightsEl = this.el.querySelector('.status-lights') as HTMLElement;
    this.damageEl = this.el.querySelector('.status-damage') as HTMLElement;
    this.driveButtons = [...this.el.querySelectorAll<HTMLButtonElement>('[data-drive]')];
    this.courseHint = this.el.querySelector('.course-hint') as HTMLElement;
    for (const button of this.driveButtons)
      button.addEventListener('click', () => {
        driveAction(button.dataset.drive as 'frontDiff' | 'rearDiff' | 'precision');
        button.blur();
      });
    this.planksEl = this.el.querySelector('.status-planks-count') as HTMLElement;
    this.winchEl = this.el.querySelector('.status-winch') as HTMLElement;
    this.engineEl = this.el.querySelector('.status-engine') as HTMLElement;
    this.promptsEl = this.el.querySelector('.prompts') as HTMLElement;
    this.alertRail = this.el.querySelector('.alert-rail') as HTMLElement;
    this.alertsEl = this.el.querySelector('.alerts') as HTMLElement;
    this.noticesEl = this.el.querySelector('.notices') as HTMLElement;
    this.toasts = this.el.querySelector('.toasts') as HTMLElement;
    this.alertRail.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest<HTMLElement>('.alert.minimised');
      const id = hit?.dataset.id;
      if (!id) return;
      this.alertExpanded.set(id, performance.now() + 5000);
      this.lastAlertKey = '';
    });
    this.discovery = this.el.querySelector('.discovery') as HTMLElement;
    this.cameraHelpEl = this.el.querySelector('.camera-help') as HTMLElement;
    this.cameraHint = this.el.querySelector('.camera-hint') as HTMLElement;
    this.cameraResetKey = this.el.querySelector('.camera-reset kbd') as HTMLElement;
    this.cameraPresetButton = this.el.querySelector('.camera-preset') as HTMLButtonElement;
    this.cameraPresetButton.addEventListener('click', () => {
      this.onCameraPreset?.();
      this.cameraPresetButton.blur();
    });
    this.el.querySelector('.camera-reset')?.addEventListener('click', (e) => {
      this.onCameraReset?.();
      // Return keyboard control to driving after a pointer click (Space is handbrake).
      if ((e as MouseEvent).detail > 0) (e.currentTarget as HTMLButtonElement).blur();
    });
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
  }

  setControllerType(controller: ControllerType): void {
    this.controller = controller;
    const p = controllers[controller];
    const labels: Record<string, string> = {
      frontDiff: `Front diff lock: Z / ${p.toolMenu} menu`,
      rearDiff: `Rear diff lock: X / ${p.toolMenu} menu`,
      precision: `Precision crawl: P / ${p.toolMenu} menu. Hold throttle for walking pace.`,
    };
    for (const button of this.driveButtons) {
      button.title = labels[button.dataset.drive ?? ''] ?? button.title;
    }
    this.parkEl.title = `Handbrake on: Space / ${p.handbrake}`;
    this.lightsEl.title = `Headlights: N / ${p.toolMenu} menu`;
    this.cameraPresetButton.title = `Cycle wheel-placement views: C / hold ${p.toolMenu} + ${p.cameraReset}`;
  }

  cameraHelp(
    device: 'keyboard' | 'gamepad' | 'touch',
    visible: boolean,
    driving: boolean,
    preset: CameraPreset,
  ): void {
    this.cameraHelpEl.hidden = !visible;
    const hint =
      device === 'keyboard'
        ? 'Drag to orbit · Scroll to zoom'
        : device === 'touch'
          ? 'Drag the view to look around'
          : `Right stick to orbit${driving ? ' · D-pad ←/→ to zoom' : ''}`;
    if (this.cameraHint.textContent !== hint) this.cameraHint.textContent = hint;
    const key = device === 'keyboard' ? 'V' : controllers[this.controller].cameraReset;
    if (this.cameraResetKey.textContent !== key) this.cameraResetKey.textContent = key;
    this.cameraPresetButton.hidden = !driving;
    this.cameraPresetButton.querySelector('.camera-preset-name span')!.textContent =
      cameraPresets[preset].label;
    this.cameraPresetButton.querySelector('kbd')!.textContent =
      device === 'keyboard'
        ? 'C'
        : `${controllers[this.controller].toolMenu} + ${controllers[this.controller].cameraReset}`;
  }

  update(s: HudState): void {
    this.el.classList.toggle('cockpit', this.cockpitView);
    this.el.classList.toggle('night', this.night);
    const touch = document.body.classList.contains('touch-mode');
    this.instruments.setStyle(this.style, touch, this.units);
    this.setGaugePalette();
    const e = s.episode;
    this.instruments.update({
      speedKmh: s.gauges.speedKmh,
      units: this.units,
      gear: s.gauges.gear,
      range: s.range,
      heat: s.supplies ? s.supplies.heat : null,
      fuel: s.supplies ? s.supplies.fuel : null,
      tank: s.supplies?.tank ?? 1,
      hour: e?.hour ?? null,
      darkHour: e?.darkHour ?? null,
      finishHour: e?.finishHour ?? null,
      heading: s.heading,
      pois: s.pois,
      lamps: lampsFor(s),
    });
    const showGauges =
      this.gaugeMode === 'on' ||
      (this.gaugeMode === 'auto' &&
        (touch ? phoneTiltRisk(s.gauges) : s.range === 'low' || s.precisionCrawl || this.cockpitView));
    this.gauges.visible = showGauges;
    if (showGauges) this.gauges.update(s.gauges);
    // On a phone held upright the panels below make room for these (see styles.css).
    this.el.classList.toggle('with-gauges', showGauges);
    this.el.classList.toggle('with-progress', !!s.gates || !!s.run);
    this.runEl.classList.toggle('hidden', !s.run);
    // The gate count sits where a scored run's clock goes; the run takes the place while it lasts.
    this.gateEl.classList.toggle('hidden', !s.gates || !!s.run);
    this.gateEl.classList.toggle('scored-course', !!s.gates?.course);
    if (s.gates) {
      const text = gateText(s.gates);
      if (this.gateEl.textContent !== text) this.gateEl.textContent = text;
      this.gateEl.classList.toggle('missed', s.gates.missed > 0 || s.gates.flags > 0);
    }
    if (s.run) {
      setText(this.runEl.querySelector('strong')!, s.run.name);
      setText(this.runEl.querySelector('.crawl-run-time')!, clock(s.run.seconds));
      setText(
        this.runEl.querySelector('.crawl-run-points')!,
        s.run.points === 0 ? 'clean' : `${s.run.points} pt${s.run.points === 1 ? '' : 's'}`,
      );
    }
    setText(this.rangeEl, s.transfer?.mode ?? (s.range === 'high' ? 'H' : 'L'));
    // Speed and gear, unless the crawl gauges already show them (the dash does in the driver's seat).
    this.status.classList.toggle('with-speed', !showGauges);
    const speed = formatSpeed(s.gauges.speedKmh, this.units);
    if (this.speedEl.textContent !== speed) this.speedEl.textContent = speed;
    if (this.gearEl.textContent !== s.gauges.gear) this.gearEl.textContent = s.gauges.gear;
    this.rangeEl.classList.toggle('low', s.range === 'low');
    this.parkEl.classList.toggle('shown', s.parkBrake);
    this.lightsEl.classList.toggle('shown', s.lights !== 'off');
    this.lightsEl.classList.toggle('high', s.lights === 'high');
    this.drawDamage(s.damage);
    const active = [s.frontLocked, s.rearLocked, s.precisionCrawl];
    this.driveButtons.forEach((button, index) => {
      const pressed = String(active[index]);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      if (index < 2) setText(button, `${index === 0 ? 'F' : 'R'} ${active[index] ? 'LOCK' : 'OPEN'}`);
    });
    this.courseHint.classList.toggle('hidden', !s.courseHint);
    const hintTitle = s.courseHint?.title ?? '';
    if (hintTitle !== this.lastHintTitle) {
      this.lastHintTitle = hintTitle;
      this.hintRevealUntil = performance.now() + HINT_FADE_MS;
    }
    this.courseHint.classList.toggle('brief', performance.now() < this.hintRevealUntil);
    if (s.courseHint) {
      setText(this.courseHint.querySelector('strong')!, s.courseHint.title);
      setText(this.courseHint.querySelector('span')!, s.courseHint.text);
      setText(this.courseHint.querySelector('small')!, s.courseHint.controls);
    }
    setText(this.planksEl, `${s.planksCarried}/${s.planksTotal}`);
    this.drawMission(s.episode);
    this.drawSupplies(s.supplies);
    this.drawTrailer(s.trailer ?? null);
    this.winchEl.classList.toggle('shown', s.winchAttached);
    this.engineEl.classList.toggle('shown', s.engine > 0);
    this.engineEl.classList.toggle('stalled', s.engine === 2);
    const engine = String(s.engine);
    if (this.status.dataset.engine !== engine) this.status.dataset.engine = engine;
    // Warnings leave the banner stack on a phone; what you can do (winch, handbrake) stays.
    const prompts = touch ? s.prompts.filter((p) => p.keys !== '!') : s.prompts;
    const key = `${touch ? 't' : 'd'}:${prompts.map((p) => `${p.keys}|${p.text}|${p.progress?.toFixed(2) ?? ''}`).join('#')}`;
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      // On a phone held upright the prompt takes a line under the dials (hudStyles.css).
      this.el.classList.toggle('with-prompt', prompts.length > 0);
      this.el.style.setProperty('--prompt-count', String(prompts.length));
      this.promptsEl.innerHTML = '';
      for (const p of prompts) {
        const el = document.createElement('div');
        el.className = 'prompt paper';
        if (touch && echoesTouchButton(p.keys)) el.classList.add('prompt-echo');
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = p.keys;
        if (p.progress !== undefined) k.style.setProperty('--progress', `${Math.round(p.progress * 100)}%`);
        el.append(k, document.createTextNode(` ${p.text}`));
        this.promptsEl.appendChild(el);
      }
    }
    this.drawAlerts(
      touch,
      s.prompts.filter((p) => p.keys === '!'),
    );
  }

  /**
   * Phone warnings and notices share a short rail under the compass. A keyboard or a pad
   * keeps the warnings in the prompt stack and the notices in the top right.
   */
  private drawAlerts(touch: boolean, warnings: Prompt[]): void {
    const parent = touch ? this.alertRail : this.noticesEl;
    if (this.toasts.parentElement !== parent) parent.appendChild(this.toasts);
    if (!touch) {
      if (this.alertsEl.childElementCount > 0) this.alertsEl.replaceChildren();
      this.alertRail.classList.remove('full');
      this.lastAlertKey = '';
      return;
    }
    const now = performance.now();
    const views = warnings.map((p) => warningView(p.text));
    const ids = new Set(views.map((v) => v.id));
    for (const id of [...this.alertSeen.keys()]) if (!ids.has(id)) this.alertSeen.delete(id);
    for (const id of [...this.alertExpanded.keys()]) {
      if (!ids.has(id) || (this.alertExpanded.get(id) ?? 0) <= now) this.alertExpanded.delete(id);
    }
    for (const v of views) if (!this.alertSeen.has(v.id)) this.alertSeen.set(v.id, now);
    const items = railItems(views, now, this.alertSeen, this.alertExpanded);
    const key = items.map((i) => `${i.id}|${i.text}|${i.minimised}`).join('#');
    this.alertRail.classList.toggle('full', items.length >= 2);
    if (key === this.lastAlertKey) return;
    this.lastAlertKey = key;
    this.alertsEl.replaceChildren();
    for (const item of items) this.alertsEl.appendChild(alertElement(item));
  }

  private drawMission(e: EpisodeHud | null): void {
    const now = performance.now();
    const place = e ? `${e.mission}|${e.urgent}` : '';
    if (place !== this.lastMissionPlace) {
      this.lastMissionPlace = place;
      this.missionRevealUntil = now + MISSION_FADE_MS;
    }
    const faded = !!e && !e.urgent && now > this.missionRevealUntil;
    this.vehicleGauges.setClock(e?.clock ?? '');
    const key = e ? `${e.title}|${e.mission}|${e.clock}|${e.deadline}|${e.urgent}|${faded}` : `:${faded}`;
    if (key === this.lastMissionKey) return;
    this.lastMissionKey = key;
    this.missionEl.classList.toggle('hidden', !e || faded);
    if (!e) return;
    this.missionEl.querySelector('small')!.textContent = e.title;
    this.missionEl.querySelector('strong')!.textContent = e.mission;
    const clock = this.missionEl.querySelector('.mission-clock') as HTMLElement;
    clock.textContent = e.clock ? `${e.clock}${e.deadline ? ` · ${e.deadline}` : ''}` : '';
    clock.classList.toggle('urgent', e.urgent);
  }

  private drawSupplies(s: SuppliesHud | null): void {
    this.suppliesPanel.classList.toggle('hidden', !s);
    if (!s) return;
    this.vehicleGauges.update(s);
    const key = `${s.jerryCans}|${s.spares}|${s.plugs}`;
    if (key === this.lastSuppliesKey) return;
    this.lastSuppliesKey = key;
    this.suppliesEl.innerHTML = `<span title="Jerry cans (20 L each)">${icons.fuel}×${s.jerryCans}</span><span title="Spare wheels">${icons.tyre}×${s.spares}</span><span title="Tyre plugs">${icons.plug}×${s.plugs}</span>`;
  }

  private drawTrailer(t: TrailerHud | null): void {
    // Left standing, the distance moves in 5 m steps so the line doesn't flicker.
    const far = t ? Math.max(5, Math.round(t.distance / 5) * 5) : 0;
    const key = t ? `${t.state}|${t.drums}|${t.kg}|${t.overloaded}|${far}` : '';
    if (key === this.lastTrailerKey) return;
    this.lastTrailerKey = key;
    this.trailerEl.classList.toggle('hidden', !t);
    if (!t) return;
    const load = t.drums > 0 ? `${t.drums} drum${t.drums === 1 ? '' : 's'}` : 'Empty';
    const text: Record<TrailerHud['state'], string> = {
      towing: load,
      jackknifed: 'Jackknifed',
      tipped: 'On its side',
      left: `Left ${far} m away`,
    };
    this.trailerEl.querySelector('.trailer-text')!.textContent = text[t.state];
    this.trailerEl.querySelector('.trailer-kg')!.textContent = t.state === 'towing' ? `· ${t.kg} kg` : '';
    this.trailerEl.classList.toggle(
      'warn',
      t.state === 'jackknifed' || (t.state === 'towing' && t.overloaded),
    );
    this.trailerEl.classList.toggle('bad', t.state === 'tipped');
    this.trailerEl.classList.toggle('left', t.state === 'left');
    this.trailerEl.title =
      t.state === 'left'
        ? 'Trailer standing unhitched: back up to its coupling to hitch it'
        : `${t.name}: ${t.drums > 0 ? `${load.toLowerCase()} of diesel, ` : 'empty, '}${t.kg} of ${t.limit} kg${t.overloaded ? ' (overloaded)' : ''}`;
  }

  /** A small car seen from above: each corner and the engine coloured by its health. */
  private drawDamage(d: HudState['damage']): void {
    const key = d ? `${d.engine.toFixed(2)}|${d.corners.map((c) => c.health.toFixed(2)).join(',')}` : '';
    if (key === this.lastDamageKey) return;
    this.lastDamageKey = key;
    this.damageEl.classList.toggle('shown', d !== null);
    if (!d) {
      this.damageEl.innerHTML = '';
      return;
    }
    const colour = (h: number) => (h > 0.97 ? 'currentColor' : h > 0.45 ? '#b8741a' : '#a3311f');
    const wheels = d.corners
      .map(
        (c) =>
          `<rect x="${c.left ? 3 : 17}" y="${c.front ? 3 : 15}" width="4" height="7" rx="1" fill="${colour(c.health)}"/>`,
      )
      .join('');
    this.damageEl.innerHTML = `<svg viewBox="0 0 24 24"><rect x="7.5" y="2" width="9" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="9.5" y="4" width="5" height="5" rx="1" fill="${colour(d.engine)}"/>${wheels}</svg>`;
    const parts = [
      d.engine < 0.97 ? `engine ${Math.round(d.engine * 100)}%` : '',
      ...d.corners.map((c) =>
        c.health < 0.97
          ? `${c.front ? 'front' : 'rear'} ${c.left ? 'left' : 'right'} ${Math.round(c.health * 100)}%`
          : '',
      ),
    ].filter(Boolean);
    this.damageEl.title = `Damage: ${parts.join(', ')}`;
  }

  /** The pitch and roll gauges are drawn on a canvas: give it the style's colours. */
  private setGaugePalette(): void {
    if (this.lastPalette === this.style) return;
    this.lastPalette = this.style;
    this.gauges.setPalette(gaugePalettes[this.style]);
  }

  /** Short message card (range change, winch attached...). On a phone it is one short line. */
  toast(text: string, ms = 2200): void {
    this.onToast?.(text, ms);
    const el = document.createElement('div');
    el.className = 'toast paper';
    const touch = document.body.classList.contains('touch-mode');
    el.textContent = touch ? touchNotice(text) : text;
    if (touch && el.textContent !== text) el.title = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }

  /** Result card for a scored crawl run. */
  runResult(title: string, name: string, detail: string, milliseconds = 5000): void {
    const el = document.createElement('div');
    el.className = 'discovery-card run-card paper';
    el.innerHTML = `<div><div class="discovery-label"></div><div class="discovery-name"></div><div class="run-detail"></div></div>`;
    (el.querySelector('.discovery-label') as HTMLElement).textContent = title;
    (el.querySelector('.discovery-name') as HTMLElement).textContent = name;
    (el.querySelector('.run-detail') as HTMLElement).textContent = detail;
    this.discovery.innerHTML = '';
    this.discovery.appendChild(el);
    setTimeout(() => el.classList.add('out'), milliseconds);
    setTimeout(() => el.remove(), milliseconds + 700);
  }

  /** "Discovered: …" paper card that unfolds in the top right corner. */
  discovered(name: string, kind: PoiIcon): void {
    // A new location must not replace a result before the driver can read it.
    if (this.discovery.querySelector('.run-card:not(.out)')) return;
    const el = document.createElement('div');
    el.className = 'discovery-card found paper';
    el.innerHTML = `<div class="discovery-icon">${icons[kind]}</div><div><div class="discovery-label">Discovered</div><div class="discovery-name"></div></div>`;
    (el.querySelector('.discovery-name') as HTMLElement).textContent = name;
    this.discovery.innerHTML = '';
    this.discovery.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3900);
  }
}

export interface GateState {
  next: number;
  total: number;
  passed: number;
  missed: number;
  flags: number;
  course?: { name: string; score: number; seconds: number };
}

function alertElement(item: RailItem): HTMLElement {
  const el = document.createElement('div');
  el.className = `alert paper${item.critical ? ' critical' : ''}${item.minimised ? ' minimised' : ''}`;
  el.dataset.id = item.id;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', item.full);
  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '!';
  const label = document.createElement('span');
  label.textContent = item.text;
  el.append(mark, label);
  return el;
}

function flagsText(flags: number): string {
  return `${flags} flag${flags === 1 ? '' : 's'}`;
}

/**
 * "Gate 14 / 52", with gates missed and flags touched this lap; "Lap done: 52 / 52 gates"
 * once the lap is done.
 */
export function gateText(g: GateState): string {
  if (g.course)
    return `${g.course.name} · Gate ${Math.min(g.total, g.next)} / ${g.total} · ${g.course.score} / 1000 · ${clock(g.course.seconds)}`;
  const flags = g.flags ? ` · ${flagsText(g.flags)}` : '';
  if (g.next > g.total) return `Lap done: ${g.passed} / ${g.total} gates${flags}`;
  const missed = g.missed ? ` · ${g.missed} missed` : '';
  return `Gate ${Math.max(1, g.next)} / ${g.total}${missed}${flags}`;
}

/** The second line of the lap result card. */
export function gateLapDetail(missed: number, flags: number): string {
  if (!missed && !flags) return 'Every gate in order, no flags touched';
  return [missed ? `${missed} missed` : 'Every gate in order', flags ? `${flagsText(flags)} touched` : '']
    .filter(Boolean)
    .join(' · ');
}

/** m:ss.s for run times. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** Canvas colours for the pitch and roll gauges in each style. */
const gaugePalettes: Record<HudStyle, Parameters<CrawlGauges['setPalette']>[0]> = {
  dash: {
    ink: '#efe8d6',
    soft: '#b9b09c',
    accent: '#ff8f3f',
    paper: '#151412',
    warn: '#ff5a3c',
    font: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  },
  edge: {
    ink: '#ffffff',
    soft: 'rgba(255, 255, 255, 0.7)',
    accent: '#ffc04d',
    paper: 'rgba(12, 12, 12, 0.6)',
    warn: '#ff6a4d',
    font: "'Barlow', 'Segoe UI', sans-serif",
  },
  kit: {
    ink: '#22201c',
    soft: '#5c5446',
    accent: '#b8321f',
    paper: '#f1e8d2',
    warn: '#b8321f',
    font: "'Courier Prime', 'Courier New', monospace",
  },
};

const corner = (front: boolean, left: boolean) => `${front ? 'F' : 'R'}${left ? 'L' : 'R'}`;

/**
 * The lamps: what is switched on first (range, lockers, crawl, handbrake, lights, winch,
 * tyres let down), then what is wrong (engine, heat, fuel, tyres, damage, the trailer).
 * Nothing shows while all is off and well.
 */
export function lampsFor(s: HudState): Lamp[] {
  const out: Lamp[] = [];
  if (s.transfer?.fullTime && s.transfer.centreLocked)
    out.push({ id: 'centre', text: 'C LOCK', tone: 'amber', title: 'Centre diff locked' });
  if (s.transfer && !s.transfer.fullTime && !s.transfer.hubsLocked)
    out.push({
      id: 'hubs',
      text: 'HUBS FREE',
      tone: 'amber',
      title: 'Front hubs unlocked: select 2H and lock them to use 4WD',
    });
  if (s.transfer && s.transfer.windup >= 0.5)
    out.push({
      id: 'windup',
      text: 'WIND-UP',
      tone: 'red',
      title: 'Driveline strain: use 2H or unlock the centre diff on firm ground',
    });
  if (s.range === 'low') out.push({ id: 'low', text: 'LOW', tone: 'amber', title: 'Low range' });
  if (s.frontLocked) out.push({ id: 'flock', text: 'F LOCK', tone: 'amber', title: 'Front diff locked' });
  if (s.rearLocked) out.push({ id: 'rlock', text: 'R LOCK', tone: 'amber', title: 'Rear diff locked' });
  if (s.precisionCrawl)
    out.push({
      id: 'crawl',
      text: 'CRAWL',
      tone: 'amber',
      title: 'Precision crawl: hold the throttle for walking pace',
    });
  if (s.parkBrake) out.push({ id: 'brake', text: 'BRAKE', tone: 'red', title: 'Handbrake on' });
  if (s.lights === 'high')
    out.push({ id: 'lights', text: 'HIGH BEAM', tone: 'blue', title: 'Headlights on high beam' });
  else if (s.lights !== 'off')
    out.push({ id: 'lights', text: 'LIGHTS', tone: 'green', title: 'Headlights on' });
  if (s.winchAttached)
    out.push({
      id: 'winch',
      text: s.winchDoubleLine ? 'WINCH ×2' : 'WINCH',
      tone: 'amber',
      title: `Winch attached${s.treeProtector ? ' with tree protector' : ''}`,
    });
  const sup = s.supplies;
  if (sup?.lowPressure)
    out.push({
      id: 'trail',
      text: sup.pressurePsi === undefined ? 'TRAIL' : `${sup.pressurePsi} psi`,
      tone: 'amber',
      title: 'Tyres let down for grip: pump them up for gravel from Tools',
    });
  if (s.engine === 2) out.push({ id: 'engine', text: 'STALLED', tone: 'red', title: 'Engine stalled' });
  else if (s.engine === 1)
    out.push({ id: 'engine', text: 'FLOODING', tone: 'red', blink: true, title: 'Engine flooding' });
  const tyreLamp = new Set<string>();
  if (sup) {
    if (sup.heat >= 1)
      out.push({
        id: 'heat',
        text: 'ENGINE HOT',
        tone: 'red',
        title: 'Engine hot: ease off and let it cool',
      });
    else if (sup.heat >= damageTuning.engine.heatWarn)
      out.push({ id: 'heat', text: 'TEMP HIGH', tone: 'amber', title: 'Engine running hot' });
    if (sup.fuel / Math.max(1, sup.tank) < 0.15)
      out.push({
        id: 'fuel',
        text: 'FUEL LOW',
        tone: 'red',
        title: `Fuel low: ${Math.round(sup.fuel)} L left`,
      });
    for (const t of sup.tyres) {
      const c = corner(t.front, t.left);
      const where = `${t.front ? 'Front' : 'Rear'} ${t.left ? 'left' : 'right'} tyre`;
      if (t.inflation <= 0.05) {
        out.push({ id: `tyre-${c}`, text: `FLAT ${c}`, tone: 'red', title: `${where} flat` });
        tyreLamp.add(c);
      } else if (t.fault !== 'none' || t.inflation < 0.97) {
        const pct = Math.round(Math.max(0, Math.min(1, t.inflation)) * 100);
        out.push({
          id: `tyre-${c}`,
          text: pct >= 97 ? `TYRE ${c}` : `TYRE ${c} ${pct}%`,
          tone: 'amber',
          title: `${where}: ${pct}% air${t.fault === 'sidewall' ? ', torn sidewall' : t.fault === 'rim' ? ', off the rim' : t.fault !== 'none' ? ', puncture' : ''}`,
        });
        tyreLamp.add(c);
      }
    }
  }
  if (s.damage) {
    if (s.damage.engine < 0.97)
      out.push({
        id: 'engine-health',
        text: `ENGINE ${Math.round(s.damage.engine * 100)}%`,
        tone: s.damage.engine < 0.45 ? 'red' : 'amber',
        title: 'Engine damaged: a camp fixes it',
      });
    const hurt = s.damage.corners.filter((c) => c.health < 0.97 && !tyreLamp.has(corner(c.front, c.left)));
    if (hurt.length > 0)
      out.push({
        id: 'damage',
        text: hurt.length === 1 ? `DAMAGE ${corner(hurt[0].front, hurt[0].left)}` : 'DAMAGE',
        tone: hurt.some((c) => c.health < 0.45) ? 'red' : 'amber',
        title: 'Suspension damaged: a field repair from Tools, or a camp',
      });
  }
  const t = s.trailer;
  if (t?.state === 'tipped')
    out.push({ id: 'trailer', text: 'TRAILER OVER', tone: 'red', title: 'The trailer has tipped over' });
  else if (t?.state === 'jackknifed')
    out.push({
      id: 'trailer',
      text: 'JACKKNIFE',
      tone: 'amber',
      title: 'Jackknifed: pull forward to straighten the trailer',
    });
  else if (t?.state === 'towing' && t.overloaded)
    out.push({ id: 'trailer', text: 'OVERLOAD', tone: 'amber', title: 'Trailer overloaded' });
  return out;
}

/** Set an element's text only when it changed: an equal write still dirties the page's layout. */
function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
