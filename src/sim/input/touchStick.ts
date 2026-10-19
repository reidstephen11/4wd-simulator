import { touchTuning } from '../../data/touch';
import type { Action } from '../../data/controls';

/**
 * The on-screen joystick's maths, kept apart from the DOM so it can be tested: turns a
 * thumb offset into a -1..1 stick and into single menu presses (choosing a winch anchor,
 * moving through menus) when the thumb is pushed most of the way in one direction.
 */
export class TouchStick {
  x = 0;
  y = 0;
  private latched: Action | null = null;

  constructor(private readonly tuning = touchTuning) {}

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
    this.latched = null;
  }

  /** Where the knob is drawn, in CSS pixels from the centre. */
  knob(): { x: number; y: number } {
    const r = this.tuning.joystickRadius;
    return { x: this.x * r, y: this.y * r };
  }

  private menuEdges(): Action[] {
    const { menuPress, menuRelease } = this.tuning;
    const ax = Math.abs(this.x);
    const ay = Math.abs(this.y);
    if (Math.max(ax, ay) < menuRelease) this.latched = null;
    if (this.latched || Math.max(ax, ay) < menuPress) return [];
    const a: Action = ax >= ay ? (this.x > 0 ? 'menuRight' : 'menuLeft') : this.y > 0 ? 'menuDown' : 'menuUp';
    this.latched = a;
    return [a];
  }
}
