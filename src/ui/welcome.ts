import { BUILD_LABEL, GAME_VERSION } from '../core/buildInfo';
import type { LaunchChoice } from '../core/game';
import { timeLabels, timesOfDay, weatherLabels, weathers } from '../data/environment';
import { mapOrder, maps } from '../data/maps';
import { vehicleOrder, vehicles } from '../data/vehicles';

type Group = 'map' | 'vehicle' | 'time' | 'weather' | 'drive';

const weatherNotes: Record<(typeof weathers)[number], string> = {
  clear: 'Dry ground and sunshine.',
  wet: 'Overcast, wet ground: less grip, more mud, the creeks up a little.',
  rain: 'Rain falling: wet and slippery, the creeks up, haze closing in.',
};

/**
 * Welcome screen (shown on launch): choose the world, the vehicle, the time of day and
 * the weather, then Drive. It starts on the last choices, so Enter (or A on a gamepad)
 * goes straight back to where you were. Arrow keys or the d-pad move between options.
 */
export class WelcomeScreen {
  readonly el: HTMLElement;
  private choice: LaunchChoice;
  private readonly rows: HTMLButtonElement[][] = [];
  private row = 0;
  private col = 0;
  private padPrev: boolean[] = [];
  private raf = 0;
  private done = false;

  constructor(
    root: HTMLElement,
    initial: LaunchChoice,
    private readonly onDrive: (choice: LaunchChoice, audio?: AudioContext) => void,
  ) {
    this.choice = { ...initial, conditions: { ...initial.conditions } };
    this.el = document.createElement('div');
    this.el.className = 'welcome';
    const option = (group: Group, value: string, label: string, note = '') =>
      `<button type="button" class="welcome-option" data-group="${group}" data-value="${value}">${label}${note ? `<small>${note}</small>` : ''}</button>`;
    this.el.innerHTML = `
      <div class="welcome-card paper">
        <h1>4WD Simulator</h1>
        <p class="subtitle">Where are you driving today?</p>
        <div class="welcome-grid">
          <section class="welcome-section">
            <h2>World</h2>
            <div class="welcome-options">${mapOrder.map((id) => option('map', id, maps[id].def.name, maps[id].blurb)).join('')}</div>
          </section>
          <section class="welcome-section">
            <h2>Vehicle</h2>
            <div class="welcome-options">${vehicleOrder.map((id) => option('vehicle', id, vehicles[id].tuning.name, vehicles[id].blurb)).join('')}</div>
          </section>
          <section class="welcome-section">
            <h2>Time of day</h2>
            <div class="welcome-options seg">${timesOfDay.map((t) => option('time', t, timeLabels[t])).join('')}</div>
          </section>
          <section class="welcome-section">
            <h2>Weather</h2>
            <div class="welcome-options seg">${weathers.map((w) => option('weather', w, weatherLabels[w])).join('')}</div>
            <p class="welcome-note"></p>
          </section>
        </div>
        <button type="button" class="welcome-drive" data-group="drive" data-welcome-drive>Drive</button>
        <p class="build-label" title="Build ${BUILD_LABEL}">Version ${GAME_VERSION}</p>
      </div>`;
    root.appendChild(this.el);
    for (const group of ['map', 'vehicle', 'time', 'weather', 'drive'] as const)
      this.rows.push([...this.el.querySelectorAll<HTMLButtonElement>(`[data-group="${group}"]`)]);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) this.activate(b);
    });
    window.addEventListener('keydown', this.onKey);
    this.row = this.rows.length - 1;
    this.refresh();
    this.rows[this.row][0].focus();
    this.raf = requestAnimationFrame(this.pollPad);
  }

  private activate(b: HTMLButtonElement): void {
    if (this.done) return;
    const group = b.dataset.group as Group;
    const value = b.dataset.value ?? '';
    if (group === 'map') this.choice.map = value as LaunchChoice['map'];
    else if (group === 'vehicle') this.choice.vehicle = value as LaunchChoice['vehicle'];
    else if (group === 'time') this.choice.conditions.time = value as LaunchChoice['conditions']['time'];
    else if (group === 'weather')
      this.choice.conditions.weather = value as LaunchChoice['conditions']['weather'];
    else return this.drive();
    this.row = this.rows.findIndex((r) => r.includes(b));
    this.col = this.rows[this.row].indexOf(b);
    this.refresh();
  }

  /** Mark the chosen option in each group, and the focused one. */
  private refresh(): void {
    const chosen: Record<Exclude<Group, 'drive'>, string> = {
      map: this.choice.map,
      vehicle: this.choice.vehicle,
      time: this.choice.conditions.time,
      weather: this.choice.conditions.weather,
    };
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.welcome-option')) {
      const on = chosen[b.dataset.group as keyof typeof chosen] === b.dataset.value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.rows.flat().forEach((b) => b.classList.remove('focused'));
    this.rows[this.row][this.col]?.classList.add('focused');
    const c = this.choice.conditions;
    (this.el.querySelector('.welcome-note') as HTMLElement).textContent =
      weatherNotes[c.weather] +
      (c.time === 'night' || c.time === 'dusk'
        ? ' The headlights come on as you arrive (N switches them).'
        : '');
  }

  private move(dRow: number, dCol: number): void {
    if (dRow) {
      this.row = Math.max(0, Math.min(this.rows.length - 1, this.row + dRow));
      // Land on the chosen option of the new row.
      const on = this.rows[this.row].findIndex((b) => b.classList.contains('on'));
      this.col = Math.max(0, on);
    } else this.col = Math.max(0, Math.min(this.rows[this.row].length - 1, this.col + dCol));
    const b = this.rows[this.row][this.col];
    b.focus();
    this.refresh();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.done) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const m = moves[e.code];
    if (m) {
      e.preventDefault();
      this.move(m[0], m[1]);
    }
  };

  private readonly pollPad = (): void => {
    if (this.done) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    if (pad) {
      const pressed = pad.buttons.map((b) => b.pressed);
      const edge = (i: number) => pressed[i] && !this.padPrev[i];
      // Standard mapping: 12-15 d-pad up, down, left, right; 0 = A; 9 = Start.
      if (edge(12)) this.move(-1, 0);
      if (edge(13)) this.move(1, 0);
      if (edge(14)) this.move(0, -1);
      if (edge(15)) this.move(0, 1);
      if (edge(0)) this.activate(this.rows[this.row][this.col]);
      if (edge(9)) this.drive();
      this.padPrev = pressed;
    }
    this.raf = requestAnimationFrame(this.pollPad);
  };

  private drive(): void {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    // This click (or key or button press) lets the browser start sound now.
    let audio: AudioContext | undefined;
    try {
      const Ctor = window.AudioContext as typeof AudioContext | undefined;
      if (Ctor) {
        audio = new Ctor({ latencyHint: 'interactive' });
        void audio.resume().catch(() => undefined);
      }
    } catch {
      audio = undefined;
    }
    this.el.classList.add('hidden');
    setTimeout(() => this.el.remove(), 400);
    this.onDrive(this.choice, audio);
  }
}
