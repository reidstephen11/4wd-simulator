import type { VehicleTuning } from '../../data/vehicle';

export type Range = 'high' | 'low';

/**
 * The gearbox mode the sim drives: 'automatic' shifts itself (every vehicle, through its
 * converter); 'manual' holds the gear the player picks with the clutch worked for them;
 * 'clutch' adds a clutch pedal, and the engine can stall. 'clutch' is not offered in
 * Settings (a controller button made a poor clutch). It remains internal to the sim and
 * its tests; the owner has ruled out wheel/pedal support and restoring this option.
 */
export type GearboxMode = 'automatic' | 'manual' | 'clutch';

export const GEARBOX_MODES: readonly GearboxMode[] = ['automatic', 'manual', 'clutch'];

export function isGearboxMode(x: unknown): x is GearboxMode {
  return typeof x === 'string' && (GEARBOX_MODES as readonly string[]).includes(x);
}

/** The gearbox choices Settings offers (controller only). */
export type GearboxSetting = 'automatic' | 'manual';

export const GEARBOX_SETTINGS: readonly GearboxSetting[] = ['automatic', 'manual'];

export function isGearboxSetting(x: unknown): x is GearboxSetting {
  return typeof x === 'string' && (GEARBOX_SETTINGS as readonly string[]).includes(x);
}

/** Time a manual gear change takes (s); the drive is out while it runs. */
export const MANUAL_SHIFT_TIME = 0.35;

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
  /** Fuel the engine is burning (L/s, before any episode scaling). */
  fuelRate: number;
  /** Manual modes only: the box is in neutral (`gear` then reads 0 but nothing drives). */
  neutral: boolean;
  /** How far the clutch is engaged, 0..1 (1 in automatic mode). */
  clutch: number;
  /** True for the one step in which the engine stalled against the clutch. */
  stalled: boolean;
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
  /** The gearbox setting (default 'automatic'). */
  mode?: GearboxMode;
  /** 'clutch' mode: the clutch pedal, 0 (out, engaged) .. 1 (pressed, free). */
  clutchPedal?: number;
  /** Work the clutch for the player even in 'clutch' mode (precision crawl). */
  autoClutch?: boolean;
}

