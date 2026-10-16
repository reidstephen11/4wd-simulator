import type { VehicleTuning } from '../../data/vehicle';

export type Range = 'high' | 'low';

/** Serialisable drivetrain state. */
export interface DrivetrainState {
  range: Range;
  /** Index into gearbox ratios; -1 = reverse. */
  gear: number;
  rpm: number;
  /** 0..1, how hard the engine is working (for sound). */
  load: number;
  shiftTimer: number;
  engineRunning: boolean;
}

export interface DriveRequest {
  /** 0..1 */
  throttle: number;
  /** true to drive backwards (auto selects reverse). */
  reverse: boolean;
  /** Vehicle speed along its heading (m/s, + forward). */
  speed: number;
  /** Multiplier from VehicleCondition (1.0 = healthy). */
  enginePower: number;
}

export function createDrivetrainState(): DrivetrainState {
  return { range: 'high', gear: 0, rpm: 800, load: 0, shiftTimer: 0, engineRunning: true };
}

export function engineTorque(t: VehicleTuning, rpm: number): number {
  const c = t.engine.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    if (rpm <= c[i + 1][0]) {
      const f = (rpm - c[i][0]) / (c[i + 1][0] - c[i][0]);
      return c[i][1] + (c[i + 1][1] - c[i][1]) * f;
    }
  }
  return c[c.length - 1][1];
}

/** Total ratio engine → wheel for a gear and range. */
export function totalRatio(t: VehicleTuning, gear: number, range: Range): number {
  const g = gear < 0 ? t.gearbox.reverse : t.gearbox.ratios[gear];
  return g * t.gearbox.finalDrive * t.ranges[range].ratio;
}

/** Engine rpm the wheels would turn it at in this gear. */
export function coupledRpm(t: VehicleTuning, speed: number, gear: number, range: Range): number {
  const wheelRad = Math.abs(speed) / t.wheelRadius;
  return (wheelRad * totalRatio(t, gear, range) * 60) / (2 * Math.PI);
}

/**
 * Advance the automatic gearbox and engine and return the total drive force at the
 * wheels (N, + pushes forward). Pure function of tuning + state + request.
 */
export function updateDrivetrain(
  t: VehicleTuning,
  s: DrivetrainState,
  req: DriveRequest,
  dt: number,
): number {
  const g = t.gearbox;
  const range = t.ranges[s.range];
  const throttle = s.engineRunning ? Math.min(1, Math.max(0, req.throttle)) : 0;

  // Select direction.
  if (req.reverse && s.gear >= 0 && req.speed <= 0.5) s.gear = -1;
  if (!req.reverse && s.gear < 0 && req.speed >= -0.5) s.gear = 0;

  // Automatic shifting within the range.
  if (s.shiftTimer > 0) s.shiftTimer -= dt;
  else if (s.gear >= 0) {
    const rpmNow = coupledRpm(t, req.speed, s.gear, s.range);
    const up = g.upshiftRpm.light + (g.upshiftRpm.full - g.upshiftRpm.light) * throttle;
    const down = g.downshiftRpm.light + (g.downshiftRpm.full - g.downshiftRpm.light) * throttle;
    if (rpmNow > up && s.gear < g.ratios.length - 1) {
      s.gear++;
      s.shiftTimer = g.shiftTime;
    } else if (s.gear > 0) {
      const rpmLower = coupledRpm(t, req.speed, s.gear - 1, s.range);
      if (rpmNow < down && rpmLower < up * 0.92) {
        s.gear--;
        s.shiftTimer = g.shiftTime;
      }
    }
  }

  if (!s.engineRunning) {
    s.rpm = Math.max(0, s.rpm - 3000 * dt);
    s.load = 0;
    return 0;
  }

  // Engine speed: coupled to the wheels, but the torque converter lets it rev to stall speed.
  const coupled = coupledRpm(t, req.speed, s.gear, s.range);
  const free = t.engine.idleRpm + (t.engine.stallRpm - t.engine.idleRpm) * throttle;
  const target = Math.min(t.engine.redlineRpm + 200, Math.max(coupled, free));
  s.rpm += (target - s.rpm) * Math.min(1, dt * 10);

  const ratio = totalRatio(t, s.gear, s.range);
  let force = (engineTorque(t, s.rpm) * ratio * g.efficiency * throttle * req.enginePower) / t.wheelRadius;
  if (s.shiftTimer > 0) force *= 0.5;
  if (s.rpm > t.engine.redlineRpm) force *= Math.max(0, 1 - (s.rpm - t.engine.redlineRpm) / 300);

  // Speed governor per range (SPEC §6.1 top speeds), fading out over the last 8%.
  const top = (s.gear < 0 ? range.reverseTopKmh : range.topSpeedKmh) / 3.6;
  const v = Math.abs(req.speed);
  force *= 1 - smooth01((v - top * 0.92) / (top * 0.08));
  s.load =
    throttle * (force > 0 ? Math.min(1, force / ((engineTorque(t, s.rpm) * ratio) / t.wheelRadius)) : 0);
  return s.gear < 0 ? -force : force;
}

/** Engine braking force at the wheels when off the throttle (N, always >= 0). */
export function engineBrakeForce(t: VehicleTuning, s: DrivetrainState): number {
  if (!s.engineRunning) return t.engine.engineBrake * 2;
  return t.engine.engineBrake * totalRatio(t, Math.max(0, s.gear), s.range);
}

function smooth01(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}
