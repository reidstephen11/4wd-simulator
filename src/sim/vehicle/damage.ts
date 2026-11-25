import { damageTuning as D, type DamageMode } from '../../data/damage';
import { SurfaceId } from '../../data/surfaces';
import { pressureSoftness } from './tyrePressure';
import type { TyreFault, VehicleCondition } from './condition';
import { unrotate } from './math';
import type { Vehicle } from './vehicle';

export type DamagePart = 'tyre' | 'suspension' | 'engine';

/** A part was damaged this step: which, which wheel (tyres and suspension) and how badly now. */
export interface DamageEvent {
  part: DamagePart;
  wheel: number;
  health: number;
  /**
   * What did it: a rock cut, a sharp rock picked up by chance, wheelspin wearing through on
   * rock, a pothole or washout hit at speed, a soft tyre rolled off its rim cornering, a
   * hard landing, a chassis knock, a crash, upside down, water.
   */
  cause:
    | 'rock'
    | 'sharp'
    | 'spin'
    | 'hole'
    | 'corner'
    | 'landing'
    | 'knock'
    | 'crash'
    | 'inverted'
    | 'water'
    | 'overheat';
  /** Tyres: a slow puncture, a torn sidewall or off the rim. */
  fault?: TyreFault;
}

/**
 * Mechanical damage (SPEC §11): hard knocks cut tyres, bend suspension corners and hurt
 * the engine. The physics reads the results through the condition multipliers. Returns
 * what was damaged this step (with damage off, only the overheating warning).
 */
