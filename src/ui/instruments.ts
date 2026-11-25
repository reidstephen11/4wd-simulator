import { damageTuning } from '../data/damage';
import type { HudStyle } from '../data/hudStyles';
import type { SpeedUnits } from './crawlGauges';
import type { PoiIcon } from './icons';

/** A lamp lights only while something is on or wrong, and always says what in a word. */
export type LampTone = 'amber' | 'green' | 'blue' | 'red';

export interface Lamp {
  id: string;
  text: string;
  tone: LampTone;
  /** Flashes (the engine flooding). */
  blink?: boolean;
  /** The longer sentence for a mouse hover and the screen reader. */
  title?: string;
}

/** Something on the compass card: a discovered place and its bearing (degrees, 0 = north). */
export interface CompassMark {
  id: string;
  kind: PoiIcon;
  bearing: number;
}

/** What the instruments show this frame (see Hud.update). */
export interface InstrumentState {
  speedKmh: number;
  units: SpeedUnits;
  /** 'R', '1', '2' or '3'. */
  gear: string;
  range: 'high' | 'low';
  /** Engine heat (about 0.5 running normally, 1 hot) and fuel; null outside an episode. */
  heat: number | null;
  fuel: number | null;
  tank: number;
  /** The clock (14.5 = 2:30 pm), null while it stands still, and the hours that matter on it. */
  hour: number | null;
  darkHour: number | null;
  finishHour: number | null;
  /** Camera heading (degrees, 0 = north). */
  heading: number;
  pois: readonly CompassMark[];
  lamps: readonly Lamp[];
}

/**
 * Text in a dial never drops below this on screen (CSS px at scale 1): 12 px, read in the hand
 * on a phone's small dials, and on the full-size ones taken to 18 px on a 1080p television by
 * the dash's scale (1.5 there, src/ui/uiScale.ts).
 */
const MIN_TEXT_PX = { compact: 12, full: 12 };
/** Below this size (CSS px) a dial is a phone's compact one. */
const COMPACT_BELOW = 100;
/** Dial sizes the text is worked out for: the phone sizes are those of a phone 390 px or wider. */
const DIAL_PX = { compact: { speedo: 78, dial: 50 }, full: { speedo: 132, dial: 84 } };
/** The field kit's chrome gauges, brass compass and watch (CSS px). */
const KIT_PX = { compact: { gauge: 56, brass: 54, watch: 64 }, full: { gauge: 92, brass: 104, watch: 128 } };
/** The edge style's straight scales and compass tape (CSS px). */
const EDGE_PX = { compact: { scale: 104, tape: 112 }, full: { scale: 160, tape: 300 } };

const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  return [cx + Math.sin(rad(deg)) * r, cy - Math.cos(rad(deg)) * r];
}

const f2 = (n: number) => n.toFixed(2);

function arc(cx: number, cy: number, r: number, a: number, b: number): string {
  const p = pt(cx, cy, r, a);
  const q = pt(cx, cy, r, b);
  return `M${f2(p[0])},${f2(p[1])} A${r},${r} 0 ${b - a > 180 ? 1 : 0},1 ${f2(q[0])},${f2(q[1])}`;
}

/** A dial's needle angle: a 240° sweep from -120° (empty, cold) to +120° (full, hot). */
export const sweep = (share: number): number => -120 + clamp01(share) * 240;

/** Font size in dial units (viewBox 100) so the text is at least MIN_TEXT_PX (or `min`) on a dial `px` wide. */
const fz = (units: number, px: number, min = 0) =>
  Math.max(
    units,
    (Math.max(min, px < COMPACT_BELOW ? MIN_TEXT_PX.compact : MIN_TEXT_PX.full) * 100) / px,
  ).toFixed(1);

function line(a: [number, number], b: [number, number], width: number): string {
  return `<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke-width="${width}"/>`;
}

function text(x: number, y: number, cls: string, size: string, body: string): string {
  return `<text x="${f2(x)}" y="${f2(y)}" text-anchor="middle" class="${cls}" style="font-size:${size}px">${body}</text>`;
}

/** Clock face angle for an hour of the day (a 12-hour face). */
export const clockAngle = (hour: number): number => ((((hour % 12) + 12) % 12) / 12) * 360;

