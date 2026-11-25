import { onUiScale, uiScale } from './uiScale';

/** One tyre on the gauge: share of its parked load, on the ground, spinning. */
export interface GaugeWheel {
  load: number;
  contact: boolean;
  spin: number;
}

/** What the crawl gauges show (see buildHudState). */
export interface GaugeState {
  /** Nose up + (degrees). */
  pitch: number;
  /** Right side down + (degrees). */
  roll: number;
  speedKmh: number;
  /** 'R', '1', '2' or '3'. */
  gear: string;
  range: 'high' | 'low';
  rpm: number;
  redline: number;
  /** Front left, front right, rear left, rear right. */
  wheels: readonly GaugeWheel[];
  frontLocked: boolean;
  rearLocked: boolean;
  /** The chassis is resting or scraping on the ground. */
  bodyContact: boolean;
}

export type GaugeMode = 'auto' | 'on' | 'off';

export type SpeedUnits = 'kmh' | 'mph';

/** A speed for the HUD in the chosen units: one decimal under 10, whole numbers above. */
export function formatSpeed(kmh: number, units: SpeedUnits): string {
  const v = units === 'mph' ? kmh * 0.621371 : kmh;
  return `${v < 10 ? v.toFixed(1) : v.toFixed(0)} ${units === 'mph' ? 'mph' : 'km/h'}`;
}

/**
 * Canvas rotation (radians) for a gauge's vehicle outline. Canvas y points down, so a
 * positive rotation turns clockwise on screen: it lifts the side view's front (drawn on
 * the left) when the nose is up, and drops the rear view's right side when that side
 * is down. Both views use the angle as it comes.
 */
export function outlineRotation(angleDeg: number): number {
  return (angleDeg * Math.PI) / 180;
}

/**
 * Lettering sizes in drawing units. A phone shows the panel at 0.62 of its size
 * (styles.css), so its lettering is drawn larger to stay at 12 px or more on screen.
 */
const LETTERING = {
  screen: { label: 10, figure: 16, small: 12, revBar: 120 },
  phone: { label: 19.5, figure: 21, small: 19.5, revBar: 64 },
};

const W = 318;
const H = 150;
/** Angles where the dial turns red: tipping risk. */
export const PITCH_WARN = 32;
export const ROLL_WARN = 28;
/** On a phone the inclinometer stays hidden until the car is this far into a lean (degrees). */
export const PITCH_RISK = 20;
export const ROLL_RISK = 16;

/** True when the phone HUD should show pitch/roll: the car is leaning enough to worry. */
export function phoneTiltRisk(g: Pick<GaugeState, 'pitch' | 'roll' | 'bodyContact'>): boolean {
  return g.bodyContact || Math.abs(g.pitch) >= PITCH_RISK || Math.abs(g.roll) >= ROLL_RISK;
}

/**
 * Crawl gauges (bottom right): a pitch and roll inclinometer like the ones bolted to
 * real trail rigs, each tyre's load (hollow when lifted, orange when spinning), the
 * lockers, and speed, gear and revs. Drawn in the HUD's paper-and-ink style.
 */
export class CrawlGauges {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastKey = '';
  private ink: string;
  private soft: string;
  private accent: string;
  private paper: string;
  private warn = '#a83a2a';
  /** Figures and labels; the HUD style picks it with the colours. */
  private font = "'Patrick Hand', 'Nunito', cursive";
  /** Speed units from the settings. */
  units: SpeedUnits = 'kmh';
  private lettering: (typeof LETTERING)['screen'] = LETTERING.screen;
  /** Canvas pixels per drawing unit: the screen's pixel ratio times the interface scale. */
  private drawScale = 1;

