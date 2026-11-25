/** Button names are a display preference; physical indices use the standard gamepad mapping. */
/** `quest`: the headset's hand controllers, used only while a headset is on (not a menu choice). */
export type ControllerType = 'playstation' | 'xbox' | 'generic' | 'quest';
/** The choices the Settings menus offer. */
export const controllerTypes: readonly ControllerType[] = ['playstation', 'xbox', 'generic'];
export const defaultController: ControllerType = 'playstation';

export interface ControllerLabels {
  label: string;
  confirm: string;
  confirmName: string;
  back: string;
  backName: string;
  handbrake: string;
  range: string;
  toolMenu: string;
  winch: string;
  brake: string;
  accelerate: string;
  map: string;
  pause: string;
  horn: string;
  cameraReset: string;
}

export const controllers: Record<ControllerType, ControllerLabels> = {
  playstation: {
    label: 'PlayStation (PS4)',
    confirm: '✕',
    confirmName: 'Cross',
    back: '○',
    backName: 'Circle',
    handbrake: '□',
    range: '△',
    toolMenu: 'L1',
    winch: 'R1',
    brake: 'L2',
    accelerate: 'R2',
    map: 'SHARE',
    pause: 'OPTIONS',
    horn: 'L3',
    cameraReset: 'R3',
  },
  xbox: {
    label: 'Xbox',
    confirm: 'A',
    confirmName: 'A',
    back: 'B',
    backName: 'B',
    handbrake: 'X',
    range: 'Y',
    toolMenu: 'LB',
    winch: 'RB',
    brake: 'LT',
    accelerate: 'RT',
    map: 'View',
    pause: 'Menu',
    horn: 'Left stick click',
    cameraReset: 'Right stick click',
  },
  generic: {
    label: 'Generic',
    confirm: 'Button 1',
    confirmName: 'Button 1',
    back: 'Button 2',
    backName: 'Button 2',
    handbrake: 'Button 3',
    range: 'Button 4',
    toolMenu: 'Button 5',
    winch: 'Button 6',
    brake: 'Button 7',
    accelerate: 'Button 8',
    map: 'Button 9',
    pause: 'Button 10',
    horn: 'Button 11',
    cameraReset: 'Button 12',
  },
  quest: {
    label: 'Headset controllers',
    confirm: 'A',
    confirmName: 'A',
    back: 'B',
    backName: 'B',
    handbrake: 'X',
    range: 'Y',
    toolMenu: 'Left grip',
    winch: 'Right grip',
    brake: 'Left trigger',
    accelerate: 'Right trigger',
    map: '—',
    pause: 'Left stick click',
    horn: 'Right stick click',
    cameraReset: 'Hold Meta button',
  },
};

export function isControllerType(value: unknown): value is ControllerType {
  return controllerTypes.includes(value as ControllerType);
}
