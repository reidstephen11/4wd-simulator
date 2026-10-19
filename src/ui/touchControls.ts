import type { Action } from '../data/controls';
import type { InputManager } from '../sim/input/inputManager';
import { TouchStick } from '../sim/input/touchStick';
import type { ToolMode } from '../core/toolController';

/** Does this look like a phone or tablet? `?touch` in the address forces it for testing. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(location.search).has('touch')) return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export interface TouchControlsState {
  /** A menu, the map or the tool menu covers the screen. */
  covered: boolean;
  mode: ToolMode;
  lowRange: boolean;
  parkBrake: boolean;
  frontLocked: boolean;
  rearLocked: boolean;
  precision: boolean;
  winchAttached: boolean;
  jackAvailable: boolean;
}

/**
 * On-screen controls for phones and tablets (SPEC §10): a joystick for steering under the
 * left thumb, GAS and BRAKE pedals under the right, and buttons for everything else. They
 * show on touch screens and whenever the screen is touched, and hide again when a key or
 * a gamepad is used. They feed the same InputManager as the keyboard, so driving behaves
 * the same.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private active = false;
  private covered = false;
  private readonly stick = new TouchStick();
  private stickPointer: number | null = null;
  private readonly stickBase: HTMLElement;
  private readonly knob: HTMLElement;
  /** Pointer ids holding each hold button down. */
  private readonly holds = new Map<HTMLElement, number>();
  private lastKey = '';

  constructor(
    root: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'touch-controls hidden';
    this.el.innerHTML = `
      <div class="touch-top">
        <button type="button" class="touch-btn" data-tap="pause" aria-label="Pause">II</button>
        <button type="button" class="touch-btn" data-tap="map">MAP</button>
        <button type="button" class="touch-btn touch-fullscreen" aria-label="Full screen" hidden>⛶</button>
      </div>
      <div class="touch-stick" aria-label="Steering"><div class="touch-stick-base"><div class="touch-stick-knob"></div></div></div>
      <div class="touch-right">
        <div class="touch-grid touch-drive">
          <button type="button" class="touch-btn" data-tap="handbrake" data-state="parkBrake">HAND</button>
          <button type="button" class="touch-btn" data-tap="range" data-state="lowRange">LOW</button>
          <button type="button" class="touch-btn" data-tap="precision" data-state="precision">CRAWL</button>
          <button type="button" class="touch-btn" data-tap="frontDiff" data-state="frontLocked">F LOCK</button>
          <button type="button" class="touch-btn" data-tap="rearDiff" data-state="rearLocked">R LOCK</button>
          <button type="button" class="touch-btn" data-tap="toolMenu">TOOLS</button>
          <button type="button" class="touch-btn" data-tap="winch interact" title="Winch, pick up planks">USE</button>
          <button type="button" class="touch-btn" data-hold="winchIn" data-show="winchAttached">IN</button>
          <button type="button" class="touch-btn" data-hold="winchOut" data-show="winchAttached">OUT</button>
          <button type="button" class="touch-btn touch-wide" data-hold="jack" data-show="jackAvailable">UPRIGHT</button>
        </div>
        <div class="touch-pedals touch-drive">
          <button type="button" class="touch-btn touch-pedal touch-brake" data-hold="brake">BRAKE</button>
          <button type="button" class="touch-btn touch-pedal touch-gas" data-hold="accelerate">GAS</button>
        </div>
        <div class="touch-pedals touch-tool">
          <button type="button" class="touch-btn touch-pedal" data-tap="back">BACK</button>
          <button type="button" class="touch-btn touch-pedal touch-gas" data-tap="confirm">USE</button>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.stickBase = this.el.querySelector('.touch-stick-base') as HTMLElement;
    this.knob = this.el.querySelector('.touch-stick-knob') as HTMLElement;

    // Long presses must not open the text-selection or context menu.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-tap]')) {
      const actions = (b.dataset.tap as string).split(' ') as Action[];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        for (const a of actions) this.input.touchPress(a);
        b.classList.add('down');
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    }
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-hold]')) {
      const action = b.dataset.hold as Action;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.holds.has(b)) return;
        this.holds.set(b, e.pointerId);
        capture(b, e.pointerId);
        b.classList.add('down');
        this.input.touchHold(action, true);
      });
      const up = (e: PointerEvent) => {
        if (this.holds.get(b) === e.pointerId) this.release(b);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }

    const zone = this.el.querySelector('.touch-stick') as HTMLElement;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      capture(zone, e.pointerId);
      this.moveStick(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickPointer) this.releaseStick();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);

    const full = this.el.querySelector('.touch-fullscreen') as HTMLButtonElement;
    full.hidden = !document.fullscreenEnabled;
    full.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    });

    this.setActive(isTouchDevice());
    input.onDeviceChange((d) => this.setActive(d === 'touch'));
  }

  get visible(): boolean {
    return this.active && !this.covered;
  }

  /** Show the controls (a touch screen is in use) or hide them (keys or a gamepad). */
  setActive(on: boolean): void {
    this.active = on;
    document.body.classList.toggle('touch-mode', on);
    this.refresh();
  }

  /** Once per frame: what the buttons should show. */
  update(s: TouchControlsState): void {
    if (s.covered !== this.covered) {
      this.covered = s.covered;
      this.refresh();
    }
    if (!this.visible) return;
    const key = JSON.stringify(s);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const tool = s.mode !== 'drive';
    this.el.classList.toggle('tool-mode', tool);
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-state]'))
      b.setAttribute('aria-pressed', String(s[b.dataset.state as keyof TouchControlsState] === true));
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-show]')) {
      const show = s[b.dataset.show as keyof TouchControlsState] === true;
      b.hidden = !show;
      if (!show && this.holds.has(b)) this.release(b);
    }
    // Pedals held while a tool mode starts would otherwise stay down.
    if (tool) for (const b of [...this.holds.keys()]) if (b.closest('.touch-drive')) this.release(b);
  }

  private refresh(): void {
    const show = this.visible;
    this.el.classList.toggle('hidden', !show);
    if (!show) {
      for (const b of [...this.holds.keys()]) this.release(b);
      this.releaseStick();
    }
  }

  private release(b: HTMLElement): void {
    const id = this.holds.get(b);
    this.holds.delete(b);
    b.classList.remove('down');
    if (id !== undefined && b.hasPointerCapture?.(id)) b.releasePointerCapture(id);
    this.input.touchHold(b.dataset.hold as Action, false);
  }

  private moveStick(e: PointerEvent): void {
    const r = this.stickBase.getBoundingClientRect();
    const presses = this.stick.move(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    this.input.touchJoystick(this.stick.x, this.stick.y, presses);
    this.drawKnob();
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.stick.release();
    this.input.touchJoystick(0, 0);
    this.drawKnob();
  }

  private drawKnob(): void {
    const k = this.stick.knob();
    this.knob.style.transform = `translate(${k.x}px, ${k.y}px)`;
  }
}

/** Keep getting a finger's events after it slides off the button (ignored if it has already lifted). */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The pointer is no longer active.
  }
}