export function updateDamage(v: Vehicle, mode: DamageMode, dt: number): DamageEvent[] {
  const events: DamageEvent[] = [];
  // The engine heats with any damage setting, so the gauge always reads true; only the
  // harm from boiling it is left out with damage off.
  const heated = updateEngineHeat(v, dt);
  if (heated) events.push(heated);
  if (mode === 'off') return events;
  const c = v.condition;

  const cut = (i: number, fault: TyreFault, cause: DamageEvent['cause']) => {
    c.tyreTarget[i] = D.tyre.floor[mode];
    c.tyreFault[i] = fault;
    events.push({ part: 'tyre', wheel: i, health: c.tyres[i], cause, fault });
  };
  const T = D.tyre;
  const soft = pressureSoftness(c);
  const ground = Math.abs(v.speed);
  // Sharp stones: a chance for each metre rolled, more on rock and at speed, less let down.
  const sharp = ground * dt * (0.3 + (0.7 * ground) / (20 / 3.6)) * (1 + (T.sharpRockLowPressure - 1) * soft);
  // Sideways acceleration in a corner (m/s²): speed times how fast the car is turning.
  const lateral = Math.abs(v.speed * v.body.angvel().y);
  const rimRoll = lateral > T.rimRollAccel ? soft * (lateral - T.rimRollAccel) * T.rimRollPerSecond * dt : 0;
  for (let i = 0; i < 4; i++) {
    const hit = v.wheelLandings[i];
    const w = v.wheels[i];
    const intact = c.tyreFault[i] === 'none';
    // A tyre landing hard on rock is cut and starts going down; harder still tears the sidewall.
    const low = 1 + (T.lowPressureCut - 1) * soft;
    if (hit > D.tyre.punctureSpeed * low && w.surface === SurfaceId.Rock && intact)
      cut(i, hit > D.tyre.sidewallSpeed ? 'sidewall' : 'puncture', 'rock');
    // A pothole or washout hit at speed pinches the tyre.
    else if (intact && v.wheelStrikes[i] > D.tyre.strike * low) cut(i, 'puncture', 'hole');
    // Let down, the outside tyre (the heavier of its axle) can roll off its rim in a hard corner.
    else if (intact && rimRoll > 0 && w.contact && w.load > v.wheels[i ^ 1].load && v.rand() < rimRoll)
      cut(i, 'rim', 'corner');
    // A sharp stone picked up at any pace: a slow puncture.
    else if (intact && w.contact && sharp > 0 && v.rand() < (sharp * sharpPerKm(v, w)) / 1000)
      cut(i, 'puncture', 'sharp');
    // Spinning hard on rock wears through the tread.
    else if (intact && w.contact && (w.surface === SurfaceId.Rock || w.surface === SurfaceId.Wood)) {
      const scrub =
        v.transfer.windup *
        Math.min(1, Math.abs(v.speed) / 2) *
        Math.min(1, Math.abs(v.wheels[0].steer) / 0.4) *
        0.2;
      c.abrasion[i] += ((w.spin > D.tyre.abrasionSpin ? w.spin : 0) + scrub) * dt;
      if (c.abrasion[i] > D.tyre.abrasionSeconds) cut(i, 'puncture', 'spin');
    }
    const fault = c.tyreFault[i];
    const seconds =
      mode === 'mild'
        ? D.tyre.deflateSeconds.mild
        : D.tyre.deflateSeconds[fault === 'sidewall' || fault === 'rim' ? fault : 'puncture'];
    if (c.tyres[i] > c.tyreTarget[i]) c.tyres[i] = Math.max(c.tyreTarget[i], c.tyres[i] - dt / seconds);
    // A heavy landing bends that corner, and so does a hole hit hard enough.
    const bend = (loss: number, cause: DamageEvent['cause']) => {
      const before = c.suspension[i];
      c.suspension[i] = Math.max(D.suspension.floor[mode], before - loss);
      if (c.suspension[i] < before)
        events.push({ part: 'suspension', wheel: i, health: c.suspension[i], cause });
    };
    if (hit > D.suspension.bendSpeed)
      bend(0.12 + (hit - D.suspension.bendSpeed) * D.suspension.perSpeed, 'landing');
    else if (v.wheelStrikes[i] > D.suspension.strike) bend(D.suspension.strikeLoss, 'hole');
  }

  const E = D.engine;
  const hurt = (loss: number, cause: DamageEvent['cause'], quiet = false) => {
    const before = c.engine;
    c.engine = Math.max(E.floor[mode], before - loss);
    if (c.engine < before && !quiet) events.push({ part: 'engine', wheel: -1, health: c.engine, cause });
  };
  // Running into something on the nose: the body's sudden change of speed points back.
  let crash = false;
  if (v.lastImpact > E.crashSpeed) {
    const d = unrotate(v.body.rotation(), v.lastImpactDir.x, v.lastImpactDir.y, v.lastImpactDir.z);
    crash = d.z > 0.6;
    if (crash) hurt(0.1 + (v.lastImpact - E.crashSpeed) * E.perSpeed, 'crash');
  }
  // Otherwise a big knock on the chassis: the sump on a rock, a heavy landing on the belly.
  if (!crash && v.bodyContact.knock > E.knockImpulse)
    hurt(0.08 + (v.bodyContact.knock - E.knockImpulse) * E.perImpulse, 'knock');
  // Upside down with the engine running, the oil drains away from the pump.
  if (v.drivetrain.engineRunning && v.tiltDeg() > 120) {
    const before = c.engine;
    hurt(E.invertedPerSecond * dt, 'inverted', true);
    // Report it once per tenth of the engine's health lost.
    if (Math.floor(before * 10) !== Math.floor(c.engine * 10))
      events.push({ part: 'engine', wheel: -1, health: c.engine, cause: 'inverted' });
  }
  // Boiling hurts only while the engine turns; switched off, it just cools.
  if (v.drivetrain.engineRunning && c.engineHeat > 1) {
    const before = c.engine;
    hurt(E.overheatPerSecond * dt, 'overheat', true);
    if (Math.floor(before * 10) !== Math.floor(c.engine * 10))
      events.push({ part: 'engine', wheel: -1, health: c.engine, cause: 'overheat' });
  }
  // In realistic mode, water drawn in through the intake bends a connecting rod.
  if (mode === 'realistic' && v.floodEvent === 'stalled') hurt(E.floodStall, 'water');
  return events;
}

/** Sharp-stone punctures per kilometre at 20 km/h under a wheel, by what it's rolling on. */
function sharpPerKm(v: Vehicle, w: Vehicle['wheels'][number]): number {
  const S = D.tyre.sharpRockPerKm;
  const p = w.contactPoint;
  if (w.surface === SurfaceId.Rock) return v.physics.ground.smoothAt?.(p.x, p.z) ? 0 : S.rock;
  if (w.surface === SurfaceId.Gravel) return S.gravel;
  if (w.surface === SurfaceId.Dirt || w.surface === SurfaceId.Clay) return S.firm;
  return 0;
}

