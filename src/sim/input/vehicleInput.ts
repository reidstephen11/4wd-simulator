/**
 * Per-vehicle command (SPEC §3, §11): everything a driver can ask of one vehicle in one
 * step. Local devices produce these; a network peer could too.
 */
export interface VehicleInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 — brakes when moving forward, reverses when stopped. */
  brake: number;
  /** -1 (left) .. 1 (right), already smoothed. */
  steer: number;
  handbrake: boolean;
  /** Edge-triggered: true for one step when pressed. */
  toggleRange: boolean;
  toggleFrontDiff: boolean;
  toggleRearDiff: boolean;
  togglePrecision: boolean;
  winchAttach: boolean;
  winchIn: boolean;
  winchOut: boolean;
  horn: boolean;
  /** Held. */
  jack: boolean;
  interact: boolean;
}

export function emptyInput(): VehicleInput {
  return {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    toggleRange: false,
    toggleFrontDiff: false,
    toggleRearDiff: false,
    togglePrecision: false,
    winchAttach: false,
    winchIn: false,
    winchOut: false,
    horn: false,
    jack: false,
    interact: false,
  };
}

/**
 * Keyboard steering ramps in and out so it feels close to an analogue stick (SPEC §6.1).
 */
export class SteeringSmoother {
  value = 0;

  constructor(
    public riseRate: number,
    public returnRate: number,
  ) {}

  update(target: number, dt: number): number {
    const v = this.value;
    let rate: number;
    if (target === 0) rate = this.returnRate;
    else if (Math.sign(target) !== Math.sign(v) && v !== 0) rate = this.returnRate + this.riseRate;
    else rate = this.riseRate;
    const step = rate * dt;
    this.value = Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step;
    return this.value;
  }
}
