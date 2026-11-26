import type { TripJournalEntry } from '../sim/sideTrips';
import { controllers, controllerTypes, type ControllerType } from '../data/controllers';
import { BUILD_LABEL, GAME_VERSION } from '../core/buildInfo';
import { controlsTable, touchControlsTable } from '../data/controls';
import { isTouchDevice } from './touchControls';
import {
  touchDriveLabels,
  touchDriveSchemes,
  touchStickSideLabels,
  touchStickSides,
  type TouchDriveScheme,
  type TouchStickSide,
} from '../data/touch';
import type { Settings } from '../sim/save/save';
import type { VehicleId } from '../data/vehicle';
import { vehicleOrder, vehicles } from '../data/vehicles';
import { levelTitle, type EpisodeDef } from '../data/episodes';
import { damageLabels, damageModes, type DamageMode } from '../data/damage';
import { hudStyleLabels, pickableHudStyles, type HudStyle } from '../data/hudStyles';
import { uiSizeLabels, uiSizes, type UiSize } from '../data/uiSize';
import { offeredQualities, shownQuality } from '../data/quality';
import { GEARBOX_SETTINGS, type GearboxSetting } from '../sim/vehicle/drivetrain';

/** What each damage setting does, and what sends a drive back to camp with it. */
export const damageNotes: Record<DamageMode, string> = {
  off: 'No mechanical damage; the body still dents and gets dirty.',
  mild: 'Hard knocks soften tyres, bend suspension and cost engine power; a field repair from the tool menu fixes them, and so does driving into a camp. Being swept away by a creek sends you back to camp.',
  realistic:
    'Tyres puncture or tear and the engine can be wrecked. Plug punctures, fit spares for torn sidewalls; driving into a camp fixes everything and restocks the spares and plugs. A flat with nothing left to fix it, a wrecked engine or being swept away sends you back to camp.',
};

export const gearboxLabels: Record<GearboxSetting, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
};

/** What each gearbox setting does (controller only; the keyboard and touch drive automatic). */
export function gearboxNote(mode: GearboxSetting): string {
  return {
    automatic:
      'The gearbox changes gear itself. Controller only: the keyboard and touch always drive automatic.',
    manual:
      'D-pad right / left change up and down (N, then reverse below 1st); the clutch is worked for you. The 40 Series holds the gear of its automatic.',
  }[mode];
}

/** The Gearbox row appears only while a controller is connected, and never on a phone or tablet. */
export function showGearboxSetting(gamepadConnected: boolean): boolean {
  return gamepadConnected && !isTouchDevice();
}

type Page = 'main' | 'journal' | 'vehicle' | 'settings' | 'controls';

export interface MenuActions {
  resume(): void;
  openMap(): void;
  /** Restart from the last camp reached, as things were there. */
  returnToCampsite(): void;
  changeSettings(s: Partial<Settings>): void;
  changeVehicle(id: VehicleId): void;
  mainMenu(): void;
  /** Install the new version that has been downloaded (saving first) and reload into it. */
  restartForUpdate(): void;
}

/**
 * Pause menu (SPEC §9): Resume, Map, Restart from last camp, Vehicle, Settings, Controls,
 * Main menu.
 * Works with mouse, keyboard (arrows + Enter, Esc) and gamepad (D-pad + Cross, Circle).
 */
/** One reading at the top of the pause menu: a label, the value, and a short note. */
export interface PauseStatusCell {
  label: string;
  value: string;
  note?: string;
}

export class PauseMenu {
  readonly el: HTMLElement;
  isOpen = false;
  private page: Page = 'main';
  /** The highlighted row of the page, and the option highlighted in it. */
  private row = 0;
  private col = 0;
  /** The main page's row and column the open page was reached from: Back returns the highlight to it. */
  private mainAt: [number, number] = [0, 0];
  private settings: Settings;
  private campsiteName = '';
  private vehicle: VehicleId = 'shortie';
  private episodeName = '';
  /** A level with no goal: no story, so no journal unless something has been noted. */
  private playground = false;
  /** Opened from the touch controls: the Controls page lists those instead of the keyboard. */
  private touch = false;
  private device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  private gamepadConnected = false;
  /** A new build is downloaded and waiting: the main page offers to restart into it. */
  private updateReady = false;
  private status: readonly PauseStatusCell[] = [];
  private trips: readonly TripJournalEntry[] = [];
  /** History notes and lessons shown on this trip, oldest first (the journal keeps them). */
  private notes: readonly { title: string; text: string }[] = [];

