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
  /** Torque converter speed ratio (turbine / engine), for the HUD and debugging. */
  slip: number;
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
  return { range: 'high', gear: 0, rpm: 800, load: 0, shiftTimer: 0, engineRunning: true, slip: 0 };
}

/** Full-throttle engine torque (Nm) at an rpm. */
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

/**
 * Combustion torque (Nm) at an rpm and throttle, before friction. Part throttle limits
 * the air the engine can draw per second, so torque falls as the revs rise: each
 * throttle position settles at a speed instead of always reaching the top.
 */
export function combustionTorque(t: VehicleTuning, rpm: number, throttle: number): number {
  const E = t.engine;
  const air = E.idleAir + (1 - E.idleAir) * Math.pow(Math.min(1, Math.max(0, throttle)), E.throttleCurve);
  const wideOpen = engineTorque(t, rpm) + frictionTorque(t, rpm, 1);
  return Math.min(wideOpen, (air * E.airflow) / Math.max(E.idleRpm * 0.5, rpm));
}

/** Engine friction and pumping losses (Nm); pumping is highest with the throttle closed. */
export function frictionTorque(t: VehicleTuning, rpm: number, throttle: number): number {
  const f = t.engine.friction;
  const n = Math.max(0, rpm);
  return f.base + f.perRpm * n + f.pumpingPerRpm * n * (1 - Math.min(1, Math.max(0, throttle)));
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
 * Torque converter: pump torque (Nm, + engine drives the wheels) and torque on the
 * turbine. Below the coupling point the turbine sees up to `stallRatio` × the pump
 * torque; when the wheels drive the engine (overrun) it is a plain fluid coupling.
 */
export function converterTorque(
  t: VehicleTuning,
  engineRpm: number,
  turbineRpm: number,
): { pump: number; turbine: number } {
  const C = t.converter;
  const k = 1 / (C.capacity * C.capacity);
  const ne = Math.max(0, engineRpm);
  // A turbine driven backwards (rolling back in gear) loads the pump harder.
  const pump = k * (ne * ne - Math.sign(turbineRpm) * turbineRpm * turbineRpm);
  const sr = ne > 1 ? Math.max(0, turbineRpm) / ne : 1;
  const ratio =
    pump > 0 && sr < C.couplingPoint ? C.stallRatio - (C.stallRatio - 1) * (sr / C.couplingPoint) : 1;
  return { pump, turbine: pump * ratio };
}

/**
 * Advance the automatic gearbox, engine and torque converter and return the total
 * drive force at the wheels (N, + pushes forward; negative while engine braking).
 * Pure function of tuning + state + request.
 */
export function updateDrivetrain(
  t: VehicleTuning,
  s: DrivetrainState,
  req: DriveRequest,
  dt: number,
): number {
  const g = t.gearbox;
  const E = t.engine;
  const range = t.ranges[s.range];
  let throttle = s.engineRunning ? Math.min(1, Math.max(0, req.throttle)) : 0;

  // Select direction.
  if (req.reverse && s.gear >= 0 && req.speed <= 0.5) s.gear = -1;
  if (!req.reverse && s.gear < 0 && req.speed >= -0.5) s.gear = 0;

  // Automatic shifting within the range, on the turbine (output) speed.
  if (s.shiftTimer > 0) s.shiftTimer -= dt;
  else if (s.gear >= 0) {
    const rpmNow = coupledRpm(t, req.speed, s.gear, s.range);
    const up = g.upshiftRpm.light + (g.upshiftRpm.full - g.upshiftRpm.light) * throttle;
    const down = g.downshiftRpm.light + (g.downshiftRpm.full - g.downshiftRpm.light) * throttle;
    // Coasting downhill it holds the gear, keeping the engine braking.
    if (rpmNow > up && s.gear < g.ratios.length - 1 && throttle > 0.05) {
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
    s.slip = 0;
    return 0;
  }

  // Speed governor per range (SPEC §6.1 top speeds): eases the throttle off over the last 8%.
  const top = (s.gear < 0 ? range.reverseTopKmh : range.topSpeedKmh) / 3.6;
  const v = Math.abs(req.speed);
  throttle *= 1 - smooth01((v - top * 0.92) / (top * 0.08));

  // Turbine speed from the wheels; negative when rolling against the selected direction.
  const moving = s.gear < 0 ? -req.speed : req.speed;
  const turbine = Math.sign(moving) * coupledRpm(t, req.speed, s.gear, s.range);
  const ratio = totalRatio(t, s.gear, s.range);
  const power = req.enginePower;
  // The idle governor opens the idle air as the revs sag (e.g. under creep load).
  const idleBoost = Math.min(1, Math.max(0, (E.idleRpm - s.rpm) / E.idleDroop));
  const steps = 4;
  const h = dt / steps;
  let out = 0;
  let combustion = 0;
  for (let i = 0; i < steps; i++) {
    const cut = s.rpm > E.redlineRpm ? 0 : 1;
    combustion = cut * power * combustionTorque(t, s.rpm, Math.max(throttle, idleBoost * E.idleGovernor));
    const tc = converterTorque(t, s.rpm, turbine);
    const net = combustion - frictionTorque(t, s.rpm, throttle) - tc.pump;
    s.rpm = Math.max(E.idleRpm * 0.4, s.rpm + ((net / E.inertia) * h * 60) / (2 * Math.PI));
    out += tc.turbine / steps;
  }
  s.slip = s.rpm > 1 ? Math.max(0, turbine) / s.rpm : 0;
  let force = (out * ratio * g.efficiency) / t.wheelRadius;
  if (s.shiftTimer > 0) force *= 0.5;
  // Load: combustion beyond what just keeps the engine turning, against what it could give.
  const idle = frictionTorque(t, s.rpm, 0);
  s.load = Math.min(1, Math.max(0, (combustion - idle) / Math.max(1, engineTorque(t, s.rpm) - idle)));
  return s.gear < 0 ? -force : force;
}

/** Drag on the wheels from a stalled engine (N, always >= 0). Running engines brake through the converter. */
export function engineBrakeForce(t: VehicleTuning, s: DrivetrainState): number {
  return s.engineRunning ? 0 : t.engine.engineBrake * 2;
}

function smooth01(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}
