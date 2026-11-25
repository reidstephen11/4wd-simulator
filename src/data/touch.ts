import type { QualityLevel } from './quality';

/** How the left-hand stick drives on a phone. `pedals` is the original GAS/BRAKE layout. */
export type TouchDriveScheme = 'pedals' | 'stick';

export const touchDriveSchemes = ['stick', 'pedals'] as const;
export const defaultTouchDrive: TouchDriveScheme = 'stick';
export const touchDriveLabels: Record<TouchDriveScheme, string> = {
  pedals: 'Steer and pedals',
  stick: 'Joystick only',
};

export function isTouchDriveScheme(v: unknown): v is TouchDriveScheme {
  return v === 'pedals' || v === 'stick';
}

/** Which side of the screen the joystick is on. The buttons take the other side. */
export type TouchStickSide = 'left' | 'right';

export const touchStickSides = ['left', 'right'] as const;
export const defaultTouchStickSide: TouchStickSide = 'left';
export const touchStickSideLabels: Record<TouchStickSide, string> = {
  left: 'Left',
  right: 'Right',
};

export function isTouchStickSide(v: unknown): v is TouchStickSide {
  return v === 'left' || v === 'right';
}

/** On-screen touch controls for phones and tablets (SPEC §10). */
export const touchTuning = {
  /** Joystick travel from centre to full lock, in CSS pixels. */
  joystickRadius: 56,
  /** Fraction of the travel that does nothing, so a resting thumb doesn't steer. */
  joystickDeadzone: 0.12,
  /**
   * Extra deadzone on the stick's forward/back axis in Joystick only, so a light steer
   * doesn't add throttle on clay.
   */
  driveDeadzone: 0.15,
  /** Exponent on usable drive travel (>1 eases in light throttle). */
  driveCurve: 1.6,
  /**
   * Joystick deflection that counts as one left/right/up/down press in menus and tool
   * modes (choosing a winch anchor); it must drop below `menuRelease` before the next.
   */
  menuPress: 0.6,
  menuRelease: 0.35,
  /** Camera orbit radians per CSS pixel dragged with a finger. */
  dragSensitivity: 0.008,
  /** Camera zoom steps per CSS pixel the two fingers of a pinch move apart or together. */
  pinchZoomPerPx: 0.03,
  /** Graphics preset on a phone or tablet with no saved settings. */
  defaultQuality: 'low' as QualityLevel,
};

/**
 * Stick Y (down positive, already radially deadzoned) to throttle and brake for Joystick
 * only. Forward is throttle, back is brake (and reverse once stopped).
 */
export function throttleBrakeFromStick(
  y: number,
  tuning: Pick<typeof touchTuning, 'driveDeadzone' | 'driveCurve'> = touchTuning,
): { throttle: number; brake: number } {
  const mag = Math.abs(y);
  const { driveDeadzone: dz, driveCurve } = tuning;
  if (mag <= dz) return { throttle: 0, brake: 0 };
  const t = Math.min(1, ((mag - dz) / (1 - dz)) ** driveCurve);
  return y < 0 ? { throttle: t, brake: 0 } : { throttle: 0, brake: t };
}
