import { controllers, controllerTypes, type ControllerType } from '../data/controllers';
import { TitleAmbience } from '../audio/titleAmbience';
import { BUILD_LABEL, GAME_VERSION } from '../core/buildInfo';
import type { LaunchChoice } from '../core/game';
import { damageLabels, damageModes, type DamageMode } from '../data/damage';
import { isDevMode } from '../data/devWeather';
import {
  defaultConditions,
  timeLabels,
  timesOfDay,
  weatherLabels,
  weathers,
  type TimeOfDay,
} from '../data/environment';
import { clockTime, episodeOrder, episodes, type EpisodeId } from '../data/episodes';
import { maps } from '../data/maps';
import { offeredQualities, shownQuality } from '../data/quality';
import {
  touchDriveLabels,
  touchDriveSchemes,
  touchStickSideLabels,
  touchStickSides,
  touchTuning,
  type TouchDriveScheme,
  type TouchStickSide,
} from '../data/touch';
import { vehicleLoadout, vehicleOrder, vehicles } from '../data/vehicles';
import { supplyRun } from '../sim/supplyRun';
import type { EpisodeLoadout } from '../data/episodes';
import { loadKg, packFor, packLimitKg, rememberPack, stepPack, type SavedPacks } from '../data/packing';
import { defaultSettings, loadSave, writeSave, type SaveData, type Settings } from '../sim/save/save';
import { MenuStick } from '../sim/input/touchStick';
import { isTouchDevice } from './touchControls';
import { applyHudStyle, hudStyleLabels, pickableHudStyles, type HudStyle } from '../data/hudStyles';
import { uiSizeLabels, uiSizes, type UiSize } from '../data/uiSize';
import { applyUiSize } from './uiScale';
import { damageNotes, gearboxLabels, gearboxNote, showGearboxSetting } from './menus';
import { GEARBOX_SETTINGS, type GearboxSetting } from '../sim/vehicle/drivetrain';

type Group =
  | 'menu'
  | 'back'
  | 'controller'
  | 'touchDrive'
  | 'touchSide'
  | 'quality'
  | 'mirrors'
  | 'headMotion'
  | 'volume'
  | 'units'
  | 'hudStyle'
  | 'uiSize'
  | 'gearbox'
  | 'episode'
  | 'start'
  | 'setup'
  | 'vehicle'
  | 'damage'
  | 'time'
  | 'weather'
  | 'pack'
  | 'packFuel'
  | 'packCans'
  | 'packSpares'
  | 'packPlugs'
  | 'packStandard'
  | 'drive';

/** The packing list's rows: what each is, and how it reads. */
const packItems: { item: keyof EpisodeLoadout; group: Group; label: string; show: (n: number) => string }[] =
  [
    { item: 'fuel', group: 'packFuel', label: 'Fuel in the tank', show: (n) => `${Math.round(n)} L` },
    { item: 'jerryCans', group: 'packCans', label: 'Jerry cans (20 L)', show: (n) => String(n) },
    { item: 'spares', group: 'packSpares', label: 'Spare wheels', show: (n) => String(n) },
    { item: 'plugs', group: 'packPlugs', label: 'Tyre plugs', show: (n) => String(n) },
  ];
const packGroups = packItems.map((p) => p.group);

/** The full choice: the launch, plus the damage setting (it decides how an episode can end). */
export interface WelcomeChoice extends LaunchChoice {
  damage: DamageMode;
  /** Continue returns to the saved camp without another briefing confirmation. */
  quickStart?: boolean;
  inputDevice?: 'keyboard' | 'gamepad' | 'touch';
}

/**
 * Camp title, main menu and journey setup. The first gesture starts quiet ambience;
 * Continue loads the saved camp, while New Journey opens episode and vehicle choices.
 * Keyboard, touch and gamepad share the same selection and focus state.
 */
export class WelcomeScreen {
  readonly el: HTMLElement;
  private choice: WelcomeChoice;
  /** Replaying: the time and weather picked (story when `replay` is null). */
  private time: TimeOfDay | 'story';
  private weather: (typeof weathers)[number] = 'clear';
  private rows: (HTMLButtonElement | HTMLInputElement)[][] = [];
  private page: 'title' | 'menu' | 'journey' | 'settings' = 'title';
  private settings: Settings;
  private ambience: TitleAmbience | null = null;
  private inputMode: 'keyboard' | 'touch' | 'gamepad' = isTouchDevice() ? 'touch' : 'keyboard';
  private padConnected = false;
  private row = 0;
  private col = 0;
  /** The main menu item the open page was reached from: Back returns the highlight to it. */
  private menuFrom = '';
  private padPrev: boolean[] = [];
  private readonly padStick = new MenuStick();
  private raf = 0;
  private done = false;
  private setupOpen = true;
  private packOpen = false;
  /** Loads packed by hand, per episode and vehicle, kept in the save when a run starts. */
  private packs: SavedPacks;
  /** Test mode (`?dev`): every episode open, and conditions to pick for any of them. */
  private readonly dev = isDevMode();

