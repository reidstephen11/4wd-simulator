import { touchTuning } from '../../data/touch';
import type { Action } from '../../data/controls';

/**
 * Turns a -1..1 stick into single menu presses: one press per push most of the way in a
 * direction, and the stick must come back towards the centre before the next.
 */
export class MenuStick {
  private latched: Action | null = null;

  constructor(private readonly tuning = touchTuning) {}

  step(x: number, y: number): Action | null {
    const { menuPress, menuRelease } = this.tuning;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay) < menuRelease) this.latched = null;
    if (this.latched || Math.max(ax, ay) < menuPress) return null;
    const a: Action = ax >= ay ? (x > 0 ? 'menuRight' : 'menuLeft') : y > 0 ? 'menuDown' : 'menuUp';
    this.latched = a;
    return a;
  }

  reset(): void {
    this.latched = null;
  }
}

/**
 * The on-screen joystick's maths, kept apart from the DOM so it can be tested: turns a
 * thumb offset into a -1..1 stick and into single menu presses (choosing a winch anchor,
 * moving through menus) when the thumb is pushed most of the way in one direction.
 */
export class TouchStick {
  x = 0;
  y = 0;
  private readonly menu: MenuStick;

  constructor(private readonly tuning = touchTuning) {
    this.menu = new MenuStick(tuning);
  }

  /** Thumb offset from the stick's centre in CSS pixels (y down). Returns new menu presses. */
  move(dx: number, dy: number): Action[] {
    const { joystickRadius: r, joystickDeadzone: dz } = this.tuning;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, r);
    const mag = clamped / r < dz ? 0 : (clamped / r - dz) / (1 - dz);
    this.x = len > 0 ? (dx / len) * mag : 0;
    this.y = len > 0 ? (dy / len) * mag : 0;
    return this.menuEdges();
  }

  release(): void {
    this.x = 0;
    this.y = 0;
    this.menu.reset();
  }

  /** Where the knob is drawn, in CSS pixels from the centre. */
  knob(): { x: number; y: number } {
    const r = this.tuning.joystickRadius;
    return { x: this.x * r, y: this.y * r };
  }

  private menuEdges(): Action[] {
    const a = this.menu.step(this.x, this.y);
    return a ? [a] : [];
  }
}
