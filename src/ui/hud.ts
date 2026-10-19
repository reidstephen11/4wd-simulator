import { icons, type PoiIcon } from './icons';
import { cameraPresets, type CameraPreset } from '../data/camera';
import { CrawlGauges, type GaugeMode, type GaugeState } from './crawlGauges';
import type { HeadlightMode } from '../data/headlights';

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

export interface HudState {
  gauges: GaugeState;
  /** A scored crawl run in progress. */
  run: { name: string; seconds: number; points: number } | null;
  /** Camera heading (degrees, 0 = north). */
  heading: number;
  pois: CompassPoi[];
  range: 'high' | 'low';
  frontLocked: boolean;
  rearLocked: boolean;
  precisionCrawl: boolean;
  /** The park brake is on. */
  parkBrake: boolean;
  /** Headlights: a green lamp for low beam, a blue one for high beam, as on the dash. */
  lights: HeadlightMode;
  courseHint: { title: string; text: string; controls: string } | null;
  planksCarried: number;
  planksTotal: number;
  winchAttached: boolean;
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
  onCameraReset: (() => void) | null = null;
  onCameraPreset: (() => void) | null = null;
  private readonly compass: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  private readonly status: HTMLElement;
  private readonly rangeEl: HTMLElement;
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
  private readonly toasts: HTMLElement;
  private readonly discovery: HTMLElement;
  private readonly cameraHelpEl: HTMLElement;
  private readonly cameraHint: HTMLElement;
  private readonly cameraResetKey: HTMLElement;
  private readonly cameraPresetButton: HTMLButtonElement;
  private readonly gauges: CrawlGauges;
  private readonly runEl: HTMLElement;
  /** Crawl gauges: 'auto' shows them in low range, precision crawl or the driver's seat. */
  gaugeMode: GaugeMode = 'auto';
  /** Set by the game: the driver's-seat camera is in use. */
  cockpitView = false;
  private lastCompassKey = '';
  private lastPromptKey = '';
  private readonly iconImages = new Map<string, HTMLImageElement>();

