import { glyphsFor } from './controls';
import { defaultController, type ControllerType } from './controllers';

export type ControlInstruction = 'range' | 'locks' | 'precision' | 'winch';
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

/** Tutorial instructions describe the actual action, including tools reached through a menu. */
export function controlInstruction(
  instruction: ControlInstruction,
  device: InputDevice,
  controller: ControllerType = defaultController,
): string {
  const g = glyphsFor(device, controller);
  if (device === 'touch') {
    switch (instruction) {
      case 'range':
        return 'Tap 4WD, then LOW.';
      case 'locks':
        return 'Tap 4WD, then F LOCK and R LOCK to engage both diff locks.';
      case 'precision':
        return 'Tap 4WD, then CRAWL.';
      case 'winch':
        return 'Stop, then tap USE to hook the tree ahead; hold IN to wind in or OUT to wind out.';
    }
  }
  switch (instruction) {
    case 'range':
      return `Press ${g.range}.`;
    case 'locks':
      return device === 'keyboard'
        ? `Press ${g.frontDiff} to lock the front diff, then ${g.rearDiff} for the rear.`
        : `Hold ${g.toolMenu}, choose Lock front diff and release ${g.toolMenu}; repeat for Lock rear diff.`;
    case 'precision':
      return device === 'keyboard'
        ? `Press ${g.precision}.`
        : `Hold ${g.toolMenu}, choose Enable precision crawl and release ${g.toolMenu}.`;
    case 'winch':
      return `Stop, then press ${g.winch} to hook the tree ahead; ${g.winchIn} winds in and ${g.winchOut} winds out.`;
  }
}
