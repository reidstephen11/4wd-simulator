/** Controls (SPEC §10). Key codes are KeyboardEvent.code; pad indices follow the W3C standard mapping. */
export type Action =
  | 'accelerate'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'handbrake'
  | 'range'
  | 'winch'
  | 'winchIn'
  | 'winchOut'
  | 'toolMenu'
  | 'interact'
  | 'jack'
  | 'horn'
  | 'map'
  | 'pause'
  | 'confirm'
  | 'back'
  | 'menuUp'
  | 'menuDown'
  | 'menuLeft'
  | 'menuRight';

export const keyBindings: Record<Action, readonly string[]> = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  range: ['KeyL'],
  winch: ['KeyE'],
  winchIn: ['KeyR'],
  winchOut: ['KeyF'],
  toolMenu: ['KeyQ'],
  interact: ['KeyE'],
  jack: ['KeyJ'],
  horn: ['KeyH'],
  map: ['KeyM'],
  pause: ['Escape'],
  confirm: ['Enter', 'KeyE'],
  back: ['Escape', 'Backspace'],
  menuUp: ['ArrowUp', 'KeyW'],
  menuDown: ['ArrowDown', 'KeyS'],
  menuLeft: ['ArrowLeft', 'KeyA'],
  menuRight: ['ArrowRight', 'KeyD'],
};

/** Standard gamepad buttons. */
export const Pad = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  View: 8,
  Start: 9,
  LS: 10,
  RS: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const;

export const padBindings: Partial<Record<Action, readonly number[]>> = {
  handbrake: [Pad.X],
  range: [Pad.Y],
  winch: [Pad.RB],
  winchIn: [Pad.Up],
  winchOut: [Pad.Down],
  toolMenu: [Pad.LB],
  interact: [Pad.A],
  jack: [Pad.B],
  horn: [Pad.LS],
  map: [Pad.View],
  pause: [Pad.Start],
  confirm: [Pad.A],
  back: [Pad.B],
  menuUp: [Pad.Up],
  menuDown: [Pad.Down],
  menuLeft: [Pad.Left],
  menuRight: [Pad.Right],
};

export const padTuning = {
  stickDeadzone: 0.12,
  triggerDeadzone: 0.05,
  /** Camera distance change per second at full right-stick deflection (m). */
  cameraZoomRate: 6,
};

/** Short glyphs shown in prompts for the active device. */
export const glyphs: Record<'keyboard' | 'gamepad', Partial<Record<Action, string>>> = {
  keyboard: {
    accelerate: 'W',
    brake: 'S',
    handbrake: 'Space',
    range: 'L',
    winch: 'E',
    winchIn: 'R',
    winchOut: 'F',
    toolMenu: 'Q',
    interact: 'E',
    jack: 'J',
    horn: 'H',
    map: 'M',
    pause: 'Esc',
    confirm: 'Enter',
    back: 'Esc',
  },
  gamepad: {
    accelerate: 'RT',
    brake: 'LT',
    handbrake: 'X',
    range: 'Y',
    winch: 'RB',
    winchIn: 'D-pad ↑',
    winchOut: 'D-pad ↓',
    toolMenu: 'LB',
    interact: 'A',
    jack: 'B',
    horn: 'L3',
    map: 'View',
    pause: 'Start',
    confirm: 'A',
    back: 'B',
  },
};

/** Rows for the controls table (pause menu and README). */
export const controlsTable: ReadonlyArray<readonly [string, string, string]> = [
  ['Accelerate', 'W / ↑', 'RT'],
  ['Brake / reverse', 'S / ↓', 'LT'],
  ['Steer', 'A D / ← →', 'Left stick'],
  ['Handbrake', 'Space', 'X / Square'],
  ['Toggle high/low range', 'L', 'Y / Triangle'],
  ['Winch quick attach / detach', 'E', 'RB'],
  ['Winch in / out', 'R / F', 'D-pad up / down'],
  ['Tool menu', 'Hold Q', 'Hold LB'],
  ['Interact (pick up planks)', 'E (when prompted)', 'A / Cross'],
  ['Right vehicle', 'Hold J', 'Hold B / Circle'],
  ['Camera distance', 'Scroll', 'Right stick up/down'],
  ['Horn', 'H', 'Left stick click'],
  ['Map', 'M', 'View / Select'],
  ['Pause', 'Esc', 'Start / Options'],
];
