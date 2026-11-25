/**
 * After a recovery, the way back to the line (v2.24). A winch pull or righting the car can
 * leave it metres off the track, facing another way, where the track's hint no longer shows.
 * For a while afterwards the HUD says where the line is and repeats its hint.
 */

/** Seconds the cue stays up after a recovery ends, unless the car is back on the line first. */
export const RECOVERY_CUE_SECONDS = 45;
/** Further than this from the nearest hinted track (m), there is no line to point back to. */
export const RECOVERY_CUE_REACH = 40;

export class RecoveryCue {
  private recovering = false;
  private left = 0;

  /**
   * Each step of play. `recovering`: the winch is attached, or the car is over and waiting to
   * be righted. `onLine`: the track's own hint is showing, so the car is back on it.
   * Returns whether the cue should show.
   */
  update(dt: number, recovering: boolean, onLine: boolean): boolean {
    if (recovering) {
      this.recovering = true;
      this.left = 0;
      return false;
    }
    if (this.recovering) {
      this.recovering = false;
      this.left = RECOVERY_CUE_SECONDS;
    }
    if (onLine) this.left = 0;
    else this.left = Math.max(0, this.left - Math.max(0, dt));
    return this.left > 0;
  }

  clear(): void {
    this.recovering = false;
    this.left = 0;
  }
}

/**
 * Where a point on the line is from the car, in words: "6 m to your right". `fx, fz` is the
 * car's heading on the ground (x east, z south); the point is (qx, qz) and the car (px, pz).
 */
export function lineCue(px: number, pz: number, fx: number, fz: number, qx: number, qz: number): string {
  const dx = qx - px;
  const dz = qz - pz;
  const d = Math.hypot(dx, dz);
  const metres = `${Math.max(1, Math.round(d))} m`;
  const fl = Math.hypot(fx, fz) || 1;
  // Positive to the right of the heading.
  const angle = (Math.atan2((fx * dz - fz * dx) / fl, (fx * dx + fz * dz) / fl) * 180) / Math.PI;
  if (Math.abs(angle) < 35) return `${metres} ahead`;
  if (Math.abs(angle) > 145) return `${metres} behind you`;
  return `${metres} to your ${angle > 0 ? 'right' : 'left'}`;
}
