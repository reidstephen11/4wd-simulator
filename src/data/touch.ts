import type { QualityLevel } from './quality';

/** On-screen touch controls for phones and tablets (SPEC §10). */
export const touchTuning = {
  /** Joystick travel from centre to full lock, in CSS pixels. */
  joystickRadius: 56,
  /** Fraction of the travel that does nothing, so a resting thumb doesn't steer. */
  joystickDeadzone: 0.12,
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