  setTrips(trips: readonly TripJournalEntry[], notes: readonly { title: string; text: string }[] = []): void {
    this.trips = trips;
    this.notes = notes;
  }

  constructor(
    root: HTMLElement,
    private readonly actions: MenuActions,
    settings: Settings,
  ) {
    this.settings = { ...settings };
    this.el = document.createElement('div');
    this.el.className = 'pause hidden';
    root.appendChild(this.el);
  }

  open(campsiteName: string, touch = false): void {
    this.campsiteName = campsiteName;
    this.touch = touch;
    if (touch) this.device = 'touch';
    this.isOpen = true;
    this.page = 'main';
    this.mainAt = [0, 0];
    this.show('main');
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  /** A new build is downloaded and waiting: offer "Restart for the new version". */
  setUpdateReady(on: boolean): void {
    if (this.updateReady === on) return;
    this.updateReady = on;
    if (this.isOpen && this.page === 'main') this.show('main', true);
  }

  setSettings(s: Settings): void {
    this.settings = { ...s };
    this.updateInputHint();
    if (this.isOpen && this.page === 'controls') this.show('controls', true);
  }

  setInputDevice(device: 'keyboard' | 'gamepad' | 'touch'): void {
    if (this.device !== device) {
      this.device = device;
      this.updateInputHint();
    }
    const touch = device === 'touch';
    if (touch === this.touch) return;
    this.touch = touch;
    if (this.isOpen && this.page === 'controls') this.show('controls', true);
  }

  /** A controller was plugged in or out: the Settings page shows or hides the Gearbox row. */
  setGamepadConnected(on: boolean): void {
    if (this.gamepadConnected === on) return;
    this.gamepadConnected = on;
    if (this.isOpen && this.page === 'settings') this.show('settings', true);
  }

  private updateInputHint(): void {
    const hint = this.el.querySelector('.pause-input-hint');
    if (!hint) return;
    const p = controllers[this.settings.controller];
    hint.textContent =
      this.device === 'gamepad'
        ? `${p.confirm} Select · ${p.back} Back`
        : this.device === 'touch'
          ? 'Tap an option'
          : 'Enter Select · Esc Back';
  }

  /** The time, fuel and what's on board, shown above the main page's buttons. */
  setStatus(cells: readonly PauseStatusCell[]): void {
    this.status = cells;
  }

  /** The vehicle being driven, ticked on the Vehicle page. */
  setVehicle(id: VehicleId): void {
    this.vehicle = id;
  }

  /** The episode being played, named on the main page. */
  setEpisode(def: EpisodeDef): void {
    this.episodeName = levelTitle(def);
    this.playground = !def.goal;
  }

  private buttons(): HTMLElement[] {
    return [...this.el.querySelectorAll<HTMLElement>('[data-focus]')];
  }

  /**
   * The page's rows, top to bottom, as Up and Down step through them. The options of one
   * setting share a row, and so do the buttons side by side in a grid of columns; anything
   * else is a row of its own.
   */
  private rows(): HTMLElement[][] {
    const rows: HTMLElement[][] = [];
    const settings = new Map<Element, HTMLElement[]>();
    for (const b of this.buttons()) {
      const seg = b.closest('.seg');
      if (seg) {
        let row = settings.get(seg);
        if (!row) {
          row = [];
          settings.set(seg, row);
          rows.push(row);
        }
        row.push(b);
        continue;
      }
      const grid = b.parentElement?.classList.contains('pause-buttons') ? b.parentElement : null;
      const last = rows[rows.length - 1];
      if (grid && last && last[0].parentElement === grid && last.length < columnsOf(grid)) last.push(b);
      else rows.push([b]);
    }
    return rows;
  }

  /**
   * Draw a page. `keep` redraws the page that is open (a setting changed, a controller was
   * plugged in) with the highlight and the scrolling where they were; without it the page
   * opens at its top, or, back on the main page, on the row the last page was opened from.
   */
  private show(page: Page, keep = false): void {
    const scrolled = keep ? (this.el.querySelector('.pause-body')?.scrollTop ?? 0) : 0;
    if (!keep) {
      if (this.page === 'main' && page !== 'main') this.mainAt = [this.row, Math.max(0, this.col)];
      [this.row, this.col] = page === 'main' && this.page !== 'main' ? this.mainAt : [0, -1];
    }
    this.page = page;
    const card = document.createElement('div');
    card.className = 'pause-card paper';
    // Every page is a heading that stays put, a body that scrolls when it is taller than the
    // screen, and a foot (Back and the input hint) that stays in sight.
    const BODY = '<div class="pause-body">';
    const foot = (back: boolean) =>
      `</div><div class="pause-foot">${back ? '<button data-focus data-act="back">Back</button>' : ''}`;
    if (page === 'main') {
      card.classList.add('pause-main');
      card.innerHTML = `<h2>Paused</h2><p class="pause-episode"></p>
        <div class="pause-status"></div>
        ${BODY}<div class="pause-buttons">
          <button data-focus data-act="resume">Resume</button>
          <button data-focus data-act="map">Map</button>
          ${this.playground && this.trips.length + this.notes.length === 0 ? '' : '<button data-focus data-act="journal">Trip journal<small>Side trips, directions and notes on the way</small></button>'}
          <button data-focus data-act="camp">Restart from last camp<small></small></button>
          <button data-focus data-act="vehicle">Vehicle<small class="vehicle-name"></small></button>
          <button data-focus data-act="settings">Settings</button>
          <button data-focus data-act="controls">Controls</button>
          <button data-focus data-act="menu">Main menu<small>${this.playground ? 'Level, vehicle and conditions' : 'Episodes and vehicle; progress is kept'}</small></button>
          ${this.updateReady ? '<button data-focus data-act="update" class="update-ready">Restart for the new version<small>Carries on from the last camp</small></button>' : ''}
        </div>${foot(false)}
        <p class="build-label" title="Build ${BUILD_LABEL}">Version ${GAME_VERSION}</p></div>`;
      (card.querySelector('.pause-episode') as HTMLElement).textContent = this.episodeName;
      const status = card.querySelector('.pause-status') as HTMLElement;
      for (const c of this.status) {
        const cell = document.createElement('div');
        cell.innerHTML = '<span></span><b></b><small></small>';
        cell.querySelector('span')!.textContent = c.label;
        cell.querySelector('b')!.textContent = c.value;
        cell.querySelector('small')!.textContent = c.note ?? '';
        status.appendChild(cell);
      }
      (card.querySelector('[data-act="camp"] small') as HTMLElement).textContent = this.campsiteName;
      (card.querySelector('.vehicle-name') as HTMLElement).textContent = vehicles[this.vehicle].tuning.name;
    } else if (page === 'journal') {
      card.classList.add('pause-journal');
      card.innerHTML = `<h2>Trip journal</h2><p class="menu-note">Optional side trips. Stop for three seconds at each task. The clock runs while you drive; camps keep your progress.</p>${BODY}<div class="journal-scroll"></div>${foot(true)}</div>`;
      const list = card.querySelector('.journal-scroll')!;
      for (const trip of this.trips) {
        const entry = document.createElement('article');
        entry.className = `journal-trip${trip.complete ? ' complete' : ''}`;
        entry.dataset.focus = '';
        entry.tabIndex = 0;
        const title = document.createElement('h3');
        title.textContent = `${trip.name} · ${trip.complete ? 'Complete' : `${trip.stops.filter((s) => s.done).length}/${trip.stops.length}`}`;
        const description = document.createElement('p');
        description.textContent = trip.description;
        const steps = document.createElement('ol');
        for (const stop of trip.stops) {
          const li = document.createElement('li');
          li.className = stop.done ? 'done' : stop.available ? 'current' : '';
          const task = document.createElement('strong');
          task.textContent = `${stop.done ? '✓ ' : ''}${stop.task}`;
          const directions = document.createElement('p');
          directions.textContent = stop.directions;
          li.append(task, directions);
          if (stop.entry) {
            const memory = document.createElement('p');
            memory.className = 'journal-memory';
            memory.textContent = stop.entry;
            li.appendChild(memory);
          }
          steps.appendChild(li);
        }
        const reward = document.createElement('p');
        reward.className = 'journal-reward';
        reward.textContent = `${trip.complete ? 'Earned' : 'Reward'}: ${trip.reward}`;
        entry.append(title, description, steps, reward);
        list.appendChild(entry);
      }
      // The history notes and lessons met so far, to read again once their card has gone.
      if (this.notes.length) {
        const heading = document.createElement('h3');
        heading.className = 'journal-notes-heading';
        heading.textContent = 'Notes on the way';
        list.appendChild(heading);
      }
      for (const note of this.notes) {
        const entry = document.createElement('article');
        entry.className = 'journal-trip journal-note';
        entry.dataset.focus = '';
        entry.tabIndex = 0;
        const title = document.createElement('h3');
        title.textContent = note.title;
        const text = document.createElement('p');
        text.textContent = note.text;
        entry.append(title, text);
        list.appendChild(entry);
      }
    } else if (page === 'vehicle') {
      card.innerHTML = `<h2>Vehicle</h2>${BODY}
        ${vehicleOrder
          .map(
            (id) =>
              `<button data-focus data-vehicle="${id}" class="vehicle-choice ${id === this.vehicle ? 'on' : ''}">${vehicles[id].tuning.name}<small>${vehicles[id].blurb}</small></button>`,
          )
          .join('')}
        <p class="menu-note">Changing vehicle restarts from your last camp in the new one.</p>
        ${foot(true)}</div>`;
    } else if (page === 'settings') {
      const s = this.settings;
      // A phone's settings stop at phoneMaxQuality (see qualityFor).
      const quality = shownQuality(s.quality, isTouchDevice());
      const q = (v: string) =>
        `<button data-focus data-quality="${v}" class="${quality === v ? 'on' : ''}">${v[0].toUpperCase()}${v.slice(1)}</button>`;
      const slider = (key: keyof Settings, label: string) =>
        `<label class="setting-row">${label}<input data-focus type="range" min="0" max="1" step="0.05" data-key="${key}" value="${s[key]}"></label>`;
      // The two phone settings are only for a touch screen: a television has no use for them.
      const phone = isTouchDevice()
        ? `<div class="setting-row controller-setting phone-driving-setting">Phone driving<div class="seg">${touchDriveSchemes.map((c) => `<button data-focus data-touch-drive="${c}" class="${s.touchDrive === c ? 'on' : ''}" aria-pressed="${s.touchDrive === c}">${touchDriveLabels[c]}</button>`).join('')}</div></div>
        <div class="setting-row controller-setting phone-driving-setting">Joystick side<div class="seg">${touchStickSides.map((c) => `<button data-focus data-touch-side="${c}" class="${s.touchStickSide === c ? 'on' : ''}" aria-pressed="${s.touchStickSide === c}">${touchStickSideLabels[c]}</button>`).join('')}</div></div>`
        : '';
      card.innerHTML = `<h2>Settings</h2>${BODY}
        <div class="setting-row">Cockpit mirrors<div class="seg">${[true, false].map((on) => `<button data-focus data-mirrors="${on}" class="${s.mirrors === on ? 'on' : ''}">${on ? 'On' : 'Off'}</button>`).join('')}</div></div>
        <div class="setting-row">Cockpit head motion<div class="seg">${[true, false].map((on) => `<button data-focus data-head-motion="${on}" class="${s.headMotion === on ? 'on' : ''}" aria-pressed="${s.headMotion === on}">${on ? 'On' : 'Off'}</button>`).join('')}</div></div>
        <div class="setting-row">Graphics<div class="seg">${offeredQualities(isTouchDevice()).map(q).join('')}</div></div>
        ${phone}
        ${slider('masterVolume', 'Master volume')}
        ${slider('engineVolume', 'Engine volume')}
        ${slider('ambienceVolume', 'Ambience volume')}
        <div class="setting-row controller-setting">Controller type<div class="seg">${controllerTypes.map((c) => `<button data-focus data-controller="${c}" class="${s.controller === c ? 'on' : ''}" aria-pressed="${s.controller === c}">${controllers[c].label}</button>`).join('')}</div></div>
        <div class="setting-row frame-rate-setting">Frame rate<div class="seg"><button data-focus data-frame-rate="60" class="${s.frameRate === '60' ? 'on' : ''}" aria-pressed="${s.frameRate === '60'}">60</button><button data-focus data-frame-rate="screen" class="${s.frameRate === 'screen' ? 'on' : ''}" aria-pressed="${s.frameRate === 'screen'}">Screen</button></div></div>
        <div class="setting-row">Units<div class="seg"><button data-focus data-units="kmh" class="${s.units === 'kmh' ? 'on' : ''}">km/h</button><button data-focus data-units="mph" class="${s.units === 'mph' ? 'on' : ''}">mph</button></div></div>
        <div class="setting-row ui-size-setting">UI size<div class="seg">${uiSizes.map((z) => `<button data-focus data-ui-size="${z}" class="${s.uiSize === z ? 'on' : ''}" aria-pressed="${s.uiSize === z}">${uiSizeLabels[z]}</button>`).join('')}</div></div>
        <div class="setting-row">HUD style<div class="seg">${pickableHudStyles.map((h) => `<button data-focus data-hud-style="${h}" class="${s.hudStyle === h ? 'on' : ''}" aria-pressed="${s.hudStyle === h}">${hudStyleLabels[h]}</button>`).join('')}</div></div>
        <div class="setting-row">Damage<div class="seg">${damageModes
          .map(
            (m) =>
              `<button data-focus data-damage="${m}" class="${s.damage === m ? 'on' : ''}">${damageLabels[m]}</button>`,
          )
          .join('')}</div></div>
        <p class="menu-note damage-note">${damageNotes[s.damage]}</p>
        ${
          showGearboxSetting(this.gamepadConnected)
            ? `<div class="setting-row gearbox-setting">Gearbox<div class="seg">${GEARBOX_SETTINGS.map(
                (m) =>
                  `<button data-focus data-gearbox="${m}" class="${s.gearbox === m ? 'on' : ''}" aria-pressed="${s.gearbox === m}">${gearboxLabels[m]}</button>`,
              ).join('')}</div></div>
        <p class="menu-note gearbox-note">${gearboxNote(s.gearbox)}</p>`
            : ''
        }
        ${foot(true)}</div>`;
    } else {
      const table = this.touch
        ? `<thead><tr><th>Action</th><th>Touch</th></tr></thead><tbody>${touchControlsTable(
            this.settings.touchDrive,
            this.settings.touchStickSide,
          )
            .map(([a, t]) => `<tr><td>${a}</td><td>${t}</td></tr>`)
            .join('')}</tbody>`
        : `<thead><tr><th>Action</th><th>Keyboard</th><th>${controllers[this.settings.controller].label}</th></tr></thead><tbody>${controlsTable(
            this.settings.controller,
          )
            .map(([a, k, g]) => `<tr><td>${a}</td><td>${k}</td><td>${g}</td></tr>`)
            .join('')}</tbody>`;
      // The table scrolls in the page's body (Up and Down turn it), Back stays in the foot.
      card.classList.add('pause-controls');
      card.innerHTML = `<h2>Controls</h2>${BODY}<div class="controls-scroll"><table class="controls">${table}</table></div>
        ${foot(true)}</div>`;
    }
    const hint = document.createElement('p');
    hint.className = 'menu-note pause-input-hint';
    card.querySelector('.pause-foot')!.appendChild(hint);
    this.el.innerHTML = '';
    this.el.appendChild(card);
    this.updateInputHint();
    card.querySelector('.pause-body')!.scrollTop = scrolled;
    card.addEventListener('click', (e) => {
      // A click or a tap takes the highlight with it.
      const picked = (e.target as HTMLElement).closest<HTMLElement>('[data-focus]');
      this.rows().forEach((r, i) => {
        const c = picked ? r.indexOf(picked) : -1;
        if (c >= 0) [this.row, this.col] = [i, c];
      });
      this.activate(e.target as HTMLElement);
    });
    card.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.key) {
        const key = t.dataset.key as 'masterVolume' | 'engineVolume' | 'ambienceVolume';
        this.settings[key] = Number(t.value);
        this.actions.changeSettings({ [key]: Number(t.value) });
      }
    });
    // The Vehicle page opens on the vehicle being driven.
    if (!keep && page === 'vehicle')
      this.row = Math.max(
        0,
        this.rows().findIndex((r) => r[0].classList.contains('on')),
      );
    this.focus();
  }

  private activate(target: HTMLElement | null): void {
    const t = target?.closest('button') as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'resume') this.actions.resume();
    else if (act === 'map') this.actions.openMap();
    else if (act === 'camp') this.actions.returnToCampsite();
    else if (act === 'journal') this.show('journal');
    else if (act === 'vehicle') this.show('vehicle');
    else if (act === 'settings') this.show('settings');
    else if (act === 'controls') this.show('controls');
    else if (act === 'menu') this.actions.mainMenu();
    else if (act === 'update') this.actions.restartForUpdate();
    else if (act === 'back') this.show('main');
    else if (t.dataset.vehicle) {
      const id = t.dataset.vehicle as VehicleId;
      if (id === this.vehicle) this.actions.resume();
      else this.actions.changeVehicle(id);
    } else if (t.dataset.quality) {
      this.settings.quality = t.dataset.quality as Settings['quality'];
      this.actions.changeSettings({ quality: this.settings.quality });
      this.show('settings', true);
    } else if (t.dataset.mirrors) {
      this.settings.mirrors = t.dataset.mirrors === 'true';
      this.actions.changeSettings({ mirrors: this.settings.mirrors });
      this.show('settings', true);
    } else if (t.dataset.headMotion) {
      this.settings.headMotion = t.dataset.headMotion === 'true';
      this.actions.changeSettings({ headMotion: this.settings.headMotion });
      this.show('settings', true);
    } else if (t.dataset.controller) {
      this.settings.controller = t.dataset.controller as ControllerType;
      this.actions.changeSettings({ controller: this.settings.controller });
      this.show('settings', true);
    } else if (t.dataset.touchDrive) {
      this.settings.touchDrive = t.dataset.touchDrive as TouchDriveScheme;
      this.actions.changeSettings({ touchDrive: this.settings.touchDrive });
      this.show('settings', true);
    } else if (t.dataset.touchSide) {
      this.settings.touchStickSide = t.dataset.touchSide as TouchStickSide;
      this.actions.changeSettings({ touchStickSide: this.settings.touchStickSide });
      this.show('settings', true);
    } else if (t.dataset.frameRate) {
      this.settings.frameRate = t.dataset.frameRate === 'screen' ? 'screen' : '60';
      this.actions.changeSettings({ frameRate: this.settings.frameRate });
      this.show('settings', true);
    } else if (t.dataset.units) {
      this.settings.units = t.dataset.units as Settings['units'];
      this.actions.changeSettings({ units: this.settings.units });
      this.show('settings', true);
    } else if (t.dataset.uiSize) {
      this.settings.uiSize = t.dataset.uiSize as UiSize;
      this.actions.changeSettings({ uiSize: this.settings.uiSize });
      this.show('settings', true);
    } else if (t.dataset.hudStyle) {
      this.settings.hudStyle = t.dataset.hudStyle as HudStyle;
      this.actions.changeSettings({ hudStyle: this.settings.hudStyle });
      this.show('settings', true);
    } else if (t.dataset.gearbox) {
      this.settings.gearbox = t.dataset.gearbox as GearboxSetting;
      this.actions.changeSettings({ gearbox: this.settings.gearbox });
      this.show('settings', true);
    } else if (t.dataset.damage) {
      this.settings.damage = t.dataset.damage as DamageMode;
      this.actions.changeSettings({ damage: this.settings.damage });
      this.show('settings', true);
    }
  }

  /** Mark the highlighted item and its row, and bring it into view. */
  private focus(): void {
    const rows = this.rows();
    if (rows.length > 0) {
      this.row = Math.min(this.row, rows.length - 1);
      // Into a setting's row: onto the option in use.
      if (this.col < 0)
        this.col = Math.max(
          0,
          rows[this.row].findIndex((b) => b.classList.contains('on')),
        );
      this.col = Math.min(this.col, rows[this.row].length - 1);
    }
    const cur = rows[this.row]?.[this.col];
    for (const b of this.buttons()) b.classList.toggle('focused', b === cur);
    for (const r of this.el.querySelectorAll('.setting-row'))
      r.classList.toggle('focused-row', r.contains(cur ?? null));
    const body = this.el.querySelector<HTMLElement>('.pause-body');
    if (!cur || !body) return;
    // The first row brings the top of the page back with it; any other row scrolls just into view.
    if (this.row === 0) body.scrollTop = 0;
    else if (body.contains(cur)) (cur.closest('.setting-row') ?? cur).scrollIntoView({ block: 'nearest' });
  }

  /**
   * Keyboard / gamepad navigation. Up and Down step through the rows. Left and Right change a
   * setting (its next option, or a slider a step) or move across a grid of buttons. Confirm
   * presses a button, and on a setting steps to its next option. Returns true if the menu
   * wants to close (back from main).
   */
  navigate(cmd: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'): boolean {
    if (cmd === 'back') {
      if (this.page === 'main') return true;
      this.show('main');
      return false;
    }
    const rows = this.rows();
    if (rows.length === 0) return false;
    this.row = Math.min(this.row, rows.length - 1);
    this.col = Math.max(0, Math.min(this.col, rows[this.row].length - 1));
    const cur = rows[this.row][this.col];
    const setting = (b: HTMLElement) => !!b.closest('.seg');
    if (cmd === 'up' || cmd === 'down') {
      // A page with nothing to choose but Back (Controls): Up and Down turn its pages.
      const body = this.el.querySelector<HTMLElement>('.pause-body');
      if (rows.length === 1 && body && body.scrollHeight > body.clientHeight + 1) {
        body.scrollBy({ top: (cmd === 'down' ? 0.6 : -0.6) * body.clientHeight });
        return false;
      }
      this.row = (this.row + (cmd === 'down' ? 1 : rows.length - 1)) % rows.length;
      // Into a setting: onto the option in use. Down a grid: the same column.
      if (setting(rows[this.row][0])) this.col = -1;
      this.focus();
    } else if (cmd === 'left' || cmd === 'right') {
      const step = cmd === 'right' ? 1 : -1;
      if (cur instanceof HTMLInputElement) {
        const v = Math.min(1, Math.max(0, Number(cur.value) + step * 0.05));
        cur.value = String(v);
        cur.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const col = Math.max(0, Math.min(rows[this.row].length - 1, this.col + step));
        if (col === this.col) return false;
        this.col = col;
        // A setting changes as the highlight moves along it; a grid only moves the highlight.
        if (setting(cur)) this.activate(rows[this.row][col]);
        else this.focus();
      }
    } else if (!(cur instanceof HTMLInputElement)) {
      if (setting(cur)) {
        // The highlight is already on the option in use: Confirm steps to the next, round to the first.
        this.col = (this.col + 1) % rows[this.row].length;
        this.activate(rows[this.row][this.col]);
      } else this.activate(cur);
    }
    return false;
  }
}

/** How many columns a container lays its children out in (1 unless it is a grid of more). */
function columnsOf(el: Element): number {
  const columns = getComputedStyle(el).gridTemplateColumns;
  return !columns || columns === 'none' ? 1 : Math.max(1, columns.trim().split(/\s+/).length);
}

/** Full-screen fade used when restarting from a camp. */
export class Fade {
  readonly el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fade';
    root.appendChild(this.el);
  }

  async run(middle: () => void): Promise<void> {
    this.el.classList.add('on');
    await new Promise((r) => setTimeout(r, 450));
    middle();
    await new Promise((r) => setTimeout(r, 250));
    this.el.classList.remove('on');
  }
}
