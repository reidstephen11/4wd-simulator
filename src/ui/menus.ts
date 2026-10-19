import { BUILD_LABEL, GAME_VERSION } from '../core/buildInfo';
import { controlsTable } from '../data/controls';
import type { Settings } from '../sim/save/save';
import type { VehicleId } from '../data/vehicle';
import { vehicleOrder, vehicles } from '../data/vehicles';
import { mapOrder, maps, type MapId } from '../data/maps';
import { damageLabels, damageModes, type DamageMode } from '../data/damage';

const damageNotes: Record<DamageMode, string> = {
  off: 'No mechanical damage. The body still dents and gets dirty.',
  mild: 'Hard knocks soften tyres, bend suspension and cost engine power, but never stop you. Field repair from the tool menu.',
  realistic:
    'Tyres go flat and the engine can be wrecked. One spare; everything else is fixed at a campsite.',
};

type Page = 'main' | 'vehicle' | 'location' | 'settings' | 'controls';

export interface MenuActions {
  resume(): void;
  openMap(): void;
  returnToCampsite(): void;
  changeSettings(s: Partial<Settings>): void;
  changeVehicle(id: VehicleId): void;
  changeMap(id: MapId): void;
  mainMenu(): void;
}

/**
 * Pause menu (SPEC §9): Resume, Map, Return to last campsite, Vehicle, Location, Settings,
 * Controls.
 * Works with mouse, keyboard (arrows + Enter, Esc) and gamepad (D-pad + A, B).
 */
export class PauseMenu {
  readonly el: HTMLElement;
  isOpen = false;
  private page: Page = 'main';
  private focusIndex = 0;
  private settings: Settings;
  private campsiteName = '';
  private vehicle: VehicleId = 'shortie';
  private map: MapId = 'high-country';

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