  /** Size the canvas's pixels to how big it is drawn (W × H drawing units at the interface scale). */
  private fitCanvas(ui: number): void {
    this.drawScale = Math.min(2, window.devicePixelRatio || 1) * ui;
    this.canvas.width = Math.round(W * this.drawScale);
    this.canvas.height = Math.round(H * this.drawScale);
    this.lastKey = '';
  }

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'crawl-gauges paper hidden';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    root.appendChild(this.el);
    this.canvas.style.width = `calc(${W} * var(--u))`;
    this.canvas.style.height = `calc(${H} * var(--u))`;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.fitCanvas(uiScale());
    onUiScale((k) => this.fitCanvas(k));
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    this.ink = v('--ink', '#3b2a1e');
    this.soft = v('--ink-soft', '#6b5442');
    this.accent = v('--accent', '#b5653a');
    this.paper = v('--paper', '#f3ebda');
  }

  /** Colours and type for the HUD style. Redraws on the next update. */
  setPalette(p: {
    ink: string;
    soft: string;
    accent: string;
    paper: string;
    warn: string;
    font: string;
  }): void {
    this.ink = p.ink;
    this.soft = p.soft;
    this.accent = p.accent;
    this.paper = p.paper;
    this.warn = p.warn;
    this.font = p.font;
    this.lastKey = '';
  }

  set visible(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  update(g: GaugeState): void {
    const key = [
      g.pitch.toFixed(0),
      g.roll.toFixed(0),
      g.speedKmh.toFixed(1),
      this.units,
      g.gear,
      g.range,
      Math.round(g.rpm / 50),
      g.frontLocked,
      g.rearLocked,
      g.bodyContact,
      ...g.wheels.map((w) => `${w.contact ? Math.round(w.load * 8) : 'x'}${w.spin > 0.3 ? 's' : ''}`),
    ].join('|');
    // A phone shows the panel at about half size, so its lettering is drawn larger (see LETTERING).
    const phone = typeof document !== 'undefined' && document.body.classList.contains('touch-mode');
    this.lettering = phone ? LETTERING.phone : LETTERING.screen;
    if (`${phone}|${key}` === this.lastKey) return;
    this.lastKey = `${phone}|${key}`;
    const c = this.ctx;
    c.setTransform(this.drawScale, 0, 0, this.drawScale, 0, 0);
    c.clearRect(0, 0, W, H);
    this.dial(52, 58, 40, g.pitch, PITCH_WARN, 'side', 'PITCH');
    this.dial(146, 58, 40, g.roll, ROLL_WARN, 'rear', 'ROLL');
    this.wheels(g, 262, 60);
    // Speed, gear and revs along the bottom.
    c.fillStyle = this.ink;
    const t = this.lettering;
    c.font = `700 ${t.figure}px ${this.font}`;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const gear = `${g.range === 'low' ? 'L' : 'H'}${g.gear}`;
    c.fillText(gear, 10, H - 9);
    c.fillText(formatSpeed(g.speedKmh, this.units), 44, H - 9);
    // Rev bar, shortened to leave room for larger lettering after it.
    const x0 = 128;
    const bw = t.revBar;
    const y = H - 20;
    c.strokeStyle = this.ink;
    c.lineWidth = 1.5;
    c.strokeRect(x0, y, bw, 10);
    const f = Math.max(0, Math.min(1, g.rpm / (g.redline * 1.1)));
    c.fillStyle = g.rpm > g.redline ? this.warn : this.accent;
    c.fillRect(x0 + 1, y + 1, (bw - 2) * f, 8);
    c.fillStyle = this.ink;
    c.font = `600 ${t.small}px ${this.font}`;
    c.fillText(`${Math.round(g.rpm / 10) * 10} rpm`, x0 + bw + 6, H - 10);
    if (g.bodyContact) {
      c.fillStyle = this.warn;
      c.font = `800 ${t.label}px ${this.font}`;
      c.textAlign = 'center';
      c.fillText('BELLY ON ROCK', 262, 126);
    }
  }

  /** An inclinometer: the vehicle outline tilts against a fixed level line. */
  private dial(
    cx: number,
    cy: number,
    r: number,
    angle: number,
    warn: number,
    view: 'side' | 'rear',
    label: string,
  ): void {
    const c = this.ctx;
    const danger = Math.abs(angle) >= warn;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = this.paper;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = danger ? this.warn : this.ink;
    c.stroke();
    // Ticks every 10° on the upper half, red beyond the warning angle.
    for (let a = -60; a <= 60; a += 10) {
      const t = ((a - 90) * Math.PI) / 180;
      const inner = a % 30 === 0 ? r - 9 : r - 5;
      c.beginPath();
      c.moveTo(cx + Math.cos(t) * inner, cy + Math.sin(t) * inner);
      c.lineTo(cx + Math.cos(t) * (r - 1), cy + Math.sin(t) * (r - 1));
      c.strokeStyle = Math.abs(a) >= warn ? this.warn : this.soft;
      c.lineWidth = a % 30 === 0 ? 1.6 : 1;
      c.stroke();
    }
    // Level reference.
    c.beginPath();
    c.moveTo(cx - r + 4, cy + 8);
    c.lineTo(cx + r - 4, cy + 8);
    c.strokeStyle = this.soft;
    c.setLineDash([3, 3]);
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
    // Vehicle outline, tilted.
    c.translate(cx, cy + 6);
    c.rotate(outlineRotation(angle));
    c.fillStyle = danger ? this.warn : this.ink;
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 1.5;
    if (view === 'side') {
      // Short-wheelbase wagon in profile, facing left.
      c.beginPath();
      c.moveTo(-24, 2);
      c.lineTo(-24, -6);
      c.lineTo(-12, -7);
      c.lineTo(-8, -17);
      c.lineTo(22, -17);
      c.lineTo(24, 2);
      c.closePath();
      c.fill();
      for (const x of [-14, 13]) {
        c.beginPath();
        c.arc(x, 3, 6, 0, Math.PI * 2);
        c.fillStyle = this.paper;
        c.fill();
        c.stroke();
      }
    } else {
      // From behind: tall body, solid axle, two tyres.
      c.beginPath();
      c.moveTo(-17, 0);
      c.lineTo(-17, -12);
      c.lineTo(-13, -22);
      c.lineTo(13, -22);
      c.lineTo(17, -12);
      c.lineTo(17, 0);
      c.closePath();
      c.fill();
      for (const x of [-15, 15]) {
        c.fillRect(x - 4, -1, 8, 10);
      }
    }
    c.restore();
    c.fillStyle = danger ? this.warn : this.ink;
    const t = this.lettering;
    c.font = `800 ${t.label}px ${this.font}`;
    c.textAlign = 'center';
    // Inside the dial under the outline; on a phone, where it is drawn larger, above the dial.
    c.fillText(label, cx, t === LETTERING.phone ? cy - r - 2 : cy + r - t.figure);
    c.font = `700 ${t.figure}px ${this.font}`;
    c.fillText(`${Math.round(Math.abs(angle))}°`, cx, cy + r - 2);
  }

  /** Top view: tyre load as ink density; lifted tyres hollow; spinning tyres orange. */
  private wheels(g: GaugeState, cx: number, cy: number): void {
    const c = this.ctx;
    const hx = 20;
    const hz = 30;
    c.strokeStyle = this.ink;
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(cx - 15, cy - 40, 30, 80, 6);
    c.stroke();
    // Axles, thick when locked.
    for (const [z, locked] of [
      [-hz, g.frontLocked],
      [hz, g.rearLocked],
    ] as const) {
      c.beginPath();
      c.moveTo(cx - hx, cy + z);
      c.lineTo(cx + hx, cy + z);
      c.strokeStyle = locked ? this.accent : this.soft;
      c.lineWidth = locked ? 4 : 1.5;
      c.stroke();
    }
    g.wheels.forEach((w, i) => {
      const x = cx + (i % 2 === 0 ? -hx : hx) - 6;
      const y = cy + (i < 2 ? -hz : hz) - 11;
      c.lineWidth = 1.5;
      if (!w.contact) {
        c.setLineDash([3, 2]);
        c.strokeStyle = this.warn;
        c.strokeRect(x, y, 12, 22);
        c.setLineDash([]);
        return;
      }
      c.globalAlpha = 0.25 + 0.75 * Math.min(1, w.load / 1.6);
      c.fillStyle = w.spin > 0.3 ? this.accent : this.ink;
      c.fillRect(x, y, 12, 22);
      c.globalAlpha = 1;
      c.strokeStyle = this.ink;
      c.strokeRect(x, y, 12, 22);
    });
    c.fillStyle = this.ink;
    c.font = `800 ${this.lettering.label}px ${this.font}`;
    c.textAlign = 'center';
    c.fillText('FRONT', cx, cy - 46);
  }
}
