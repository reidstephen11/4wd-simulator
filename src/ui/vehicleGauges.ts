import { damageTuning } from '../data/damage';
import type { TyreFault } from '../sim/vehicle/condition';

export interface TyreGaugeState {
  /** Air remaining relative to the selected road/trail setting. */
  inflation: number;
  psi?: number;
  fault: TyreFault;
  front: boolean;
  left: boolean;
}

export interface VehicleGaugeState {
  fuel: number;
  tank: number;
  /** Normal running is about 0.5; damage begins above 1. */
  heat: number;
  lowPressure: boolean;
  pressurePsi?: number;
  tyres: readonly TyreGaugeState[];
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Share of the temperature dial; the hot threshold sits at the start of its red band. */
export const temperatureShare = (heat: number): number => clamp(heat / 1.2);

export function temperatureLabel(heat: number): string {
  return heat >= 1 ? 'HOT' : heat >= damageTuning.engine.heatWarn ? 'HIGH' : heat < 0.3 ? 'COLD' : 'NORMAL';
}

export function tyreLabel(tyre: TyreGaugeState): string {
  if (tyre.psi !== undefined) return `${Math.round(tyre.psi)} psi`;
  if (tyre.inflation <= 0.05) return 'FLAT';
  if (tyre.fault !== 'none') return 'LEAK';
  return `${Math.round(clamp(tyre.inflation) * 100)}%`;
}

/** Full dials on a phone when the engine is hot, fuel is low, or a tyre is hurt. */
export function instrumentsNeedDetail(s: VehicleGaugeState): boolean {
  if (s.heat >= damageTuning.engine.heatWarn) return true;
  if (s.fuel / Math.max(1, s.tank) < 0.15) return true;
  return s.tyres.some((t) => t.fault !== 'none' || t.inflation < 0.97);
}

function point(share: number, radius: number): string {
  const a = ((-120 + clamp(share) * 240) * Math.PI) / 180;
  return `${(50 + Math.sin(a) * radius).toFixed(2)},${(47 - Math.cos(a) * radius).toFixed(2)}`;
}

function arc(from: number, to: number): string {
  return `M${point(from, 35)} A35,35 0 ${to - from > 0.75 ? 1 : 0},1 ${point(to, 35)}`;
}

function dial(kind: 'temp' | 'fuel', label: string, from: string, to: string): string {
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const share = i / 8;
    return `<path d="M${point(share, i % 2 === 0 ? 27 : 30)} L${point(share, 33)}"/>`;
  }).join('');
  const warning = kind === 'temp' ? arc(temperatureShare(damageTuning.engine.heatWarn), 1) : arc(0, 0.15);
  return `<div class="vehicle-dial ${kind === 'temp' ? 'engine-temp' : 'status-fuel'}" data-dial="${kind}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${kind === 'temp' ? '1.2' : '100'}">
    <svg class="dial-face" viewBox="0 0 100 92" aria-hidden="true">
      <circle class="dial-bezel" cx="50" cy="47" r="44"/>
      <path class="dial-track" d="${arc(0, 1)}"/>
      <path class="dial-danger" d="${warning}"/>
      <g class="dial-ticks">${ticks}</g>
      <text class="dial-title" x="50" y="33">${label}</text>
      <g class="dial-needle"><path d="M50,55 L50,18"/><circle cx="50" cy="47" r="3.5"/></g>
      <text class="dial-end" x="21" y="73">${from}</text><text class="dial-end" x="79" y="73">${to}</text>
    </svg>
    <strong class="dial-value${kind === 'fuel' ? ' fuel-litres' : ''}"></strong>
  </div>`;
}

