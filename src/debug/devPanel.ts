import type { TrailerTuning } from '../data/trailers';
import { clockTime } from '../data/episodes';
import { devWeatherPresets, type DevWeather } from '../data/devWeather';
import type { VehicleId } from '../data/vehicle';
import { vehicleOrder, vehicles } from '../data/vehicles';
import type { PoiDef } from '../sim/world/mapTypes';

interface DevSlider {
  key: 'rain' | 'wetness' | 'creekRise';
  label: string;
  max: number;
  step: number;
  show: (v: number) => string;
}

/**
 * Test mode's panel (`?dev`): set the clock and the weather by hand, jump to any place
 * on the map and change vehicle on the spot. Plain words for the owner testing the game.
 */
export class DevPanel {
  readonly panel: HTMLElement;
  /** The weather set by hand (null: the episode's own). */
  private weather: DevWeather | null = null;
  private clockStopped = false;
  /** Each weather slider's readout. */
  private readonly shows = new Map<DevSlider['key'], (v: number) => string>();

  constructor(
    root: HTMLElement,
    pois: readonly PoiDef[],
    /** Highest river rise the banks are ready for (m). */
    private readonly maxRise: number,
    private readonly actions: {
      hour: () => number;
      setHour: (hour: number) => void;
      stopClock: (stopped: boolean) => void;
      setWeather: (w: DevWeather | null) => void;
      teleport: (poi: PoiDef) => void;
      vehicle: (id: VehicleId) => void;
      mainMenu: () => void;
      /** Hitch a trailer with this many drums of diesel, or take it away (null). */
      trailer: (drums: number | null, kind?: TrailerTuning['id']) => void;
    },
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel dev-panel';
    this.panel.innerHTML = `<details open><summary>Test mode</summary>
      <h3>Clock</h3>
      <label class="dev-slider"><span>Time <b data-out="hour"></b></span><input type="range" data-in="hour" min="6" max="20" step="0.25"></label>
      <div class="debug-row"><button data-act="stop">Stop the clock</button></div>
      <h3>Weather</h3>
      <div class="debug-row"><button data-preset="story">Episode's own</button>${devWeatherPresets
        .map((p, i) => `<button data-preset="${i}">${p.label}</button>`)
        .join('')}</div>
      <div class="dev-sliders"></div>
      <p class="dev-note">Puddles on the track are set when the episode loads: to drive through them, pick rain under Conditions on the welcome screen.</p>
      <h3>Start from</h3>
      <div class="debug-teleports"></div>
      <h3>Vehicle</h3>
      <div class="debug-row">${vehicleOrder.map((id) => `<button data-vehicle="${id}">${vehicles[id].tuning.name}</button>`).join('')}</div>
      <h3>Trailer</h3>
      <div class="debug-row"><button data-trailer="0">Box trailer, empty</button><button data-trailer="2">With two drums of diesel</button><button data-trailer="none">No trailer</button></div>
      <div class="debug-row"><button data-trailer="0" data-kind="no5">Army No. 5, empty</button><button data-trailer="2" data-kind="no5">No. 5 with two drums</button></div>
      <div class="debug-row"><button data-act="menu">Change episode</button></div>
    </details>`;
    root.appendChild(this.panel);

    const hourIn = this.input('hour');
    hourIn.addEventListener('input', () => {
      actions.setHour(Number(hourIn.value));
      this.refresh();
    });
    const stop = this.panel.querySelector('[data-act="stop"]') as HTMLButtonElement;
    stop.addEventListener('click', () => {
      this.clockStopped = !this.clockStopped;
      actions.stopClock(this.clockStopped);
      this.refresh();
    });
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-preset]'))
      b.addEventListener('click', () => {
        const p = b.dataset.preset;
        this.setWeather(p === 'story' ? null : { ...devWeatherPresets[Number(p)].weather });
      });
    this.buildSliders(this.panel.querySelector('.dev-sliders') as HTMLElement);
    const tp = this.panel.querySelector('.debug-teleports') as HTMLElement;
    for (const p of pois) {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.addEventListener('click', () => actions.teleport(p));
      tp.appendChild(b);
    }
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-vehicle]'))
      b.addEventListener('click', () => actions.vehicle(b.dataset.vehicle as VehicleId));
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-trailer]'))
      b.addEventListener('click', () =>
        actions.trailer(
          b.dataset.trailer === 'none' ? null : Number(b.dataset.trailer),
          (b.dataset.kind as TrailerTuning['id'] | undefined) ?? 'box6x4',
        ),
      );
    this.panel.querySelector('[data-act="menu"]')?.addEventListener('click', () => actions.mainMenu());
    // Keys pressed on the panel don't drive the car, and a click hands the keys back to driving.
    this.panel.addEventListener('keydown', (e) => e.stopPropagation());
    this.panel.addEventListener('change', (e) => (e.target as HTMLElement).blur());
    this.panel.addEventListener('click', (e) => (e.target as HTMLElement).closest('button')?.blur());
    this.refresh();
  }

  private input(key: string): HTMLInputElement {
    return this.panel.querySelector(`[data-in="${key}"]`) as HTMLInputElement;
  }

  private buildSliders(el: HTMLElement): void {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const defs: DevSlider[] = [
      { key: 'rain', label: 'Rain', max: 1, step: 0.05, show: pct },
      { key: 'wetness', label: 'Wet ground', max: 1, step: 0.05, show: pct },
      {
        key: 'creekRise',
        label: 'Rivers up',
        max: this.maxRise,
        step: 0.05,
        show: (v) => `${v.toFixed(2)} m`,
      },
    ];
    for (const d of defs) {
      const row = document.createElement('label');
      row.className = 'dev-slider';
      row.innerHTML = `<span>${d.label} <b data-out="${d.key}"></b></span><input type="range" data-in="${d.key}" min="0" max="${d.max}" step="${d.step}">`;
      el.appendChild(row);
      const input = row.querySelector('input') as HTMLInputElement;
      input.addEventListener('input', () => {
        // Moving a slider from the episode's own weather starts from cloud and the slider's value.
        const w: DevWeather = this.weather ?? { ...devWeatherPresets[1].weather };
        w[d.key] = Number(input.value);
        if (d.key === 'rain' && w.rain > 0) w.cloud = true;
        this.setWeather(w);
      });
      this.shows.set(d.key, d.show);
    }
  }

  private setWeather(w: DevWeather | null): void {
    this.weather = w;
    this.actions.setWeather(w);
    this.refresh();
  }

  /** Show the clock, the weather and which buttons are on. */
  refresh(): void {
    const hour = this.actions.hour();
    this.input('hour').value = String(hour);
    (this.panel.querySelector('[data-out="hour"]') as HTMLElement).textContent = clockTime(hour);
    const stop = this.panel.querySelector('[data-act="stop"]') as HTMLButtonElement;
    stop.classList.toggle('on', this.clockStopped);
    stop.textContent = this.clockStopped ? 'Clock stopped' : 'Stop the clock';
    const w = this.weather;
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
      const p = b.dataset.preset;
      const preset = p === 'story' ? null : devWeatherPresets[Number(p)].weather;
      const on = preset === null ? w === null : w !== null && sameWeather(w, preset);
      b.classList.toggle('on', on);
    }
    for (const [key, show] of this.shows) {
      const v = w ? w[key] : 0;
      this.input(key).value = String(v);
      (this.panel.querySelector(`[data-out="${key}"]`) as HTMLElement).textContent = w
        ? show(v)
        : '(episode)';
    }
  }

  /** Keep the clock readout moving while the clock runs (a few times a second is plenty). */
  update(): void {
    if (this.clockStopped || document.activeElement === this.input('hour')) return;
    const hour = this.actions.hour();
    const out = this.panel.querySelector('[data-out="hour"]') as HTMLElement;
    const text = clockTime(hour);
    if (out.textContent !== text) {
      out.textContent = text;
      this.input('hour').value = String(hour);
    }
  }
}

function sameWeather(a: DevWeather, b: DevWeather): boolean {
  return a.cloud === b.cloud && a.rain === b.rain && a.wetness === b.wetness && a.creekRise === b.creekRise;
}