/**
 * Engine temperature (0.5 normal). The thermostat holds it at normal until the work outruns
 * the radiator. Heat follows load (pedal × revs), more in low range, and most of all when
 * bogged — wheels spinning at high revs with little ground speed. Moving air and water
 * pull it back. It climbs over `heatSeconds` and cools over the slower `coolSeconds`
 * (faster in water). Returns the warning when it reaches `heatWarn`.
 */
function updateEngineHeat(v: Vehicle, dt: number): DamageEvent | null {
  const E = D.engine;
  const c = v.condition;
  const d = v.drivetrain;
  const heat = c.engineHeat ?? 0.5;
  const rpmShare = Math.min(1, d.rpm / v.tuning.engine.redlineRpm);
  // Load: the pedal times the revs, with a quarter of the work even when lugging at low revs.
  const load = d.engineRunning ? Math.abs(v.throttle) * (0.25 + 0.75 * rpmShare) : 0;
  let spin = 0;
  let water = 0;
  const wheels = v.wheels;
  const n = wheels.length || 1;
  for (const w of wheels) {
    spin += w.spin ?? 0;
    water += w.water ?? 0;
  }
  spin /= n;
  water /= n;
  const speed = Math.abs(v.speed);
  const still = 1 - Math.min(1, speed / E.bogSpeed);
  const bog = spin * still * rpmShare;
  const rangeMul = d.range === 'low' ? E.lowRangeHeat : 1;
  const work = load * rangeMul * (1 + E.bogHeat * bog);
  const airflow = E.airflowCool * speed;
  const wet = Math.min(1, water / E.waterFull);
  const waterDrop = E.waterCool * wet + (c.flood?.submerged ? E.submergedCool : 0);
  let target: number;
  if (!d.engineRunning) target = Math.max(0.15, 0.3 - 0.5 * waterDrop);
  else {
    target = 0.5 + work * E.heatGain - airflow - waterDrop;
    target = waterDrop <= 0 ? Math.max(0.5, target) : Math.max(0.2, target);
  }
  const heating = target > heat;
  let seconds = heating ? E.heatSeconds : E.coolSeconds;
  if (!heating) seconds *= 1 - E.waterCoolFactor * Math.min(1, wet + (c.flood?.submerged ? 0.5 : 0));
  c.engineHeat = Math.min(E.maxHeat, heat + ((target - heat) * dt) / seconds);
  return heat < E.heatWarn && c.engineHeat >= E.heatWarn
    ? { part: 'engine', wheel: -1, health: c.engine, cause: 'overheat' }
    : null;
}

/** Mend one tyre (a plug, a spare fitted, or a camp's repair). */
export function mendTyre(c: VehicleCondition, i: number): void {
  c.tyres[i] = 1;
  c.tyreTarget[i] = 1;
  c.tyreFault[i] = 'none';
  c.abrasion[i] = 0;
}

/** Every part as new (a field repair, or damage turned off). Spares, plugs and fuel are untouched. */
export function repairAll(c: VehicleCondition): void {
  c.engine = 1;
  for (let i = 0; i < 4; i++) mendTyre(c, i);
  c.suspension.fill(1);
  c.engineHeat = 0.5;
}

/** Keep damage within what a mode allows (after changing the setting). */
export function limitDamage(c: VehicleCondition, mode: DamageMode): void {
  if (mode === 'off') {
    repairAll(c);
    return;
  }
  c.engine = Math.max(c.engine, D.engine.floor[mode]);
  for (let i = 0; i < 4; i++) {
    c.tyres[i] = Math.max(c.tyres[i], D.tyre.floor[mode]);
    c.tyreTarget[i] = Math.max(c.tyreTarget[i], D.tyre.floor[mode]);
    c.suspension[i] = Math.max(c.suspension[i], D.suspension.floor[mode]);
  }
}

/** The worst tyre, if any is cut or down (-1 if none). */
export function worstTyre(c: VehicleCondition): number {
  let worst = -1;
  for (let i = 0; i < 4; i++)
    if (c.tyreTarget[i] < 1 && (worst < 0 || c.tyres[i] < c.tyres[worst])) worst = i;
  return worst;
}

/** Is anything damaged enough to show? */
export function isDamaged(c: VehicleCondition): boolean {
  return (
    c.engine < D.shown ||
    c.tyreTarget.some((h) => h < 1) ||
    c.tyres.some((h) => h < D.shown) ||
    c.suspension.some((h) => h < D.shown)
  );
}