/** Always-visible vehicle instruments, separate from the optional crawl inclinometers. */
export class VehicleGauges {
  readonly el: HTMLElement;
  private readonly temp: HTMLElement;
  private readonly fuel: HTMLElement;
  private readonly pressure: HTMLElement;
  private readonly wheels: HTMLElement[];
  private readonly strip: HTMLButtonElement;
  private lastKey = '';
  private userOpen = false;
  private warn = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'vehicle-gauges';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Vehicle instruments');
    this.el.innerHTML = `<button type="button" class="vehicle-strip" aria-expanded="false" aria-label="Vehicle instruments, tap for dials">
        <span class="strip-heat">NORMAL</span>
        <span class="strip-fuel"></span>
        <span class="strip-mode">ROAD</span>
        <span class="strip-tyres" aria-hidden="true">${['FL', 'FR', 'RL', 'RR'].map((c) => `<i data-corner="${c}"></i>`).join('')}</span>
        <span class="strip-clock"></span>
      </button>
      ${dial('temp', 'TEMP', 'C', 'H')}${dial('fuel', 'FUEL', 'E', 'F')}
      <div class="tyre-panel">
        <div class="tyre-heading">TYRES <span class="tyre-mode"></span></div>
        <div class="tyre-layout">
          <svg class="tyre-chassis" viewBox="0 0 32 56" aria-hidden="true"><path d="M8,3 Q16,0 24,3 L26,45 Q26,52 22,53 L10,53 Q6,52 6,45 Z M8,15 L24,15 M7,38 L25,38 M16,16 L16,37"/><path class="tyre-windscreen" d="M10,7 L22,7 L23,13 L9,13 Z"/></svg>
          ${['FL', 'FR', 'RL', 'RR'].map((label) => `<div class="tyre-gauge" data-corner="${label}" role="meter" aria-valuemin="0" aria-valuemax="100"><span class="tyre-corner">${label}</span><span class="tyre-air"><span></span></span><strong class="tyre-value"></strong></div>`).join('')}
        </div>
        <span class="tyre-caption">TYRE PRESSURE</span>
      </div>`;
    root.appendChild(this.el);
    this.strip = this.el.querySelector('.vehicle-strip')!;
    this.temp = this.el.querySelector('[data-dial="temp"]')!;
    this.fuel = this.el.querySelector('[data-dial="fuel"]')!;
    this.pressure = this.el.querySelector('.tyre-mode')!;
    this.wheels = [...this.el.querySelectorAll<HTMLElement>('.tyre-gauge')];
  }

  /** Phone compact strip: tap to open the dials (a warning keeps them open). */
  toggleOpen(): void {
    if (this.warn) return;
    this.userOpen = !this.userOpen;
    this.syncOpen();
  }

  setClock(text: string): void {
    const el = this.strip.querySelector('.strip-clock')!;
    if (el.textContent !== text) el.textContent = text;
  }

  update(s: VehicleGaugeState): void {
    const heat = temperatureLabel(s.heat);
    const fuel = clamp(s.fuel / Math.max(1, s.tank));
    const key = `${s.heat.toFixed(2)}|${heat}|${s.fuel.toFixed(1)}|${fuel < 0.15}|${s.tank}|${s.lowPressure}|${s.pressurePsi}|${s.tyres.map((t) => `${t.front},${t.left},${t.inflation.toFixed(2)},${t.fault},${tyreLabel(t)}`).join('|')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const heatText = `Engine temperature: ${heat.toLowerCase()}${s.heat >= 1 ? ' — ease off and let it cool' : ''}`;
    this.updateDial(this.temp, temperatureShare(s.heat), heat, Math.min(1.2, Math.max(0, s.heat)), heatText);
    this.temp.classList.toggle('hot', s.heat >= damageTuning.engine.heatWarn);
    this.temp.classList.toggle('critical', s.heat >= 1);
    this.fuel.setAttribute('aria-valuemax', String(s.tank));
    this.updateDial(
      this.fuel,
      fuel,
      `${Math.round(s.fuel)} L`,
      Math.max(0, s.fuel),
      `Fuel: ${s.fuel.toFixed(1)} of ${s.tank} L${fuel < 0.15 ? ' — low fuel' : ''}`,
    );
    this.fuel.classList.toggle('low', fuel < 0.15);
    this.pressure.textContent =
      s.pressurePsi === undefined ? (s.lowPressure ? 'TRAIL' : 'ROAD') : `${s.pressurePsi} psi`;
    this.pressure.classList.toggle('trail', s.lowPressure);
    const heatEl = this.strip.querySelector('.strip-heat')!;
    heatEl.textContent = heat;
    heatEl.classList.toggle('hot', s.heat >= damageTuning.engine.heatWarn);
    heatEl.classList.toggle('critical', s.heat >= 1);
    const fuelEl = this.strip.querySelector('.strip-fuel')!;
    fuelEl.textContent = `${Math.round(s.fuel)} L`;
    fuelEl.classList.toggle('low', fuel < 0.15);
    this.strip.querySelector('.strip-mode')!.textContent = this.pressure.textContent;
    for (const pip of this.strip.querySelectorAll<HTMLElement>('.strip-tyres i')) {
      const corner = pip.dataset.corner!;
      const tyre = s.tyres.find((t) => t.front === (corner[0] === 'F') && t.left === (corner[1] === 'L'));
      pip.classList.toggle('leak', !!tyre && (tyre.fault !== 'none' || tyre.inflation < 0.97));
      pip.classList.toggle('flat', !!tyre && tyre.inflation <= 0.05);
    }
    this.warn = instrumentsNeedDetail(s);
    this.el.classList.toggle('warn', this.warn);
    this.syncOpen();
    this.pressure.title =
      'Choose 18 psi for rock and mud, 24 psi for trails or 36 psi for the road from Tools → Tyres.';
    for (const el of this.wheels) {
      const corner = el.dataset.corner!;
      const front = corner[0] === 'F';
      const left = corner[1] === 'L';
      const tyre = s.tyres.find((t) => t.front === front && t.left === left);
      el.hidden = !tyre;
      if (!tyre) continue;
      const percent = Math.round(clamp(tyre.inflation) * 100);
      const fault =
        tyre.fault === 'sidewall' ? 'torn sidewall' : tyre.fault === 'rim' ? 'off the rim' : 'puncture';
      const label = `${front ? 'Front' : 'Rear'} ${left ? 'left' : 'right'} tyre`;
      const text = `${tyre.psi === undefined ? `${percent}% air remaining` : `${tyre.psi.toFixed(1)} psi`}${tyre.fault !== 'none' ? `, ${fault}` : ''}`;
      el.setAttribute('aria-label', label);
      el.setAttribute('aria-valuemax', String(tyre.psi === undefined ? 100 : 36));
      el.setAttribute('aria-valuenow', String(tyre.psi ?? percent));
      el.setAttribute('aria-valuetext', text);
      el.title = `${label}: ${text}`;
      el.classList.toggle('leaking', tyre.fault !== 'none' || percent < 97);
      el.classList.toggle('flat', tyre.inflation <= 0.05);
      el.querySelector('.tyre-value')!.textContent = tyreLabel(tyre);
      (el.querySelector('.tyre-air span') as HTMLElement).style.height = `${percent}%`;
    }
  }

  private syncOpen(): void {
    const open = this.userOpen || this.warn;
    this.el.classList.toggle('open', open);
    this.strip.setAttribute('aria-expanded', String(open));
  }

  private updateDial(
    el: HTMLElement,
    share: number,
    value: string,
    current: number,
    description: string,
  ): void {
    (el.querySelector('.dial-needle') as SVGElement).style.transform = `rotate(${-120 + share * 240}deg)`;
    el.querySelector('.dial-value')!.textContent = value;
    el.setAttribute('aria-valuenow', String(current));
    el.setAttribute('aria-valuetext', description);
    el.title = description;
  }
}