  constructor(root: HTMLElement, driveAction: (action: 'frontDiff' | 'rearDiff' | 'precision') => void) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="compass paper"><canvas width="840" height="76"></canvas></div>
      <div class="status paper">
        <div class="status-range" title="Transfer range">H</div>
        <button type="button" class="status-drive" data-drive="frontDiff" aria-label="Front differential lock" aria-pressed="false" title="Front diff lock: Z / LB menu">F OPEN</button>
        <button type="button" class="status-drive" data-drive="rearDiff" aria-label="Rear differential lock" aria-pressed="false" title="Rear diff lock: X / LB menu">R OPEN</button>
        <button type="button" class="status-drive" data-drive="precision" aria-label="Precision crawl" aria-pressed="false" title="Precision crawl: P / LB menu. Hold throttle for walking pace.">CRAWL</button>
        <div class="status-park" title="Handbrake on: Space / X">P</div>
        <div class="status-item status-lights" title="Headlights: N / LB menu">${icons.headlight}</div>
        <div class="status-item status-damage" title="Damage"></div>
        <div class="status-item status-planks" title="Planks">${icons.planks}<span>2/2</span></div>
        <div class="status-item status-winch" title="Winch attached">${icons.winch}</div>
        <div class="status-item status-engine" title="Engine flooding">${icons.engine}</div>
      </div>
      <div class="course-hint paper hidden"><strong></strong><span></span><small></small></div>
      <div class="prompts"></div>
      <div class="camera-help paper">
        <span class="camera-hint">Drag to orbit · Scroll to zoom</span>
        <button type="button" class="camera-preset" aria-label="Camera view" title="Cycle wheel-placement views: C / hold LB + click right stick">View: <span>Follow</span> <kbd>C</kbd></button>
        <button type="button" class="camera-reset" title="Return behind the vehicle">Reset view <kbd>V</kbd></button>
      </div>
      <div class="crawl-run paper hidden"><strong></strong><span class="crawl-run-time"></span><span class="crawl-run-points"></span></div>
      <div class="notices"><div class="discovery"></div><div class="toasts"></div></div>`;
    root.appendChild(this.el);
    this.gauges = new CrawlGauges(this.el);
    this.runEl = this.el.querySelector('.crawl-run') as HTMLElement;
    this.compass = this.el.querySelector('.compass canvas') as HTMLCanvasElement;
    this.cctx = this.compass.getContext('2d') as CanvasRenderingContext2D;
    this.status = this.el.querySelector('.status') as HTMLElement;
    this.rangeEl = this.el.querySelector('.status-range') as HTMLElement;
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
    this.planksEl = this.el.querySelector('.status-planks span') as HTMLElement;
    this.winchEl = this.el.querySelector('.status-winch') as HTMLElement;
    this.engineEl = this.el.querySelector('.status-engine') as HTMLElement;
    this.promptsEl = this.el.querySelector('.prompts') as HTMLElement;
    this.toasts = this.el.querySelector('.toasts') as HTMLElement;
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
    for (const k of ['campsite', 'viewpoint', 'landmark', 'feature'] as const) {
      const img = new Image();
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(
        icons[k]
          .replace('currentColor', '#3B2A1E')
          .replace(/currentColor/g, '#3B2A1E')
          .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '),
      )}`;
      this.iconImages.set(k, img);
    }
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
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
    const key = device === 'keyboard' ? 'V' : 'R3';
    if (this.cameraResetKey.textContent !== key) this.cameraResetKey.textContent = key;
    this.cameraPresetButton.hidden = !driving;
    this.cameraPresetButton.querySelector('span')!.textContent = cameraPresets[preset].label;
    this.cameraPresetButton.querySelector('kbd')!.textContent = device === 'keyboard' ? 'C' : 'LB + R3';
  }

  update(s: HudState): void {
    this.el.classList.toggle('cockpit', this.cockpitView);
    this.drawCompass(s);
    const showGauges =
      this.gaugeMode === 'on' ||
      (this.gaugeMode === 'auto' && (s.range === 'low' || s.precisionCrawl || this.cockpitView));
    this.gauges.visible = showGauges;
    if (showGauges) this.gauges.update(s.gauges);
    this.runEl.classList.toggle('hidden', !s.run);
    if (s.run) {
      this.runEl.querySelector('strong')!.textContent = s.run.name;
      this.runEl.querySelector('.crawl-run-time')!.textContent = clock(s.run.seconds);
      this.runEl.querySelector('.crawl-run-points')!.textContent =
        s.run.points === 0 ? 'clean' : `${s.run.points} pt${s.run.points === 1 ? '' : 's'}`;
    }
    this.rangeEl.textContent = s.range === 'high' ? 'H' : 'L';
    this.rangeEl.classList.toggle('low', s.range === 'low');
    this.parkEl.classList.toggle('shown', s.parkBrake);
    this.lightsEl.classList.toggle('shown', s.lights !== 'off');
    this.lightsEl.classList.toggle('high', s.lights === 'high');
    this.drawDamage(s.damage);
    const active = [s.frontLocked, s.rearLocked, s.precisionCrawl];
    this.driveButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(active[index]));
      if (index < 2) button.textContent = `${index === 0 ? 'F' : 'R'} ${active[index] ? 'LOCK' : 'OPEN'}`;
    });
    this.courseHint.classList.toggle('hidden', !s.courseHint);
    if (s.courseHint) {
      this.courseHint.querySelector('strong')!.textContent = s.courseHint.title;
      this.courseHint.querySelector('span')!.textContent = s.courseHint.text;
      this.courseHint.querySelector('small')!.textContent = s.courseHint.controls;
    }
    this.planksEl.textContent = `${s.planksCarried}/${s.planksTotal}`;
    this.winchEl.classList.toggle('shown', s.winchAttached);
    this.engineEl.classList.toggle('shown', s.engine > 0);
    this.engineEl.classList.toggle('stalled', s.engine === 2);
    this.status.dataset.engine = String(s.engine);
    const key = s.prompts.map((p) => `${p.keys}|${p.text}|${p.progress?.toFixed(2) ?? ''}`).join('#');
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      this.promptsEl.innerHTML = '';
      for (const p of s.prompts) {
        const el = document.createElement('div');
        el.className = 'prompt paper';
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = p.keys;
        if (p.progress !== undefined) k.style.setProperty('--progress', `${Math.round(p.progress * 100)}%`);
        el.append(k, document.createTextNode(` ${p.text}`));
        this.promptsEl.appendChild(el);
      }
    }
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

  private drawCompass(s: HudState): void {
    const key = `${s.heading.toFixed(1)}|${s.pois.map((p) => `${p.id}${p.bearing.toFixed(0)}`).join(',')}`;
    if (key === this.lastCompassKey) return;
    this.lastCompassKey = key;
    const c = this.cctx;
    const w = this.compass.width;
    const h = this.compass.height;
    c.clearRect(0, 0, w, h);
    const span = 180;
    const pxPerDeg = w / span;
    const x = (bearing: number) => {
      let d = bearing - s.heading;
      d = ((((d + 180) % 360) + 360) % 360) - 180;
      return w / 2 + d * pxPerDeg;
    };
    c.strokeStyle = '#3B2A1E';
    c.fillStyle = '#3B2A1E';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const labels: Record<number, string> = {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SW',
      270: 'W',
      315: 'NW',
    };
    for (let b = 0; b < 360; b += 5) {
      const px = x(b);
      if (px < -10 || px > w + 10) continue;
      const major = b % 45 === 0;
      c.lineWidth = major ? 3 : b % 15 === 0 ? 2 : 1.2;
      c.beginPath();
      c.moveTo(px, h - 6);
      c.lineTo(px, h - (major ? 22 : b % 15 === 0 ? 16 : 11));
      c.stroke();
      if (labels[b] !== undefined) {
        c.font = `${labels[b].length === 1 ? 'bold 30px' : '22px'} "Patrick Hand", "Nunito", sans-serif`;
        c.fillStyle = b === 0 ? '#B5653A' : '#3B2A1E';
        c.fillText(labels[b], px, 24);
        c.fillStyle = '#3B2A1E';
      }
    }
    for (const p of s.pois) {
      const px = x(p.bearing);
      if (px < 12 || px > w - 12) continue;
      const img = this.iconImages.get(p.kind);
      if (img?.complete) c.drawImage(img, px - 13, 32, 26, 26);
    }
    // Centre marker.
    c.fillStyle = '#B5653A';
    c.beginPath();
    c.moveTo(w / 2 - 9, h);
    c.lineTo(w / 2 + 9, h);
    c.lineTo(w / 2, h - 12);
    c.closePath();
    c.fill();
  }

  /** Short message card (range change, winch attached...). */
  toast(text: string, ms = 2200): void {
    const el = document.createElement('div');
    el.className = 'toast paper';
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }

  /** Result card for a scored crawl run. */
  runResult(title: string, name: string, detail: string): void {
    const el = document.createElement('div');
    el.className = 'discovery-card run-card paper';
    el.innerHTML = `<div><div class="discovery-label"></div><div class="discovery-name"></div><div class="run-detail"></div></div>`;
    (el.querySelector('.discovery-label') as HTMLElement).textContent = title;
    (el.querySelector('.discovery-name') as HTMLElement).textContent = name;
    (el.querySelector('.run-detail') as HTMLElement).textContent = detail;
    this.discovery.innerHTML = '';
    this.discovery.appendChild(el);
    setTimeout(() => el.classList.add('out'), 5000);
    setTimeout(() => el.remove(), 5700);
  }

  /** "Discovered: …" paper card that unfolds in the top right corner. */
  discovered(name: string, kind: PoiIcon): void {
    const el = document.createElement('div');
    el.className = 'discovery-card paper';
    el.innerHTML = `<div class="discovery-icon">${icons[kind]}</div><div><div class="discovery-label">Discovered</div><div class="discovery-name"></div></div>`;
    (el.querySelector('.discovery-name') as HTMLElement).textContent = name;
    this.discovery.innerHTML = '';
    this.discovery.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3900);
  }
}

/** m:ss.s for run times. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