  open(campsiteName: string): void {
    this.campsiteName = campsiteName;
    this.isOpen = true;
    this.show('main');
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  setSettings(s: Settings): void {
    this.settings = { ...s };
  }

  /** The vehicle being driven, ticked on the Vehicle page. */
  setVehicle(id: VehicleId): void {
    this.vehicle = id;
  }

  /** The map loaded, ticked on the Location page. */
  setMap(id: MapId): void {
    this.map = id;
  }

  private buttons(): HTMLElement[] {
    return [...this.el.querySelectorAll<HTMLElement>('[data-focus]')];
  }

  private show(page: Page): void {
    this.page = page;
    this.focusIndex = 0;
    const card = document.createElement('div');
    card.className = 'pause-card paper';
    if (page === 'main') {
      card.innerHTML = `<h2>Paused</h2>
        <button data-focus data-act="resume">Resume</button>
        <button data-focus data-act="map">Map</button>
        <button data-focus data-act="camp">Return to last campsite<small></small></button>
        <button data-focus data-act="vehicle">Vehicle<small class="vehicle-name"></small></button>
        <button data-focus data-act="location">Location<small class="map-name"></small></button>
        <button data-focus data-act="settings">Settings</button>
        <button data-focus data-act="controls">Controls</button>
        <button data-focus data-act="menu">Main menu<small>World, vehicle and weather</small></button>
        <p class="build-label" title="Build ${BUILD_LABEL}">Version ${GAME_VERSION}</p>`;
      (card.querySelector('small') as HTMLElement).textContent = this.campsiteName;
      (card.querySelector('.vehicle-name') as HTMLElement).textContent = vehicles[this.vehicle].tuning.name;
      (card.querySelector('.map-name') as HTMLElement).textContent = maps[this.map].def.name;
    } else if (page === 'vehicle') {
      card.innerHTML = `<h2>Vehicle</h2>
        ${vehicleOrder
          .map(
            (id) =>
              `<button data-focus data-vehicle="${id}" class="vehicle-choice ${id === this.vehicle ? 'on' : ''}">${vehicles[id].tuning.name}<small>${vehicles[id].blurb}</small></button>`,
          )
          .join('')}
        <p class="menu-note">Swapping puts the new vehicle where you are, with the winch and planks back on board.</p>
        <button data-focus data-act="back">Back</button>`;
    } else if (page === 'location') {
      card.innerHTML = `<h2>Location</h2>
        ${mapOrder
          .map(
            (id) =>
              `<button data-focus data-map="${id}" class="vehicle-choice ${id === this.map ? 'on' : ''}">${maps[id].def.name}<small>${maps[id].blurb}</small></button>`,
          )
          .join('')}
        <p class="menu-note">Changing location reloads the game. You start at that map’s last campsite in the same vehicle, and each map keeps its own progress.</p>
        <button data-focus data-act="back">Back</button>`;
    } else if (page === 'settings') {
      const s = this.settings;
      const q = (v: string) =>
        `<button data-focus data-quality="${v}" class="${s.quality === v ? 'on' : ''}">${v[0].toUpperCase()}${v.slice(1)}</button>`;
      const slider = (key: keyof Settings, label: string) =>
        `<label class="setting-row">${label}<input data-focus type="range" min="0" max="1" step="0.05" data-key="${key}" value="${s[key]}"></label>`;
      card.innerHTML = `<h2>Settings</h2>
        <div class="setting-row">Graphics<div class="seg">${q('low')}${q('medium')}${q('high')}</div></div>
        ${slider('masterVolume', 'Master volume')}
        ${slider('engineVolume', 'Engine volume')}
        ${slider('ambienceVolume', 'Ambience volume')}
        <div class="setting-row">Units<div class="seg"><button data-focus data-units="kmh" class="${s.units === 'kmh' ? 'on' : ''}">km/h</button><button data-focus data-units="mph" class="${s.units === 'mph' ? 'on' : ''}">mph</button></div></div>
        <div class="setting-row">Damage<div class="seg">${damageModes
          .map(
            (m) =>
              `<button data-focus data-damage="${m}" class="${s.damage === m ? 'on' : ''}">${damageLabels[m]}</button>`,
          )
          .join('')}</div></div>
        <p class="menu-note damage-note">${damageNotes[s.damage]}</p>
        <button data-focus data-act="back">Back</button>`;
    } else {
      const rows = controlsTable
        .map(([a, k, g]) => `<tr><td>${a}</td><td>${k}</td><td>${g}</td></tr>`)
        .join('');
      card.innerHTML = `<h2>Controls</h2><table class="controls"><thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th></tr></thead><tbody>${rows}</tbody></table>
        <button data-focus data-act="back">Back</button>`;
    }
    this.el.innerHTML = '';
    this.el.appendChild(card);
    card.addEventListener('click', (e) => this.activate(e.target as HTMLElement));
    card.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.key) {
        const key = t.dataset.key as 'masterVolume' | 'engineVolume' | 'ambienceVolume';
        this.settings[key] = Number(t.value);
        this.actions.changeSettings({ [key]: Number(t.value) });
      }
    });
    this.focus();
  }

  private activate(target: HTMLElement | null): void {
    const t = target?.closest('button') as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'resume') this.actions.resume();
    else if (act === 'map') this.actions.openMap();
    else if (act === 'camp') this.actions.returnToCampsite();
    else if (act === 'vehicle') this.show('vehicle');
    else if (act === 'location') this.show('location');
    else if (act === 'settings') this.show('settings');
    else if (act === 'controls') this.show('controls');
    else if (act === 'menu') this.actions.mainMenu();
    else if (act === 'back') this.show('main');
    else if (t.dataset.vehicle) {
      const id = t.dataset.vehicle as VehicleId;
      if (id === this.vehicle) this.actions.resume();
      else this.actions.changeVehicle(id);
    } else if (t.dataset.map) {
      const id = t.dataset.map as MapId;
      if (id === this.map) this.actions.resume();
      else this.actions.changeMap(id);
    } else if (t.dataset.quality) {
      this.settings.quality = t.dataset.quality as Settings['quality'];
      this.actions.changeSettings({ quality: this.settings.quality });
      this.show('settings');
    } else if (t.dataset.units) {
      this.settings.units = t.dataset.units as Settings['units'];
      this.actions.changeSettings({ units: this.settings.units });
      this.show('settings');
    } else if (t.dataset.damage) {
      this.settings.damage = t.dataset.damage as DamageMode;
      this.actions.changeSettings({ damage: this.settings.damage });
      this.show('settings');
    }
  }

  private focus(): void {
    const b = this.buttons();
    b.forEach((x, i) => x.classList.toggle('focused', i === this.focusIndex));
  }

  /** Keyboard / gamepad navigation. Returns true if the menu wants to close (back from main). */
  navigate(cmd: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'): boolean {
    const b = this.buttons();
    if (cmd === 'back') {
      if (this.page === 'main') return true;
      this.show('main');
      return false;
    }
    if (b.length === 0) return false;
    if (cmd === 'up') this.focusIndex = (this.focusIndex + b.length - 1) % b.length;
    if (cmd === 'down') this.focusIndex = (this.focusIndex + 1) % b.length;
    const cur = b[this.focusIndex];
    if ((cmd === 'left' || cmd === 'right') && cur instanceof HTMLInputElement) {
      const v = Math.min(1, Math.max(0, Number(cur.value) + (cmd === 'right' ? 0.05 : -0.05)));
      cur.value = String(v);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (cmd === 'left' || cmd === 'right') {
      this.focusIndex = (this.focusIndex + (cmd === 'right' ? 1 : b.length - 1)) % b.length;
    }
    if (cmd === 'confirm' && !(cur instanceof HTMLInputElement)) this.activate(cur);
    else this.focus();
    return false;
  }
}

/** Full-screen fade used when returning to a campsite. */
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