export function createDrivetrainState(): DrivetrainState {
  return {
    range: 'high',
    gear: 0,
    rpm: 800,
    load: 0,
    shiftTimer: 0,
    engineRunning: true,
    slip: 0,
    fuelRate: 0,
    neutral: false,
    clutch: 1,
    stalled: false,
  };
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

/** Torque the clutch passes fully engaged (Nm). */
export function clutchTorque(t: VehicleTuning): number {
  return t.gearbox.clutchTorque ?? 1.8 * Math.max(...t.engine.torqueCurve.map((p) => p[1]));
}

/**
 * One step along the sequential gate: R ← N ← 1 ← 2 … (dir -1 goes down, +1 up).
 * Returns false at either end. Starts the shift timer.
 */
export function shiftGear(t: VehicleTuning, s: DrivetrainState, dir: 1 | -1): boolean {
  const top = t.gearbox.ratios.length - 1;
  if (dir > 0) {
    if (s.gear < 0) {
      s.gear = 0;
      s.neutral = true;
    } else if (s.neutral) s.neutral = false;
    else if (s.gear < top) s.gear++;
    else return false;
  } else {
    if (s.gear < 0) return false;
    if (s.neutral) {
      s.neutral = false;
      s.gear = -1;
    } else if (s.gear === 0) s.neutral = true;
    else s.gear--;
  }
  s.shiftTimer = MANUAL_SHIFT_TIME;
  return true;
}

/** The gear as the HUD shows it: N, R or the number. */
export function gearLabel(s: DrivetrainState): string {
  return s.neutral ? 'N' : s.gear < 0 ? 'R' : String(s.gear + 1);
}

/**
 * Advance the gearbox, engine and torque converter or clutch and return the total
 * drive force at the wheels (N, + pushes forward; negative while engine braking).
 * Pure function of tuning + state + request.
 */
export function updateDrivetrain(
  t: VehicleTuning,
  s: DrivetrainState,
  req: DriveRequest,
  dt: number,
): number {
  s.stalled = false;
  const mode = req.mode ?? 'automatic';
  if (mode !== 'automatic') {
    return t.gearbox.kind === 'manual'
      ? updateClutchBox(t, s, req, mode, dt)
      : updateHeldAutomatic(t, s, req, dt);
  }
  s.neutral = false;
  s.clutch = 1;
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
    s.fuelRate = 0;
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
  // Separate the engine's idle allowance from work. The clutch/converter and engine
  // friction are tuned for driving feel, not a real engine's internal losses: charging
  // fuel for them directly made small engines idle on 3–5 L/h. Subtract friction and
  // the coupling's idle loss, then charge for positive engine work above that. A hard
  // pull or wheelspin still costs fuel even when the car isn't moving.
  const F = E.fuel;
  const omega = (s.rpm * 2 * Math.PI) / 60;
  const idleLoss = converterTorque(t, E.idleRpm, 0).pump * ((E.idleRpm * 2 * Math.PI) / 60);
  const work = Math.max(0, (combustion - frictionTorque(t, s.rpm, throttle)) * omega - idleLoss);
  s.fuelRate = F.idleLitresPerHour / 3600 + work / (F.efficiency * F.energyMJPerLitre * 1e6);
  let force = (out * ratio * g.efficiency) / t.wheelRadius;
  if (s.shiftTimer > 0) force *= 0.5;
  // Load: combustion beyond what just keeps the engine turning, against what it could give.
  const idle = frictionTorque(t, s.rpm, 0);
  s.load = Math.min(1, Math.max(0, (combustion - idle) / Math.max(1, engineTorque(t, s.rpm) - idle)));
  return s.gear < 0 ? -force : force;
}

/** Fuel burnt for the step: idle allowance plus positive engine work (shared by every mode). */
function fuelAndLoad(t: VehicleTuning, s: DrivetrainState, combustion: number, throttle: number): void {
  const E = t.engine;
  const F = E.fuel;
  const omega = (s.rpm * 2 * Math.PI) / 60;
  const idleLoss = converterTorque(t, E.idleRpm, 0).pump * ((E.idleRpm * 2 * Math.PI) / 60);
  const work = Math.max(0, (combustion - frictionTorque(t, s.rpm, throttle)) * omega - idleLoss);
  s.fuelRate = F.idleLitresPerHour / 3600 + work / (F.efficiency * F.energyMJPerLitre * 1e6);
  const idle = frictionTorque(t, s.rpm, 0);
  s.load = Math.min(1, Math.max(0, (combustion - idle) / Math.max(1, engineTorque(t, s.rpm) - idle)));
}

function engineStopped(s: DrivetrainState, dt: number): number {
  s.rpm = Math.max(0, s.rpm - 3000 * dt);
  s.load = 0;
  s.slip = 0;
  s.fuelRate = 0;
  return 0;
}

/** Engagement the auto-clutch aims for (manual mode, and precision crawl in either manual mode). */
function autoClutchTarget(t: VehicleTuning, s: DrivetrainState, turbine: number): number {
  const idle = t.engine.idleRpm;
  if (s.neutral || s.shiftTimer > 0) return 0;
  if (Math.abs(turbine) >= 1.3 * idle) return 1;
  return Math.min(1, Math.max(0, (s.rpm - 1.05 * idle) / idle));
}

/**
 * A manual gearbox behind a dry clutch ('manual' and 'clutch' modes). The player picks the
 * gear; reverse is a gear, so `req.reverse` is ignored. No speed governor: the redline cut
 * limits the revs. In 'clutch' mode the engine stalls if the engaged clutch drags it down.
 */
function updateClutchBox(
  t: VehicleTuning,
  s: DrivetrainState,
  req: DriveRequest,
  mode: GearboxMode,
  dt: number,
): number {
  const E = t.engine;
  const g = t.gearbox;
  if (s.shiftTimer > 0) s.shiftTimer = Math.max(0, s.shiftTimer - dt);
  const auto = mode === 'manual' || !!req.autoClutch;
  const pedalEngagement = smooth01((0.75 - (req.clutchPedal ?? 0)) / 0.5);

  if (!s.engineRunning) {
    // Left in gear with the clutch out, a dead engine still drags the wheels.
    s.clutch = s.neutral ? 0 : auto ? 1 : pedalEngagement;
    return engineStopped(s, dt);
  }

  const throttle = Math.min(1, Math.max(0, req.throttle));
  const moving = s.gear < 0 ? -req.speed : req.speed;
  const turbine = Math.sign(moving) * coupledRpm(t, req.speed, s.gear, s.range);
  // Engagement: the auto-clutch rises at most 4/s; the pedal at most 2.5/s, so letting a
  // digital button go still feeds the clutch in over a moment. Both fall at once.
  let target = auto ? autoClutchTarget(t, s, turbine) : pedalEngagement;
  if (s.neutral || s.shiftTimer > 0) target = 0;
  const rise = (auto ? 4 : 2.5) * dt;
  let e = target < s.clutch ? target : Math.min(target, s.clutch + rise);

  const capacityFull = clutchTorque(t);
  const idleBoost = Math.min(1, Math.max(0, (E.idleRpm - s.rpm) / E.idleDroop));
  const steps = 4;
  const h = dt / steps;
  const k = (h * 60) / (2 * Math.PI * E.inertia);
  const floor = auto ? E.idleRpm * 0.4 : 0;
  let out = 0;
  let combustion = 0;
  for (let i = 0; i < steps; i++) {
    const cut = s.rpm > E.redlineRpm ? 0 : 1;
    combustion =
      cut * req.enginePower * combustionTorque(t, s.rpm, Math.max(throttle, idleBoost * E.idleGovernor));
    const tLock = combustion - frictionTorque(t, s.rpm, throttle);
    const capacity = capacityFull * e;
    let transmitted = 0;
    if (e <= 0) s.rpm += tLock * k;
    else if (Math.abs(s.rpm - turbine) < 60 && Math.abs(tLock) <= capacity) {
      s.rpm = turbine;
      transmitted = tLock;
    } else {
      const dir = Math.sign(s.rpm - turbine) || 1;
      transmitted = capacity * dir;
      const next = s.rpm + (tLock - transmitted) * k;
      // Slipping plates can't overshoot each other: they meet and lock.
      s.rpm = Math.sign(next - turbine) !== dir ? turbine : next;
    }
    s.rpm = Math.max(floor, s.rpm);
    if (auto && e > 0 && s.rpm < 0.9 * E.idleRpm) e = 0;
    out += transmitted / steps;
  }
  s.clutch = e;
  s.slip = e > 0 && s.rpm > 1 ? Math.min(1, Math.max(0, turbine) / s.rpm) : 0;
  fuelAndLoad(t, s, combustion, throttle);
  if (!auto && (s.rpm < 0.35 * E.idleRpm || (e > 0.5 && s.rpm < 0.55 * E.idleRpm))) {
    s.engineRunning = false;
    s.rpm = 0;
    s.load = 0;
    s.fuelRate = 0;
    s.stalled = true;
    return 0;
  }
  const force = (out * totalRatio(t, s.gear, s.range) * g.efficiency) / t.wheelRadius;
  return s.gear < 0 ? -force : force;
}

/**
 * An automatic in a manual mode (the 40 Series): the converter as always, but the player
 * holds the gear (a 1-2-D lever) and reverse and neutral are gears. No clutch, no stall.
 */
function updateHeldAutomatic(t: VehicleTuning, s: DrivetrainState, req: DriveRequest, dt: number): number {
  const E = t.engine;
  if (s.shiftTimer > 0) s.shiftTimer = Math.max(0, s.shiftTimer - dt);
  s.clutch = s.neutral ? 0 : 1;
  if (!s.engineRunning) return engineStopped(s, dt);
  const throttle = Math.min(1, Math.max(0, req.throttle));
  const moving = s.gear < 0 ? -req.speed : req.speed;
  const turbine = s.neutral ? 0 : Math.sign(moving) * coupledRpm(t, req.speed, s.gear, s.range);
  const idleBoost = Math.min(1, Math.max(0, (E.idleRpm - s.rpm) / E.idleDroop));
  const steps = 4;
  const h = dt / steps;
  let out = 0;
  let combustion = 0;
  for (let i = 0; i < steps; i++) {
    const cut = s.rpm > E.redlineRpm ? 0 : 1;
    combustion =
      cut * req.enginePower * combustionTorque(t, s.rpm, Math.max(throttle, idleBoost * E.idleGovernor));
    const tc = s.neutral ? { pump: 0, turbine: 0 } : converterTorque(t, s.rpm, turbine);
    const net = combustion - frictionTorque(t, s.rpm, throttle) - tc.pump;
    s.rpm = Math.max(E.idleRpm * 0.4, s.rpm + ((net / E.inertia) * h * 60) / (2 * Math.PI));
    out += tc.turbine / steps;
  }
  s.slip = s.rpm > 1 ? Math.max(0, turbine) / s.rpm : 0;
  fuelAndLoad(t, s, combustion, throttle);
  let force = (out * totalRatio(t, s.gear, s.range) * t.gearbox.efficiency) / t.wheelRadius;
  if (s.shiftTimer > 0) force *= 0.5;
  return s.gear < 0 ? -force : force;
}

/**
 * Drag on the wheels from a stalled engine (N, always >= 0): `engineBrake` per unit of the
 * total gear ratio, halved, so a dead car holds better in low range and a low gear. Running
 * engines brake through the converter or clutch. `engagement` scales it: 0 in neutral or
 * with the clutch pressed.
 */
export function engineBrakeForce(
  t: VehicleTuning,
  s: DrivetrainState,
  engagement = s.neutral ? 0 : (s.clutch ?? 1),
): number {
  return s.engineRunning ? 0 : (engagement * t.engine.engineBrake * totalRatio(t, s.gear, s.range)) / 2;
}

function smooth01(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}
