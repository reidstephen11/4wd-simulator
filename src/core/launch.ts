import { defaultConditions } from '../data/environment';
import type { SaveData } from '../sim/save/save';
import type { LaunchChoice } from './game';

const AUTOSTART = '4wdsim.autostart';

/** The welcome screen's starting choice: whatever was chosen last time. */
export function choiceFromSave(save: SaveData | null): LaunchChoice {
  return {
    map: save?.map ?? 'high-country',
    vehicle: save?.vehicle ?? 'shortie',
    conditions: save?.conditions ?? defaultConditions,
  };
}

/** The next page load goes straight into the game (changing map from the pause menu). */
export function requestAutostart(): void {
  try {
    sessionStorage.setItem(AUTOSTART, '1');
  } catch {
    // Without session storage the welcome screen shows again, which still works.
  }
}

/** True once if the last page asked to go straight into the game. */
export function takeAutostart(): boolean {
  try {
    const on = sessionStorage.getItem(AUTOSTART) === '1';
    sessionStorage.removeItem(AUTOSTART);
    return on;
  } catch {
    return false;
  }
}