/** "6:15" for 18.25. */
export function shortClock(hour: number): string {
  let h = Math.floor(hour);
  let m = Math.round((hour - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${h % 12 === 0 ? 12 : h % 12}:${m < 10 ? '0' : ''}${m}`;
}

/** Temperature dial share: the red band starts where the engine warns. */
export const heatShare = (heat: number): number => clamp01(heat / 1.2);

interface Needle {
  el: SVGGElement;
  cx: number;
  cy: number;
  last: string;
}

/** A marker that slides along a straight scale (the edge style's TEMP and FUEL). */
interface Slider {
  el: SVGGraphicsElement;
  x0: number;
  x1: number;
  last: string;
}

function slide(sl: Slider | null, share: number): void {
  if (!sl) return;
  const t = `translate(${(sl.x0 + (sl.x1 - sl.x0) * clamp01(share)).toFixed(1)} 0)`;
  if (t === sl.last) return;
  sl.last = t;
  sl.el.setAttribute('transform', t);
}

/** "1:05 pm" for 13.08: the minutes run down, as a watch shows them. */
function clockWords(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${m < 10 ? '0' : ''}${m} ${h < 12 ? 'am' : 'pm'}`;
}

function turn(n: Needle | null, deg: number): void {
  if (!n) return;
  const t = `rotate(${deg.toFixed(1)} ${n.cx} ${n.cy})`;
  if (t === n.last) return;
  n.last = t;
  n.el.setAttribute('transform', t);
}

/**
 * The instruments for the chosen HUD style, built once per style and size; a frame only
 * turns the needles, slides the markers and swaps the lamps.
 *
 * - `dash`: a binnacle of real-looking dials (speedo with the gear in a window, TEMP, FUEL
 *   and a clock with the dark hours marked in red) and a ball compass like the stick-on
 *   ones on 1980s dashboards.
 * - `edge`: the speed and clock as plain figures, TEMP and FUEL as thin straight scales,
 *   and a compass tape, all along one edge of the screen.
 * - `kit`: chrome TEMP and FUEL gauges with the speed on a paper slip, and a brass card
 *   compass beside a field watch whose bezel marks the dark hours.
 *
 * Every style lights the same lamps, which only show while something is on or wrong.
 */
export class Instruments {
  /** The dials. */
  readonly cluster: HTMLElement;
  readonly compass: HTMLElement;
  /** Lamps live in the HUD's stack of short lines, next to the place name and warnings. */
  readonly lamps: HTMLElement;
  private style: HudStyle | null = null;
  private compact = false;
  private units: SpeedUnits = 'kmh';
  private speed: Needle | null = null;
  private speedText: Element | null = null;
  private temp: Needle | null = null;
  private fuel: Needle | null = null;
  private tempSlide: Slider | null = null;
  private fuelSlide: Slider | null = null;
  private hourHand: Needle | null = null;
  private minuteHand: Needle | null = null;
  private clockText: Element | null = null;
  private gearEl: Element | null = null;
  private fuelValue: Element | null = null;
  private clockNote: Element | null = null;
  private darkArc: SVGPathElement | null = null;
  private darkRadius = 44;
  private bezelText: SVGTextElement | null = null;
  /** The ball compass and the tape slide a band of marks; the field compass turns its card. */
  private band: SVGGElement | null = null;
  private card: Needle | null = null;
  private marks: SVGGElement | null = null;
  private compassWidth = 0;
  private compassScale = 1;
  /** Degrees either side of the heading the band shows. */
  private compassSpan = 50;
  private lastLamps = '';
  private lastMarks = '';
  private lastDark = '';
  private lastGear = '';
  private lastFuelText = '';
  private lastHot = '';
  private lastSpeed = '';
  private lastClock = '';

  constructor(root: HTMLElement, lampRoot: HTMLElement) {
    this.cluster = document.createElement('div');
    this.cluster.className = 'inst-cluster';
    this.cluster.setAttribute('role', 'group');
    this.cluster.setAttribute('aria-label', 'Instruments');
    this.compass = document.createElement('div');
    this.compass.className = 'inst-compass';
    this.lamps = document.createElement('div');
    this.lamps.className = 'inst-lamps';
    this.lamps.setAttribute('aria-live', 'polite');
    root.append(this.cluster, this.compass);
    lampRoot.prepend(this.lamps);
  }

  /** Build the instruments for a style, compact on a phone. Does nothing when unchanged. */
  setStyle(style: HudStyle, compact: boolean, units: SpeedUnits): void {
    if (style === this.style && compact === this.compact && units === this.units) return;
    this.style = style;
    this.compact = compact;
    this.units = units;
    this.lastDark = '';
    this.lastGear = '';
    this.lastFuelText = '';
    this.lastHot = '';
    this.lastMarks = '';
    this.lastSpeed = '';
    this.lastClock = '';
    this.speed = this.temp = this.fuel = this.hourHand = this.minuteHand = this.card = null;
    this.tempSlide = this.fuelSlide = null;
    this.speedText = this.clockText = this.gearEl = this.fuelValue = this.clockNote = null;
    this.darkArc = null;
    this.bezelText = null;
    this.band = this.marks = null;
    this.compass.innerHTML = '';
    this.cluster.dataset.style = style;
    this.compass.dataset.style = style;
    if (style === 'edge') this.buildEdge();
    else if (style === 'kit') this.buildKit();
    else this.buildDash();
  }

  /** An element in either part of the instruments. */
  private find<T extends Element>(sel: string): T | null {
    return this.cluster.querySelector<T>(sel) ?? this.compass.querySelector<T>(sel);
  }

  update(s: InstrumentState): void {
    const kmhMax = this.units === 'mph' ? 60 / 0.621371 : 100;
    turn(this.speed, sweep(s.speedKmh / kmhMax));
    if (this.speedText) {
      const v = String(Math.round(this.units === 'mph' ? s.speedKmh * 0.621371 : s.speedKmh));
      if (v !== this.lastSpeed) {
        this.lastSpeed = v;
        this.speedText.textContent = v;
      }
    }
    const gear =
      this.compact && this.style === 'dash' ? s.gear : `${s.gear} · ${s.range === 'low' ? 'LOW' : 'HIGH'}`;
    if (this.gearEl && gear !== this.lastGear) {
      this.lastGear = gear;
      this.gearEl.textContent = gear;
    }
    this.cluster.classList.toggle('no-engine', s.heat === null);
    if (s.heat !== null) {
      turn(this.temp, sweep(heatShare(s.heat)));
      slide(this.tempSlide, heatShare(s.heat));
    }
    if (s.fuel !== null) {
      const share = s.fuel / Math.max(1, s.tank);
      turn(this.fuel, sweep(share));
      slide(this.fuelSlide, share);
      const litres = `${Math.round(s.fuel)} L`;
      if (this.fuelValue && litres !== this.lastFuelText) {
        this.lastFuelText = litres;
        this.fuelValue.textContent = litres;
      }
    }
    const hot = `${s.heat !== null && s.heat >= damageTuning.engine.heatWarn}|${s.fuel !== null && s.fuel / Math.max(1, s.tank) < 0.15}`;
    if (hot !== this.lastHot) {
      this.lastHot = hot;
      const [h, f] = hot.split('|');
      this.find('.inst-temp')?.classList.toggle('hot', h === 'true');
      this.find('.inst-fuel')?.classList.toggle('hot', f === 'true');
    }
    this.drawClock(s);
    this.drawCompass(s);
    this.drawLamps(s.lamps);
  }

  private drawClock(s: InstrumentState): void {
    this.cluster.classList.toggle('no-clock', s.hour === null);
    this.compass.classList.toggle('no-clock', s.hour === null);
    if (s.hour === null) return;
    turn(this.hourHand, clockAngle(s.hour));
    turn(this.minuteHand, (((s.hour % 1) + 1) % 1) * 360);
    if (this.clockText) {
      const words = clockWords(s.hour);
      if (words !== this.lastClock) {
        this.lastClock = words;
        this.clockText.textContent = words;
      }
    }
    const late = s.darkHour !== null && s.hour >= s.darkHour;
    const key = `${s.darkHour}|${s.finishHour}|${late}`;
    if (key === this.lastDark) return;
    this.lastDark = key;
    const from = s.darkHour;
    const to = s.finishHour ?? (from !== null ? from + 1.75 : null);
    const a = from !== null ? clockAngle(from) : 0;
    const b = from !== null && to !== null ? a + ((to - from) / 12) * 360 : a;
    if (this.darkArc) {
      this.darkArc.setAttribute('d', from !== null && to !== null ? arc(50, 50, this.darkRadius, a, b) : '');
    }
    if (this.bezelText) {
      // The word sits in the middle of the red band, the right way up.
      const mid = (a + b) / 2;
      const p = pt(50, 50, this.darkRadius, mid);
      const upright = mid % 360 > 90 && mid % 360 < 270 ? mid - 180 : mid;
      this.bezelText.setAttribute('x', f2(p[0]));
      this.bezelText.setAttribute('y', f2(p[1]));
      this.bezelText.setAttribute('transform', `rotate(${upright.toFixed(1)} ${f2(p[0])} ${f2(p[1])})`);
      this.bezelText.textContent = from === null ? '' : 'DARK';
    }
    if (this.clockNote) {
      const finish = s.finishHour !== null ? shortClock(s.finishHour) : null;
      this.clockNote.textContent =
        from === null
          ? ''
          : this.style === 'dash'
            ? late && finish
              ? `BY ${finish}`
              : `DARK ${shortClock(from)}`
            : late && finish
              ? `finish by ${finish}`
              : this.style === 'kit' && finish
                ? `dark ${shortClock(from)} · finish by ${finish}`
                : `dark ${shortClock(from)}`;
      this.clockNote.classList.toggle('late', late);
    }
  }

  private drawCompass(s: InstrumentState): void {
    const heading = ((s.heading % 360) + 360) % 360;
    if (this.card) {
      // The card turns under the fixed mark; finds turn with it, at their bearings.
      turn(this.card, -heading);
      if (!this.marks) return;
      const key = s.pois.map((p) => `${p.id}:${Math.round(p.bearing)}`).join(',');
      if (key === this.lastMarks) return;
      this.lastMarks = key;
      this.marks.innerHTML = s.pois
        .map((p) => `<path d="M50,13 L53,19 L47,19 Z" transform="rotate(${Math.round(p.bearing)} 50 50)"/>`)
        .join('');
      return;
    }
    if (!this.band) return;
    const x = this.compassWidth / 2 - heading * this.compassScale;
    this.band.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
    if (!this.marks) return;
    const visible = s.pois
      .map((p) => ({ id: p.id, d: ((((p.bearing - heading + 180) % 360) + 360) % 360) - 180 }))
      .filter((p) => Math.abs(p.d) <= this.compassSpan);
    const key = visible.map((p) => `${p.id}:${Math.round(p.d)}`).join(',');
    if (key === this.lastMarks) return;
    this.lastMarks = key;
    const top = this.compact ? 3 : 4;
    this.marks.innerHTML = visible
      .map((p) => {
        const mx = this.compassWidth / 2 + p.d * this.compassScale;
        return this.style === 'edge'
          ? `<circle cx="${f2(mx)}" cy="16.5" r="2.6"/>`
          : `<path d="M${f2(mx - 3.5)},${top} L${f2(mx + 3.5)},${top} L${f2(mx)},${top + 5} Z"/>`;
      })
      .join('');
  }

  private drawLamps(lamps: readonly Lamp[]): void {
    const key = lamps.map((l) => `${l.id}|${l.text}|${l.tone}|${l.blink ? 1 : 0}`).join('#');
    if (key === this.lastLamps) return;
    this.lastLamps = key;
    this.lamps.replaceChildren(
      ...lamps.map((l) => {
        const el = document.createElement('span');
        el.className = `lamp ${l.tone}${l.blink ? ' blink' : ''}`;
        el.dataset.lamp = l.id;
        el.textContent = l.text;
        if (l.title) el.title = l.title;
        return el;
      }),
    );
  }

  // --- The dash cluster ----------------------------------------------------------------

  private buildDash(): void {
    const size = this.compact ? DIAL_PX.compact : DIAL_PX.full;
    this.cluster.innerHTML = `
      <div class="inst-speedo">${this.speedoSvg(size.speedo)}</div>
      <div class="inst-dial inst-temp">${dialSvg('TEMP', 'C', 'H', [damageTuning.engine.heatWarn / 1.2, 1], size.dial, false)}</div>
      <div class="inst-dial inst-fuel">${dialSvg('FUEL', 'E', 'F', [0, 0.15], size.dial, !this.compact)}</div>
      <div class="inst-dial inst-clock">${clockSvg(size.dial, !this.compact)}</div>`;
    const needle = (sel: string, cx: number, cy: number): Needle | null => {
      const el = this.cluster.querySelector<SVGGElement>(sel);
      return el ? { el, cx, cy, last: '' } : null;
    };
    this.speed = needle('.inst-speedo .needle', 50, 50);
    this.temp = needle('.inst-temp .needle', 50, 52);
    this.fuel = needle('.inst-fuel .needle', 50, 52);
    this.hourHand = needle('.inst-clock .hand-hour', 50, 50);
    this.minuteHand = needle('.inst-clock .hand-minute', 50, 50);
    this.gearEl = this.cluster.querySelector('.inst-speedo .gear');
    this.fuelValue = this.cluster.querySelector('.inst-fuel .value');
    this.clockNote = this.cluster.querySelector('.inst-clock .value');
    this.darkArc = this.cluster.querySelector('.inst-clock .dark');
    this.darkRadius = 44;
    this.compass.innerHTML = this.ballSvg();
    this.compassSpan = 50;
    this.band = this.compass.querySelector('.band');
    this.marks = this.compass.querySelector('.marks');
  }

  // --- Edge lines ------------------------------------------------------------------------

  private buildEdge(): void {
    const px = this.compact ? EDGE_PX.compact : EDGE_PX.full;
    const unit = this.units === 'mph' ? 'mph' : 'km/h';
    this.cluster.innerHTML = `
      <span class="inst-group inst-speed"><span class="inst-figure"><b class="v">0</b> ${unit}</span><span class="gear"></span></span>
      <span class="inst-group inst-scales">
        <span class="inst-scale inst-temp"><span class="label">TEMP</span>${scaleSvg('C', 'H', [damageTuning.engine.heatWarn / 1.2, 1], px.scale)}</span>
        <span class="inst-scale inst-fuel"><span class="label">FUEL</span>${scaleSvg('E', 'F', [0, 0.15], px.scale)}<span class="value"></span></span>
      </span>
      <span class="inst-group inst-clock"><span class="time"></span><small class="value"></small></span>`;
    const slider = (sel: string): Slider | null => {
      const el = this.cluster.querySelector<SVGGraphicsElement>(`${sel} .mark`);
      return el ? { el, x0: 14, x1: px.scale - 14, last: '' } : null;
    };
    this.speedText = this.cluster.querySelector('.inst-figure .v');
    this.gearEl = this.cluster.querySelector('.inst-speed .gear');
    this.tempSlide = slider('.inst-temp');
    this.fuelSlide = slider('.inst-fuel');
    this.fuelValue = this.cluster.querySelector('.inst-fuel .value');
    this.clockText = this.cluster.querySelector('.inst-clock .time');
    this.clockNote = this.cluster.querySelector('.inst-clock .value');
    this.compass.innerHTML = this.tapeSvg(px.tape);
    this.compassSpan = 75;
    this.band = this.compass.querySelector('.band');
    this.marks = this.compass.querySelector('.marks');
  }

  /** A compass tape: 150° of heading across the top edge, the lubber mark underneath. */
  private tapeSvg(w: number): string {
    const h = 24;
    const k = w / 150;
    this.compassWidth = w;
    this.compassScale = k;
    const names: Record<number, string> = {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SW',
      270: 'W',
      315: 'NW',
    };
    let band = '';
    for (let b = -180; b <= 540; b += 5) {
      const nb = ((b % 360) + 360) % 360;
      const x = f2(b * k);
      const name = names[nb];
      band += `<line x1="${x}" y1="20" x2="${x}" y2="${name ? 13 : nb % 15 === 0 ? 15 : 17}"/>`;
      if (name)
        band += `<text x="${x}" y="10" text-anchor="middle" class="${name.length === 1 ? 'cmaj' : 'cmin'}">${name}</text>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Compass">
      <g class="band">${band}</g><g class="marks"></g>
      <path class="lubber" d="M${w / 2 - 4.5},${h} L${w / 2 + 4.5},${h} L${w / 2},${h - 6} Z"/>
    </svg>`;
  }

  // --- Field kit -------------------------------------------------------------------------

  private buildKit(): void {
    const px = this.compact ? KIT_PX.compact : KIT_PX.full;
    const unit = this.units === 'mph' ? 'mph' : 'km/h';
    this.cluster.innerHTML = `
      <span class="inst-slip"><b class="v">0</b> ${unit} · <span class="gear"></span></span>
      <div class="inst-pair">
        <div class="inst-dial inst-temp">${chromeSvg('TEMP', [damageTuning.engine.heatWarn / 1.2, 1], px.gauge, false, 't')}</div>
        <div class="inst-dial inst-fuel">${chromeSvg('FUEL', [0, 0.15], px.gauge, !this.compact, 'f')}</div>
      </div>`;
    this.compass.innerHTML = `
      <div class="inst-pair">
        <div class="inst-brass">${brassSvg(px.brass)}</div>
        <div class="inst-dial inst-clock">${watchSvg(px.watch, !this.compact)}</div>
      </div>
      <span class="inst-slip inst-clocknote value"></span>`;
    const needle = (sel: string, cx: number, cy: number): Needle | null => {
      const el = this.find<SVGGElement>(sel);
      return el ? { el, cx, cy, last: '' } : null;
    };
    this.speedText = this.cluster.querySelector('.inst-slip .v');
    this.gearEl = this.cluster.querySelector('.inst-slip .gear');
    this.temp = needle('.inst-temp .needle', 50, 54);
    this.fuel = needle('.inst-fuel .needle', 50, 54);
    this.fuelValue = this.cluster.querySelector('.inst-fuel .value');
    this.hourHand = needle('.inst-clock .hand-hour', 50, 50);
    this.minuteHand = needle('.inst-clock .hand-minute', 50, 50);
    this.darkArc = this.compass.querySelector('.inst-clock .dark');
    this.darkRadius = 42.5;
    this.bezelText = this.compass.querySelector('.inst-clock .bezel');
    this.clockNote = this.compass.querySelector('.inst-clocknote');
    this.card = needle('.inst-brass .card', 50, 50);
    this.marks = this.compass.querySelector('.inst-brass .marks');
  }

  /** Speedometer: 0–100 km/h (or 0–60 mph), the gear in a window under the hub. */
  private speedoSvg(px: number): string {
    const mph = this.units === 'mph';
    const max = mph ? 60 : 100;
    const minor = mph ? 5 : 10;
    const major = mph ? 10 : 20;
    const every = this.compact ? major * 2 : major;
    const numberSize = fz(8.5, px);
    let ticks = '';
    let numbers = '';
    for (let v = 0; v <= max; v += minor) {
      const d = sweep(v / max);
      const big = v % major === 0;
      ticks += line(pt(50, 50, big ? 36 : 39, d), pt(50, 50, 44, d), big ? 2.4 : 1.2);
      if (v % every === 0) {
        const n = pt(50, 50, this.compact ? 24 : 27, d);
        numbers += text(n[0], n[1] + Number(numberSize) * 0.36, 'num', numberSize, String(v));
      }
    }
    const gearSize = fz(9.5, px, 11);
    const w = this.compact ? 24 : 46;
    const y = this.compact ? 60 : 68;
    const h = this.compact ? 18 : 15;
    return `<svg viewBox="0 0 100 100" role="img" aria-label="Speedometer">
      <circle class="face" cx="50" cy="50" r="48"/>
      <g class="ticks">${ticks}</g>${numbers}
      <rect class="window" x="${50 - w / 2}" y="${y}" width="${w}" height="${h}" rx="2"/>
      <text class="gear" x="50" y="${f2(y + h / 2 + Number(gearSize) * 0.36)}" text-anchor="middle" style="font-size:${gearSize}px"></text>
      ${this.compact ? '' : text(50, 94, 'label', fz(8.5, px, 9), mph ? 'mph' : 'km/h')}
      <g class="needle"><line x1="50" y1="59" x2="50" y2="9" stroke-width="3" stroke-linecap="round"/></g>
      <circle class="hub" cx="50" cy="50" r="6"/>
    </svg>`;
  }

  /** A ball compass: the card seen through a curved window, the lubber line in the middle. */
  private ballSvg(): string {
    const w = this.compact ? 112 : 160;
    const h = this.compact ? 30 : 40;
    const k = w / 110;
    this.compassWidth = w;
    this.compassScale = k;
    let band = '';
    for (let b = -180; b <= 540; b += 5) {
      const nb = ((b % 360) + 360) % 360;
      const x = b * k;
      const big = nb % 30 === 0;
      band += `<line x1="${f2(x)}" y1="${h - 4}" x2="${f2(x)}" y2="${h - (big ? 11 : 7)}" stroke-width="${big ? 1.6 : 1}"/>`;
      const letter = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[nb];
      if (letter)
        band += `<text x="${f2(x)}" y="${h - 14}" text-anchor="middle" class="cmaj">${letter}</text>`;
      else if (big && !this.compact)
        band += `<text x="${f2(x)}" y="${h - 14}" text-anchor="middle" class="cmin">${nb / 10}</text>`;
    }
    const r = h / 2 - 1;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Compass">
      <defs>
        <radialGradient id="inst-ball" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#2b2a27"/><stop offset="1" stop-color="#090908"/></radialGradient>
        <linearGradient id="inst-fade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".9"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".9"/></linearGradient>
        <clipPath id="inst-window"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r}"/></clipPath>
      </defs>
      <rect class="ball" x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r}" fill="url(#inst-ball)"/>
      <g clip-path="url(#inst-window)"><g class="band">${band}</g><g class="marks"></g></g>
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r}" fill="url(#inst-fade)"/>
      <rect class="rim" x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r}" fill="none"/>
      <line class="lubber" x1="${w / 2}" y1="3" x2="${w / 2}" y2="${h - 3}"/>
    </svg>`;
  }
}

/** TEMP or FUEL: a small round gauge with a red band, its ends lettered. */
function dialSvg(
  label: string,
  from: string,
  to: string,
  danger: [number, number],
  px: number,
  withValue: boolean,
): string {
  let ticks = '';
  for (let i = 0; i <= 8; i++) {
    const d = sweep(i / 8);
    ticks += line(pt(50, 52, i % 2 ? 37 : 34, d), pt(50, 52, 42, d), i % 2 ? 1.6 : 2.6);
  }
  // The label sits under the hub, clear of the needle; small dials leave out the end letters.
  const compact = px < 60;
  const labelSize = fz(9, px);
  const endSize = fz(9, px);
  // The end letters sit out at the ends of the sweep, clear of the label under the hub.
  const e1 = pt(50, 52, 27, -120);
  const e2 = pt(50, 52, 27, 120);
  const valueSize = fz(11, px, 10.5);
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${label}">
    <circle class="face" cx="50" cy="52" r="47"/>
    <path class="danger" d="${arc(50, 52, 40, sweep(danger[0]), sweep(danger[1]))}"/>
    <g class="ticks">${ticks}</g>
    ${text(50, compact ? 82 : 75, 'label', labelSize, label)}
    ${compact ? '' : text(e1[0], e1[1] + Number(endSize) * 0.36, 'end', endSize, from)}
    ${compact ? '' : text(e2[0], e2[1] + Number(endSize) * 0.36, 'end', endSize, to)}
    ${withValue ? `<text class="value" x="50" y="89" text-anchor="middle" style="font-size:${valueSize}px"></text>` : ''}
    <g class="needle"><line x1="50" y1="60" x2="50" y2="14" stroke-width="3" stroke-linecap="round"/></g>
    <circle class="hub" cx="50" cy="52" r="5"/>
  </svg>`;
}

/** A dash clock: the dark hours marked in red on the rim. */
function clockSvg(px: number, withNote: boolean): string {
  let ticks = '';
  for (let i = 0; i < 12; i++)
    ticks += line(pt(50, 50, i % 3 ? 38 : 34, i * 30), pt(50, 50, 43, i * 30), i % 3 ? 1.4 : 2.6);
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Clock">
    <circle class="face" cx="50" cy="50" r="47"/>
    <path class="dark" d=""/>
    <g class="ticks">${ticks}</g>
    ${withNote ? `<text class="value red" x="50" y="76" text-anchor="middle" style="font-size:${fz(8.5, px, 9)}px"></text>` : ''}
    <g class="hand hand-hour"><line x1="50" y1="50" x2="50" y2="28" stroke-width="4" stroke-linecap="round"/></g>
    <g class="hand hand-minute"><line x1="50" y1="50" x2="50" y2="16" stroke-width="2.4" stroke-linecap="round"/></g>
    <circle class="pin" cx="50" cy="50" r="3.5"/>
  </svg>`;
}

/** The edge style's straight scale: end letters, a red band and a sliding marker. */
function scaleSvg(from: string, to: string, danger: [number, number], w: number): string {
  const x0 = 14;
  const x1 = w - 14;
  const y = 13;
  const dx = (share: number) => f2(x0 + (x1 - x0) * share);
  let ticks = '';
  for (let i = 0; i <= 4; i++) ticks += `<line x1="${dx(i / 4)}" y1="${y - 3}" x2="${dx(i / 4)}" y2="${y}"/>`;
  return `<svg viewBox="0 0 ${w} 20" width="${w}" height="20" aria-hidden="true">
    <text x="2" y="17" class="end">${from}</text><text x="${w - 2}" y="17" text-anchor="end" class="end">${to}</text>
    <line class="base" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>
    <line class="danger" x1="${dx(danger[0])}" y1="${y}" x2="${dx(danger[1])}" y2="${y}"/>
    <g class="ticks">${ticks}</g>
    <path class="mark" d="M-4.5,20 L4.5,20 L0,12 Z" transform="translate(${x0} 0)"/>
  </svg>`;
}

/** The field kit's chrome-ringed gauge: the red band shows the bad end, so no end letters. */
function chromeSvg(
  label: string,
  danger: [number, number],
  px: number,
  withValue: boolean,
  id: string,
): string {
  let ticks = '';
  for (let i = 0; i <= 8; i++) {
    const d = sweep(i / 8);
    ticks += line(pt(50, 54, i % 2 ? 33 : 30, d), pt(50, 54, 38, d), i % 2 ? 1.4 : 2.4);
  }
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${label}">
    <defs><linearGradient id="inst-chrome-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f2ec"/><stop offset=".5" stop-color="#9a978f"/><stop offset="1" stop-color="#e2ded4"/></linearGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#inst-chrome-${id})"/>
    <circle class="face" cx="50" cy="50" r="42.5"/>
    <path class="danger" d="${arc(50, 54, 36, sweep(danger[0]), sweep(danger[1]))}"/>
    <g class="ticks">${ticks}</g>
    ${text(50, withValue ? 77 : 80, 'label', fz(8.5, px), label)}
    ${withValue ? `<text class="value" x="50" y="89" text-anchor="middle" style="font-size:${fz(10, px)}px"></text>` : ''}
    <g class="needle"><line x1="50" y1="61" x2="50" y2="19" stroke-width="2.6" stroke-linecap="round"/></g>
    <circle class="hub" cx="50" cy="54" r="4.5"/>
  </svg>`;
}

/** A brass card compass: the card turns under the fixed mark at the top. */
function brassSvg(px: number): string {
  let card = '';
  for (let i = 0; i < 72; i++) {
    const a = i * 5;
    const big = a % 45 === 0;
    card += line(pt(50, 50, big ? 29 : 32, a), pt(50, 50, 35, a), big ? 1.8 : 0.7);
  }
  const size = fz(9, px);
  const letters = (
    [
      ['N', 0],
      ['E', 90],
      ['S', 180],
      ['W', 270],
    ] as const
  )
    .map(([l, a]) => {
      const p = pt(50, 50, 22, a);
      return `<text x="${f2(p[0])}" y="${f2(p[1] + Number(size) * 0.36)}" text-anchor="middle" class="cl${l === 'N' ? ' n' : ''}" style="font-size:${size}px" transform="rotate(${a} ${f2(p[0])} ${f2(p[1])})">${l}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Compass">
    <defs><linearGradient id="inst-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8c977"/><stop offset=".55" stop-color="#9c7526"/><stop offset="1" stop-color="#d9b25c"/></linearGradient></defs>
    <circle cx="50" cy="50" r="49" fill="url(#inst-brass)"/>
    <circle class="face" cx="50" cy="50" r="40"/>
    <g class="card"><g class="ticks">${card}</g>${letters}
      <path class="north" d="M50,38 L53,50 L50,52 L47,50 Z"/><path class="south" d="M50,62 L53,50 L50,48 L47,50 Z"/>
      <g class="marks"></g></g>
    <path class="lubber" d="M50,3 L54,10 L46,10 Z"/>
    <circle class="pin" cx="50" cy="50" r="2.6"/>
  </svg>`;
}

/** A field watch: a red band on the bezel marks the dark hours (labelled on big watches). */
function watchSvg(px: number, labelled: boolean): string {
  let marks = '';
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    marks += line(pt(50, 50, big ? 30 : 33, i * 6), pt(50, 50, 35, i * 6), big ? 2.2 : 0.8);
  }
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Watch">
    <circle class="case" cx="50" cy="50" r="49"/>
    <circle class="bezel-ring" cx="50" cy="50" r="47"/>
    <path class="dark" d=""/>
    ${labelled ? `<text class="bezel" text-anchor="middle" dominant-baseline="central" style="font-size:${fz(6.5, px, 7)}px"></text>` : ''}
    <circle class="face" cx="50" cy="50" r="37.5"/>
    <g class="ticks">${marks}</g>
    <g class="hand hand-hour"><line x1="50" y1="50" x2="50" y2="32" stroke-width="4.5" stroke-linecap="round"/></g>
    <g class="hand hand-minute"><line x1="50" y1="50" x2="50" y2="22" stroke-width="2.8" stroke-linecap="round"/></g>
    <circle class="pin" cx="50" cy="50" r="3"/>
  </svg>`;
}