  constructor(
    root: HTMLElement,
    private readonly initial: WelcomeChoice,
    private readonly save: SaveData | null,
    private readonly onDrive: (choice: WelcomeChoice, audio?: AudioContext) => void,
  ) {
    this.choice = { ...initial };
    this.packs = { ...save?.packs };
    this.settings = {
      ...defaultSettings,
      quality: isTouchDevice() ? touchTuning.defaultQuality : defaultSettings.quality,
      ...save?.settings,
    };
    this.time = initial.replay?.time ?? this.storyTime(initial.episode);
    this.weather = initial.replay?.weather ?? 'clear';
    this.el = document.createElement('div');
    this.el.className = 'welcome';
    this.el.tabIndex = -1;
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) =>
      this.setInputMode(e.pointerType === 'touch' ? 'touch' : 'keyboard'),
    );
    this.el.addEventListener('click', (e) => {
      if (this.page === 'title') return this.openMenu();
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.disabled) this.activate(b);
    });
    this.el.addEventListener('input', (e) => {
      const slider = e.target as HTMLInputElement;
      if (slider.dataset.group !== 'volume') return;
      this.settings.masterVolume = Number(slider.value);
      this.persistSettings();
      this.el.querySelector('output')!.textContent = `${Math.round(this.settings.masterVolume * 100)}%`;
    });
    this.el.addEventListener('focusin', (e) => {
      const button = e.target as HTMLButtonElement | HTMLInputElement;
      const row = this.rows.findIndex((r) => r.includes(button));
      if (row < 0) return;
      this.row = row;
      this.col = this.rows[row].indexOf(button);
      this.refresh();
    });
    window.addEventListener('keydown', this.onKey);
    this.render();
    this.raf = requestAnimationFrame(this.pollPad);
  }

  /** A level with a goal has its story's own conditions; a playground has only picked ones. */
  private storyTime(episode: EpisodeId): TimeOfDay | 'story' {
    return episodes[episode].goal ? 'story' : defaultConditions.time;
  }

  private get progress() {
    return this.save?.episodes[this.choice.episode];
  }

  private readonly logo = `<div class="title-logo" role="img" aria-label="4WD Simulator"><svg class="title-compass" viewBox="0 0 80 80" aria-hidden="true"><path d="M40 0 46 33 80 40 47 46 40 80 33 47 0 40 33 33Z" fill="currentColor"/><path d="M40 0V40H80L47 46 40 80V40H0L33 33Z" fill="#f7dec0"/></svg><h1><span>4WD</span><span>Simulator</span></h1><div class="title-rule" aria-hidden="true">◆</div></div>`;

  private get gamepadMenuHint(): string {
    const p = controllers[this.settings.controller];
    const confirm = this.settings.controller === 'generic' ? '1' : p.confirm;
    const back = this.settings.controller === 'generic' ? '2' : p.back;
    return `<b role="img" aria-label="${p.confirmName}" title="${p.confirmName}">${confirm}</b> Select <b role="img" aria-label="${p.backName}" title="${p.backName}">${back}</b> Back`;
  }

  private get inputHint(): string {
    return this.inputMode === 'gamepad'
      ? this.gamepadMenuHint
      : this.inputMode === 'touch'
        ? 'Tap to select'
        : '<b>Enter</b> Select <b>Esc</b> Back';
  }

  private setInputMode(device: 'keyboard' | 'gamepad' | 'touch'): void {
    if (this.inputMode === device) return;
    this.inputMode = device;
    this.el.dataset.input = device;
    const hint = this.el.querySelector('.title-input-hint');
    if (hint) hint.innerHTML = this.inputHint;
  }

  private openMenu(): void {
    if (!this.ambience) {
      try {
        this.ambience = new TitleAmbience(this.settings);
      } catch {
        /* Silent play is supported. */
      }
    }
    this.page = 'menu';
    this.render();
  }

  private persistSettings(): void {
    const saved = loadSave() ?? {
      version: 1 as const,
      settings: this.settings,
      episode: this.initial.episode,
      vehicle: this.initial.vehicle,
      episodes: {},
      replay: null,
    };
    if (!this.dev) writeSave({ ...saved, settings: this.settings });
    this.ambience?.setSettings(this.settings);
  }

  private render(focusGroup?: Group): void {
    this.el.dataset.screen = this.page;
    this.el.dataset.input = this.inputMode;
    if (this.page === 'journey') return this.renderJourney(focusGroup ?? 'drive');
    const hasCamp = !!this.save?.episodes[this.initial.episode]?.checkpoint;
    const hint = this.inputHint;
    if (this.page === 'settings') {
      const setting = (group: Group, value: string, label: string, on: boolean) =>
        `<button type="button" class="welcome-option ${on ? 'on' : ''}" aria-pressed="${on}" data-group="${group}" data-value="${value}">${label}</button>`;
      // The two phone settings are only for a touch screen: a television has no use for them.
      // They come first, so a sideways phone shows them without scrolling (v2.07).
      const phone = isTouchDevice()
        ? `<section class="title-setting phone-driving-setting"><h3>Phone driving</h3><div class="welcome-options seg">${touchDriveSchemes.map((c) => setting('touchDrive', c, touchDriveLabels[c], this.settings.touchDrive === c)).join('')}</div></section>
          <section class="title-setting phone-driving-setting"><h3>Joystick side</h3><div class="welcome-options seg">${touchStickSides.map((c) => setting('touchSide', c, touchStickSideLabels[c], this.settings.touchStickSide === c)).join('')}</div></section>`
        : '';
      this.el.innerHTML = `<div class="title-settings title-panel"><button class="title-back" data-group="back">‹ Back</button><p class="title-eyebrow">4WD Simulator</p><h2>Settings</h2>
        ${phone}
        <section class="title-setting"><h3>Graphics</h3><div class="welcome-options seg">${offeredQualities(
          isTouchDevice(),
        )
          .map((q) =>
            setting(
              'quality',
              q,
              q[0].toUpperCase() + q.slice(1),
              shownQuality(this.settings.quality, isTouchDevice()) === q,
            ),
          )
          .join('')}</div></section>
        <section class="title-setting"><h3>Cockpit mirrors</h3><div class="welcome-options seg">${setting('mirrors', 'on', 'On', this.settings.mirrors)}${setting('mirrors', 'off', 'Off', !this.settings.mirrors)}</div></section>
        <section class="title-setting"><h3>Cockpit head motion</h3><div class="welcome-options seg">${setting('headMotion', 'on', 'On', this.settings.headMotion)}${setting('headMotion', 'off', 'Off', !this.settings.headMotion)}</div></section>
        <section class="title-setting"><label for="title-volume">Master volume <output for="title-volume">${Math.round(this.settings.masterVolume * 100)}%</output></label><input id="title-volume" type="range" min="0" max="1" step="0.1" value="${this.settings.masterVolume}" data-group="volume" /></section>
        <section class="title-setting"><h3>Controller type</h3><div class="welcome-options seg">${controllerTypes.map((c) => setting('controller', c, controllers[c].label, this.settings.controller === c)).join('')}</div></section>
        <section class="title-setting"><h3>Speed units</h3><div class="welcome-options seg">${setting('units', 'kmh', 'km/h', this.settings.units === 'kmh')}${setting('units', 'mph', 'mph', this.settings.units === 'mph')}</div></section>
        <section class="title-setting ui-size-setting"><h3>UI size</h3><div class="welcome-options seg">${uiSizes.map((z) => setting('uiSize', z, uiSizeLabels[z], this.settings.uiSize === z)).join('')}</div></section>
        <section class="title-setting"><h3>HUD style</h3><div class="welcome-options seg">${pickableHudStyles.map((h) => setting('hudStyle', h, hudStyleLabels[h], this.settings.hudStyle === h)).join('')}</div></section>
        ${
          showGearboxSetting(this.padConnected)
            ? `<section class="title-setting gearbox-setting"><h3>Gearbox</h3><div class="welcome-options seg">${GEARBOX_SETTINGS.map((m) => setting('gearbox', m, gearboxLabels[m], this.settings.gearbox === m)).join('')}</div><p class="welcome-note gearbox-note">${gearboxNote(this.settings.gearbox)}</p></section>`
            : ''
        }
        <p class="title-settings-version" title="Build ${BUILD_LABEL}">${GAME_VERSION}</p>
      </div><p class="title-input-hint">${hint}</p>`;
      this.setRows(
        [
          'back',
          'touchDrive',
          'touchSide',
          'quality',
          'mirrors',
          'headMotion',
          'volume',
          'controller',
          'units',
          'uiSize',
          'hudStyle',
          'gearbox',
        ],
        focusGroup ?? 'quality',
      );
      return;
    }
    this.el.innerHTML = `<div class="title-home">${this.logo}${
      this.page === 'title'
        ? `<button type="button" class="title-begin" data-title-begin>${this.inputMode === 'touch' ? 'Tap to begin' : 'Press any button'}</button>`
        : `<nav class="title-menu" aria-label="Main menu"><button type="button" data-group="menu" data-value="continue" data-title-continue ${hasCamp ? '' : 'disabled'}>Continue</button><button type="button" data-group="menu" data-value="journey" data-title-journey>New drive</button><button type="button" data-group="menu" data-value="settings">Settings</button></nav>`
    }
      </div><p class="title-version" title="Build ${BUILD_LABEL}">${GAME_VERSION}</p>${this.page === 'menu' ? `<p class="title-input-hint">${hint}</p>` : ''}`;
    if (this.page === 'menu') {
      this.setRows(['menu'], 'menu');
      // Back from a page: onto the item it was opened from.
      const from = this.rows[0]?.findIndex((b) => b.dataset.value === this.menuFrom) ?? -1;
      if (from >= 0) {
        this.col = from;
        this.refresh();
        this.rows[0][from].focus({ preventScroll: true });
      }
    } else {
      this.rows = [];
      this.el.focus({ preventScroll: true });
    }
  }

  private setRows(groups: Group[], focusGroup: Group): void {
    this.rows = groups
      .map((g) =>
        [
          ...this.el.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
            `[data-group="${g}"]:not([disabled])`,
          ),
        ].filter((b) => !b.closest('[hidden]')),
      )
      .filter((r) => r.length > 0)
      // Up and down follow the screen, whatever order the groups were listed in.
      .sort((a, b) => a[0].getBoundingClientRect().top - b[0].getBoundingClientRect().top);
    this.row = Math.max(
      0,
      this.rows.findIndex((r) => r[0].dataset.group === focusGroup),
    );
    this.col = Math.max(0, this.rows[this.row]?.findIndex((b) => this.chosen(b)) ?? 0);
    this.refresh();
    this.rows[this.row]?.[this.col]?.focus({ preventScroll: true });
  }

  /** Episode and vehicle setup follows New Journey, away from the title menu. */
  private renderJourney(focusGroup?: Group): void {
    const keep = focusGroup ?? (this.rows[this.row]?.[0]?.dataset.group as Group | undefined);
    const option = (group: Group, value: string, label: string, note = '', disabled = false) =>
      `<button type="button" class="welcome-option" data-group="${group}" data-value="${value}"${disabled ? ' disabled' : ''}>${label}${note ? `<small>${note}</small>` : ''}</button>`;
    const def = episodes[this.choice.episode];
    // Packing only matters where fuel is burnt.
    const packed = def.fuelScale > 0;
    const progress = this.progress;
    const camp = progress?.checkpoint
      ? maps[def.mapId].def.pois.find((p) => p.id === progress.checkpoint?.camp)
      : null;
    const episodeButtons = [
      ...episodeOrder.map((id) => {
        const e = episodes[id];
        const p = this.save?.episodes[id];
        const status = p?.completed ? 'Finished' : p?.checkpoint ? 'Under way' : '';
        return option('episode', id, e.goal ? `${e.number}. ${e.title}` : e.title, status);
      }),
    ].join('');
    const story = `${weatherLabels[def.weather]}${def.storm ? `, ${def.storm.forecast}` : ''}, from ${clockTime(def.startHour)}${def.deadline ? ` · ${def.deadline.label.toLowerCase()}` : ''}`;
    this.el.innerHTML = `
      <div class="welcome-card title-panel">
        <button type="button" class="title-back" data-group="back">‹ Back</button>
        <p class="title-eyebrow">4WD Simulator</p>
        <h1>New drive</h1>
        <div class="welcome-grid">
          <section class="welcome-section welcome-episodes">
            <h2>Choose a level</h2>
            <div class="welcome-options">${episodeButtons}</div>
          </section>
          <section class="welcome-section welcome-trip">
            <p class="welcome-kicker">${def.goal ? `Episode ${def.number}` : 'Playground'}</p>
            <h2>${def.title}</h2>
            <p class="welcome-route">${def.route}</p>
            <p class="welcome-mission">${def.goal ? def.mission : maps[def.mapId].blurb}</p>
            <div class="welcome-options seg welcome-start">${
              camp ? option('start', 'resume', 'Continue', `From ${camp.name}`) : ''
            }${
              // A playground with no camp reached yet has one way to start: no choice to show.
              camp || def.goal ? option('start', 'new', camp ? 'Start again' : 'Start') : ''
            }${
              // The Army supply run needs the camp it delivers to.
              maps[def.mapId].def.pois.some((p) => p.id === supplyRun.goal)
                ? option(
                    'start',
                    'supply',
                    'Army supply run',
                    `Tow ${supplyRun.drums} fuel drums to Wujal Wujal`,
                  )
                : ''
            }</div>
            <button type="button" class="welcome-drive" data-group="drive" data-welcome-drive>${camp && this.choice.resume ? 'Continue' : def.goal ? 'Load episode' : 'Load level'}</button>
          </section>
        </div>
        <button type="button" class="welcome-setup-toggle" data-group="setup" aria-expanded="${this.setupOpen}" aria-controls="welcome-setup"><span>${def.goal ? 'Vehicle & difficulty' : 'Vehicle, damage & conditions'}</span><span>${vehicles[this.choice.vehicle].tuning.name} · ${damageLabels[this.choice.damage]} <b aria-hidden="true">${this.setupOpen ? '−' : '+'}</b></span></button>
        <section id="welcome-setup" class="welcome-section welcome-setup" ${this.setupOpen ? '' : 'hidden'}>
            <h2>Vehicle</h2>
            <div class="welcome-options seg">${vehicleOrder.map((id) => option('vehicle', id, vehicles[id].tuning.name)).join('')}</div>
            <p class="welcome-note">${vehicles[this.choice.vehicle].blurb}</p>
            <h2>${def.goal ? 'Difficulty' : 'Damage'}</h2>
            <div class="welcome-options seg">${damageModes.map((m) => option('damage', m, damageLabels[m])).join('')}</div>
            <details class="welcome-rules"><summary>${def.goal ? 'About difficulty' : 'About damage'}</summary><p class="welcome-note damage-note"></p></details>
            <h2>Conditions</h2>
            <div class="welcome-options seg">${def.goal ? option('time', 'story', 'Story', story) : ''}${timesOfDay.map((t) => option('time', t, timeLabels[t])).join('')}</div>
            ${this.time === 'story' ? '' : `<div class="welcome-options seg">${weathers.map((w) => option('weather', w, weatherLabels[w])).join('')}</div>`}
            <p class="welcome-note">${this.time === 'story' || !def.goal ? '' : 'No time limit.'}</p>
        </section>
        ${packed ? this.packHtml() : ''}
        ${this.dev ? '<p class="welcome-note dev-note">Test mode: nothing you do is saved.</p>' : ''}
        <p class="build-label" title="Build ${BUILD_LABEL}">Version ${GAME_VERSION}</p>
      </div>`;
    const groups: Group[] = [
      'back',
      'episode',
      'start',
      'setup',
      ...(this.setupOpen ? (['vehicle', 'damage', 'time', 'weather'] as const) : []),
      ...(packed ? (['pack'] as const) : []),
      ...(packed && this.packOpen ? [...packGroups, 'packStandard' as const] : []),
      'drive',
    ];
    this.setRows(groups, keep ?? 'drive');
  }

  /**
   * The load for a new run: the one packed by hand for this episode and vehicle, or the
   * episode's standard load. Never another episode's (v2.23).
   */
  private get load(): EpisodeLoadout {
    const { episode, vehicle } = this.choice;
    return packFor(this.packs, episode, episodes[episode].loadout, vehicle);
  }

  /** The packing list: a row of − and + for each item, and the weight against the limit. */
  private packHtml(): string {
    const standard = episodes[this.choice.episode].loadout;
    const v = this.choice.vehicle;
    const l = this.load;
    const kg = Math.round(loadKg(l, v));
    const limit = Math.round(packLimitKg(standard, v));
    const base = Math.round(loadKg(vehicleLoadout(standard, v), v));
    const summary = `${Math.round(l.fuel)} L · ${l.jerryCans} can${l.jerryCans === 1 ? '' : 's'} · ${l.spares} spare${l.spares === 1 ? '' : 's'} · ${l.plugs} plug${l.plugs === 1 ? '' : 's'}`;
    const step = (item: keyof EpisodeLoadout, group: Group, dir: 1 | -1, label: string) =>
      `<button type="button" class="welcome-option pack-step" data-group="${group}" data-value="${item}:${dir}" aria-label="${dir > 0 ? 'More' : 'Less'} ${label.toLowerCase()}"${stepPack(l, item, dir, standard, v) ? '' : ' disabled'}>${dir > 0 ? '+' : '−'}</button>`;
    const rows = packItems
      .map(
        (p) =>
          `<div class="pack-row" data-pack="${p.item}"><span class="pack-label">${p.label}</span>${step(p.item, p.group, -1, p.label)}<output class="pack-count">${p.show(l[p.item])}</output>${step(p.item, p.group, 1, p.label)}</div>`,
      )
      .join('');
    const weight =
      kg > base
        ? `${kg - base} kg heavier than the standard load`
        : kg < base
          ? `${base - kg} kg lighter than the standard load`
          : 'The standard load';
    return `<button type="button" class="welcome-setup-toggle" data-group="pack" aria-expanded="${this.packOpen}" aria-controls="welcome-pack"><span>Packing</span><span>${summary} <b aria-hidden="true">${this.packOpen ? '−' : '+'}</b></span></button>
        <section id="welcome-pack" class="welcome-section welcome-setup welcome-pack" ${this.packOpen ? '' : 'hidden'}>
            <h2>What you take</h2>
            ${rows}
            <div class="pack-weight"><span>Load ${kg} kg of ${limit} kg</span><span class="pack-bar"><i style="width:${Math.min(100, Math.round((100 * kg) / limit))}%"></i></span></div>
            <p class="welcome-note">${weight}. Weight sinks the car deeper in the mud, slows it on the climbs and works the engine harder. The finish scores the fuel and kit you keep out of what you packed. A run restarted from a camp keeps its load; a new run takes this one.</p>
            <div class="welcome-options seg"><button type="button" class="welcome-option" data-group="packStandard" data-value="standard">Standard load</button></div>
        </section>`;
  }

  /** Is this option the one chosen in its group? */
  private chosen(b: HTMLButtonElement | HTMLInputElement): boolean {
    const v = b.dataset.value;
    switch (b.dataset.group as Group) {
      case 'controller':
        return v === this.settings.controller;
      case 'touchDrive':
        return v === this.settings.touchDrive;
      case 'touchSide':
        return v === this.settings.touchStickSide;
      case 'quality':
        return v === shownQuality(this.settings.quality, isTouchDevice());
      case 'mirrors':
        return v === (this.settings.mirrors ? 'on' : 'off');
      case 'headMotion':
        return v === (this.settings.headMotion ? 'on' : 'off');
      case 'units':
        return v === this.settings.units;
      case 'hudStyle':
        return v === this.settings.hudStyle;
      case 'uiSize':
        return v === this.settings.uiSize;
      case 'gearbox':
        return v === this.settings.gearbox;
      case 'episode':
        return v === this.choice.episode;
      case 'start':
        return v === (this.choice.resume ? 'resume' : this.choice.supply ? 'supply' : 'new');
      case 'vehicle':
        return v === this.choice.vehicle;
      case 'damage':
        return v === this.choice.damage;
      case 'time':
        return v === this.time;
      case 'weather':
        return v === this.weather;
      default:
        return false;
    }
  }

  private activate(b: HTMLButtonElement | HTMLInputElement): void {
    if (this.done) return;
    const group = b.dataset.group as Group;
    const value = b.dataset.value ?? '';
    if (group === 'back') {
      this.page = 'menu';
      this.render();
      return;
    }
    if (group === 'menu') {
      if (value === 'continue') {
        this.choice = { ...this.initial, damage: this.settings.damage, resume: true };
        this.time = this.initial.replay?.time ?? this.storyTime(this.initial.episode);
        this.weather = this.initial.replay?.weather ?? 'clear';
        return this.drive(true);
      }
      this.page = value === 'settings' ? 'settings' : 'journey';
      this.menuFrom = value;
      if (this.page === 'journey') this.choice.resume = false;
      this.render();
      return;
    }
    if (
      group === 'quality' ||
      group === 'mirrors' ||
      group === 'headMotion' ||
      group === 'units' ||
      group === 'controller' ||
      group === 'touchDrive' ||
      group === 'touchSide' ||
      group === 'hudStyle' ||
      group === 'uiSize' ||
      group === 'gearbox'
    ) {
      if (group === 'quality') this.settings.quality = value as Settings['quality'];
      else if (group === 'mirrors') this.settings.mirrors = value === 'on';
      else if (group === 'headMotion') this.settings.headMotion = value === 'on';
      else if (group === 'controller') this.settings.controller = value as ControllerType;
      else if (group === 'touchDrive') this.settings.touchDrive = value as TouchDriveScheme;
      else if (group === 'touchSide') this.settings.touchStickSide = value as TouchStickSide;
      else if (group === 'gearbox') this.settings.gearbox = value as GearboxSetting;
      else if (group === 'uiSize') {
        this.settings.uiSize = value as UiSize;
        applyUiSize(this.settings.uiSize);
      } else if (group === 'hudStyle') {
        this.settings.hudStyle = value as HudStyle;
        applyHudStyle(this.settings.hudStyle);
      } else this.settings.units = value as Settings['units'];
      this.persistSettings();
      this.render(group);
      return;
    }
    if (group === 'drive') return this.drive();
    if (group === 'setup') {
      this.setupOpen = !this.setupOpen;
      this.render('setup');
      return;
    }
    if (group === 'pack') {
      this.packOpen = !this.packOpen;
      this.render('pack');
      return;
    }
    if (packGroups.includes(group) || group === 'packStandard') {
      const standard = episodes[this.choice.episode].loadout;
      const v = this.choice.vehicle;
      const [item, dir] = value.split(':') as [keyof EpisodeLoadout, string];
      const next =
        group === 'packStandard'
          ? vehicleLoadout(standard, v)
          : stepPack(this.load, item, dir === '1' ? 1 : -1, standard, v);
      if (next) {
        this.packs = rememberPack(this.packs, this.choice.episode, standard, v, next);
        this.choice.load = this.load;
      }
      // Stay on the button pressed, even when it can't go further now.
      const col = this.col;
      const row = this.row;
      this.render(group);
      if (group !== 'packStandard') this.focusPackStep(group, value, row, col);
      return;
    }
    if (group === 'episode') {
      this.choice.episode = value as EpisodeId;
      this.choice.resume = false;
      this.choice.supply = false;
      if (this.time === 'story') this.time = this.storyTime(this.choice.episode);
      // Each episode has its own load.
      this.choice.load = this.load;
    } else if (group === 'start') {
      this.choice.resume = value === 'resume';
      this.choice.supply = value === 'supply';
    } else if (group === 'vehicle') {
      this.choice.vehicle = value as WelcomeChoice['vehicle'];
      // Each vehicle keeps its own packing.
      this.choice.load = this.load;
    } else if (group === 'damage') this.choice.damage = value as DamageMode;
    else if (group === 'time') this.time = value as TimeOfDay | 'story';
    else if (group === 'weather') this.weather = value as (typeof weathers)[number];
    this.render(group);
  }

  /** Back on the − or + just pressed, or the nearest one still open. */
  private focusPackStep(group: Group, value: string, row: number, col: number): void {
    const flat = this.rows.flat();
    const same = flat.find((b) => b.dataset.group === group && b.dataset.value === value);
    const at = same ?? this.rows[row]?.[Math.min(col, (this.rows[row]?.length ?? 1) - 1)];
    if (!at) return;
    this.row = this.rows.findIndex((r) => r.includes(at));
    this.col = this.rows[this.row].indexOf(at);
    this.refresh();
    at.focus({ preventScroll: true });
  }

  /** Mark the chosen option in each group, and the focused one. */
  private refresh(): void {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.welcome-option')) {
      const on = this.chosen(b);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.rows.flat().forEach((b) => b.classList.remove('focused'));
    this.rows[this.row]?.[this.col]?.classList.add('focused');
    const note = this.el.querySelector('.damage-note') as HTMLElement | null;
    if (note) note.textContent = damageNotes[this.choice.damage];
  }

  private move(dRow: number, dCol: number): void {
    if (this.page === 'menu') {
      dCol = dRow || dCol;
      dRow = 0;
    }
    const line = dRow ? this.lineStep(dRow) : -1;
    if (line >= 0) this.col = line;
    else if (dRow) {
      this.row = Math.max(0, Math.min(this.rows.length - 1, this.row + dRow));
      // Land on the chosen option of the new row.
      const on = this.rows[this.row].findIndex((b) => this.chosen(b));
      this.col = Math.max(0, on);
    } else if (this.rows[this.row][this.col] instanceof HTMLInputElement) {
      const input = this.rows[this.row][this.col] as HTMLInputElement;
      input.value = String(Math.max(0, Math.min(1, Number(input.value) + dCol * 0.1)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const col = Math.max(0, Math.min(this.rows[this.row].length - 1, this.col + dCol));
      const moved = col !== this.col;
      this.col = col;
      // On the Settings page a setting changes as the highlight moves along it, as in the pause menu.
      if (moved && this.page === 'settings') return this.activate(this.rows[this.row][col]);
    }
    this.rows[this.row][this.col]?.focus();
    this.refresh();
  }

  /** The option straight above or below in the same group, when it wraps over lines; else -1. */
  private lineStep(dRow: number): number {
    const row = this.rows[this.row];
    const cur = row[this.col]?.getBoundingClientRect();
    if (!cur) return -1;
    const beyond = (r: DOMRect) => (dRow > 0 ? r.top >= cur.bottom - 1 : r.bottom <= cur.top + 1);
    const centre = (r: DOMRect) => r.left + r.width / 2;
    let best = -1;
    let bestGap = Infinity;
    let bestDx = Infinity;
    row.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      if (!beyond(r)) return;
      const gap = dRow > 0 ? r.top - cur.top : cur.top - r.top;
      const dx = Math.abs(centre(r) - centre(cur));
      if (gap < bestGap - 1 || (gap <= bestGap + 1 && dx < bestDx)) {
        best = i;
        bestGap = gap;
        bestDx = dx;
      }
    });
    return best;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.done) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    this.setInputMode('keyboard');
    if (this.page === 'title') {
      if (e.repeat || ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(e.key)) return;
      e.preventDefault();
      this.openMenu();
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      this.page = this.page === 'menu' ? 'title' : 'menu';
      this.render();
      return;
    }
    if (e.target instanceof HTMLInputElement && ['ArrowLeft', 'ArrowRight'].includes(e.code)) return;
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
    // The Gearbox setting appears while a controller is connected.
    if (!!pad !== this.padConnected) {
      this.padConnected = !!pad;
      if (this.page === 'settings') this.render(this.rows[this.row]?.[0]?.dataset.group as Group | undefined);
    }
    if (pad) {
      const pressed = pad.buttons.map((b) => b.pressed);
      const edge = (i: number) => pressed[i] && !this.padPrev[i];
      if (pressed.some(Boolean)) this.setInputMode('gamepad');
      if (this.page === 'title') {
        if (pressed.some((p, i) => p && !this.padPrev[i])) this.openMenu();
        this.padPrev = pressed;
        this.raf = requestAnimationFrame(this.pollPad);
        return;
      }
      // Standard mapping: 12-15 d-pad up, down, left, right; 0 = Cross; 9 = Options.
      if (edge(12)) this.move(-1, 0);
      if (edge(13)) this.move(1, 0);
      if (edge(14)) this.move(0, -1);
      if (edge(15)) this.move(0, 1);
      const stick = this.padStick.step(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      if (stick) {
        this.setInputMode('gamepad');
        if (stick === 'menuUp') this.move(-1, 0);
        else if (stick === 'menuDown') this.move(1, 0);
        else if (stick === 'menuLeft') this.move(0, -1);
        else this.move(0, 1);
      }
      if (edge(1)) {
        this.page = this.page === 'menu' ? 'title' : 'menu';
        this.render();
      } else if (edge(0) || edge(9)) {
        if (edge(9) && this.page === 'journey') this.drive();
        else this.activate(this.rows[this.row][this.col]);
      }
      this.padPrev = pressed;
    }
    this.raf = requestAnimationFrame(this.pollPad);
  };

  private drive(quickStart = false): void {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.settings.damage = this.choice.damage;
    this.persistSettings();
    const audio = this.ambience?.leave();
    this.el.classList.add('hidden');
    setTimeout(() => this.el.remove(), 400);
    const replay = this.time !== 'story' ? { time: this.time, weather: this.weather } : null;
    this.onDrive(
      { ...this.choice, replay, quickStart, settings: { ...this.settings }, inputDevice: this.inputMode },
      audio,
    );
  }
}
