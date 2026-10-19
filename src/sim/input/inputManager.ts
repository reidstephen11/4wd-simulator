import { keyBindings, padBindings, padTuning, Pad, type Action } from '../../data/controls';
import { vehicleTuning, type VehicleTuning } from '../../data/vehicle';
import { emptyInput, SteeringSmoother, type VehicleInput } from './vehicleInput';

export type Device = 'keyboard' | 'gamepad' | 'touch';

/**
 * Reads keyboard, gamepad and the on-screen touch controls (SPEC §10) and turns them into
 * a VehicleInput for the locally controlled vehicle, plus edge-triggered UI actions. Tracks
 * which device was used last so prompts can show the right glyphs.
 */
export class InputManager {
  activeDevice: Device = 'keyboard';
  /** When false, vehicleInput() returns a neutral command (menus open, tool modes). */
  vehicleEnabled = true;
  private readonly keys = new Set<string>();
  private readonly vehicleEdges = new Set<Action>();
  /** UI presses since the last frame, counted so quick taps in one slow frame aren't lost. */
  private readonly uiEdges = new Map<Action, number>();
  private readonly padPrev: boolean[] = [];
  private padButtons: boolean[] = [];
  private padAxes: number[] = [0, 0, 0, 0];
  private padTriggers = { lt: 0, rt: 0 };
  private wheelDelta = 0;
  private steeringRates: VehicleTuning['steering'] = vehicleTuning.steering;
  private readonly steering = new SteeringSmoother(
    vehicleTuning.steering.keyboardRiseRate,
    vehicleTuning.steering.keyboardReturnRate,
  );
  private padSteer = 0;
  /** Touch buttons held down, and the touch joystick (-1..1, y down). */
  private readonly touchHeld = new Set<Action>();
  private touchStick = { x: 0, y: 0 };
  private deviceListeners: Array<(d: Device) => void> = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.setDevice('keyboard');
      for (const a of this.actionsForKey(e.code)) this.press(a);
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.touchHeld.clear();
      this.touchStick = { x: 0, y: 0 };
    });
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheelDelta += Math.sign(e.deltaY);
        this.setDevice('keyboard');
      },
      { passive: true },
    );
  }
  /** Use a vehicle's keyboard and gamepad steering rates. */
  setSteering(rates: VehicleTuning['steering']): void {
    this.steeringRates = rates;
    this.steering.riseRate = rates.keyboardRiseRate;
    this.steering.returnRate = rates.keyboardReturnRate;
  }

  onDeviceChange(fn: (d: Device) => void): void {
    this.deviceListeners.push(fn);
  }

  requestDriveAction(action: 'frontDiff' | 'rearDiff' | 'precision' | 'lights'): void {
    this.vehicleEdges.add(action);
  }

  /** A mouse or finger moved the camera or pressed a HUD button. */
  usePointer(type = 'mouse'): void {
    this.setDevice(type === 'touch' ? 'touch' : 'keyboard');
  }

  /** A touch button was tapped (or pressed down, for buttons that are held). */
  touchPress(a: Action): void {
    this.setDevice('touch');
    this.press(a);
  }

  /** A touch button that acts while held (pedals, winch in/out) went down or up. */
  touchHold(a: Action, down: boolean): void {
    if (down) {
      this.touchHeld.add(a);
      this.touchPress(a);
    } else this.touchHeld.delete(a);
  }

  /** The touch joystick moved (-1..1, y down); `presses` are menu steps it crossed. */
  touchJoystick(x: number, y: number, presses: readonly Action[] = []): void {
    this.touchStick = { x, y };
    if (x !== 0 || y !== 0) this.setDevice('touch');
    for (const a of presses) this.press(a);
  }

  private press(a: Action): void {
    if (this.vehicleEnabled) this.vehicleEdges.add(a);
    this.uiEdges.set(a, (this.uiEdges.get(a) ?? 0) + 1);
  }

  private setDevice(d: Device): void {
    if (d === this.activeDevice) return;
    this.activeDevice = d;
    for (const fn of this.deviceListeners) fn(d);
  }

  private actionsForKey(code: string): Action[] {
    const out: Action[] = [];
    for (const [a, codes] of Object.entries(keyBindings) as [Action, readonly string[]][])
      if (codes.includes(code)) out.push(a);
    return out;
  }

  /** Held on the keyboard or as an on-screen touch button. */
  private keyDown(a: Action): boolean {
    return keyBindings[a].some((c) => this.keys.has(c)) || this.touchHeld.has(a);
  }

  private padDown(a: Action): boolean {
    const b = padBindings[a];
    return !!b && b.some((i) => this.padButtons[i]);
  }

  /** Is an action held on any device? */
  held(a: Action): boolean {
    return this.keyDown(a) || this.padDown(a);
  }

  /** Poll the gamepad once per rendered frame. */
  poll(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected) ?? null;
    if (!pad) {
      this.padButtons = [];
      this.padAxes = [0, 0, 0, 0];
      this.padTriggers = { lt: 0, rt: 0 };
      return;
    }
    const dz = padTuning.stickDeadzone;
    const axis = (i: number) => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
    };
    this.padAxes = [axis(0), axis(1), axis(2), axis(3)];
    this.padButtons = pad.buttons.map((b) => b.pressed);
    const lt = pad.buttons[Pad.LT]?.value ?? 0;
    const rt = pad.buttons[Pad.RT]?.value ?? 0;
    this.padTriggers = {
      lt: lt < padTuning.triggerDeadzone ? 0 : lt,
      rt: rt < padTuning.triggerDeadzone ? 0 : rt,
    };
    let any = this.padAxes.some((a) => a !== 0) || this.padTriggers.lt > 0 || this.padTriggers.rt > 0;
    for (let i = 0; i < this.padButtons.length; i++) {
      if (this.padButtons[i]) any = true;
      if (this.padButtons[i] && !this.padPrev[i]) {
        for (const [a, list] of Object.entries(padBindings) as [Action, readonly number[]][]) {
          if (list.includes(i)) this.press(a);
        }
      }
      this.padPrev[i] = this.padButtons[i];
    }
    if (any) this.setDevice('gamepad');
  }

  /** Build the command for one sim step. Consumes vehicle edge actions. */
  vehicleInput(dt: number): VehicleInput {
    const inp = emptyInput();
    const edges = this.vehicleEdges;
    if (!this.vehicleEnabled) {
      edges.clear();
      this.steering.update(0, dt);
      inp.brake = 0;
      return inp;
    }
    inp.throttle = Math.max(this.keyDown('accelerate') ? 1 : 0, this.padTriggers.rt);
    inp.brake = Math.max(this.keyDown('brake') ? 1 : 0, this.padTriggers.lt);
    const keySteer = (this.keyDown('steerRight') ? 1 : 0) - (this.keyDown('steerLeft') ? 1 : 0);
    const kb = this.steering.update(keySteer, dt);
    const padTarget =
      Math.abs(this.touchStick.x) > Math.abs(this.padAxes[0]) ? this.touchStick.x : this.padAxes[0];
    const rate = this.steeringRates.padRate * dt;
    this.padSteer += Math.max(-rate, Math.min(rate, padTarget - this.padSteer));
    inp.steer = Math.max(-1, Math.min(1, Math.abs(this.padSteer) > Math.abs(kb) ? this.padSteer : kb));
    // The handbrake key pulls the park brake on, and the next press lets it off.
    inp.toggleParkBrake = edges.has('handbrake');
    inp.winchIn = this.held('winchIn');
    inp.winchOut = this.held('winchOut');
    inp.horn = this.held('horn');
    inp.jack = this.held('jack');
    inp.toggleRange = edges.has('range');
    inp.toggleFrontDiff = edges.has('frontDiff');
    inp.toggleRearDiff = edges.has('rearDiff');
    inp.togglePrecision = edges.has('precision');
    inp.cycleLights = edges.has('lights');
    inp.winchAttach = edges.has('winch');
    inp.interact = edges.has('interact');
    edges.clear();
    return inp;
  }

  /** Edge-triggered UI action since the last call to consumeUi(). */
  pressed(a: Action): boolean {
    return (this.uiEdges.get(a) ?? 0) > 0;
  }

  /** How many times an action was pressed since the last consumeUi(). */
  pressCount(a: Action): number {
    return this.uiEdges.get(a) ?? 0;
  }

  /** Clear UI edges; call once per rendered frame after the UI has looked at them. */
  consumeUi(): void {
    this.uiEdges.clear();
    if (!this.vehicleEnabled) this.vehicleEdges.clear();
  }

  /** Camera zoom steps since last call (+ = further away). */
  takeZoom(dt: number, allowPad = true): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    const pad = allowPad ? (this.padButtons[Pad.Right] ? 1 : 0) - (this.padButtons[Pad.Left] ? 1 : 0) : 0;
    return d + pad * padTuning.cameraZoomRate * dt;
  }

  /** Radians this frame; independent of steering and tool/menu navigation. */
  cameraOrbit(dt: number): { yaw: number; pitch: number } {
    const horizontal = (this.keys.has('Numpad6') ? 1 : 0) - (this.keys.has('Numpad4') ? 1 : 0);
    const vertical = (this.keys.has('Numpad2') ? 1 : 0) - (this.keys.has('Numpad8') ? 1 : 0);
    const rate = padTuning.cameraOrbitRate * dt;
    return { yaw: -(this.padAxes[2] + horizontal) * rate, pitch: (this.padAxes[3] + vertical) * rate };
  }

  /** Raw stick (for radial menus and placing planks): the gamepad or the touch joystick. */
  stick(): { x: number; y: number } {
    const t = this.touchStick;
    return t.x !== 0 || t.y !== 0 ? { ...t } : { x: this.padAxes[0], y: this.padAxes[1] };
  }
}
