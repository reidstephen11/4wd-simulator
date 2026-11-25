import { lateAfternoon, type EnvironmentConfig } from '../../src/data/environment';
import { plankTuning } from '../../src/data/tools';
import { vehicleTuning, type VehicleTuning } from '../../src/data/vehicle';
import { Autopilot } from '../../src/sim/input/autopilot';
import { emptyInput } from '../../src/sim/input/vehicleInput';
import { loadRapier } from '../../src/sim/physics';
import { Simulation } from '../../src/sim/sim';
import { setPressure } from '../../src/sim/vehicle/tyrePressure';
import { trailPoint } from '../../src/sim/world/crawlTrail';
import type { GullyDef } from '../../src/sim/world/mapTypes';
import type { World } from '../../src/sim/world/world';
import type { EpisodeDef } from '../../src/data/episodes';
import { conditionById, conditionFor, stormFor, type TrackConditionId } from '../../src/data/trackConditions';
import { episodeWeatherAt } from '../../src/data/weatherTimeline';

/** An episode's weather at its start on one of the rolled days: the light, the ground and the creeks. */
export function episodeDay(def: EpisodeDef, id: TrackConditionId, hour = def.startHour) {
  const condition = conditionFor(conditionById(id), def.conditions);
  return episodeWeatherAt(hour, def.weather, stormFor(def.storm, condition));
}
import { attitude, DT, GiveUp, holdOnRollback, PlankCrossing, WinchRecovery } from './drive';

export type Path = ReadonlyArray<readonly [number, number]>;

/** A path along tracks: [track id, from, to, lateral] pieces, every half metre. */
export function along(
  world: World,
  pieces: ReadonlyArray<readonly [string, number, number, number?]>,
): [number, number][] {
  const out: [number, number][] = [];
  for (const [id, from, to, lateral = 0] of pieces) {
    const t = world.features.tracks.find((x) => x.def.id === id);
    if (!t) throw new Error(`No track ${id}`);
    const a = Math.min(from, t.poly.length);
    const b = Math.min(to, t.poly.length);
    const step = b > a ? 0.5 : -0.5;
    for (let s = a; step > 0 ? s <= b : s >= b; s += step) {
      const p = trailPoint(t, s, lateral);
      out.push([p.x, p.z]);
    }
  }
  return out;
}

export interface PathDriveOptions {
  tuning?: VehicleTuning;
  /** 'crawl': low range, precision crawl, both lockers (or open with `open`). 'high': high range, open diffs, at `speed`. */
  mode?: 'crawl' | 'high';
  open?: boolean;
  speed?: number;
  psi?: 18 | 24 | 36;
  limit?: number;
  giveUpAfter?: number;
  winch?: boolean;
  planks?: GullyDef;
  env?: EnvironmentConfig;
  /** The day as `episodeDay` gives it: overrides `env`, `creekRise` and `flowScale`. */
  day?: { env: EnvironmentConfig; creekRise: number; flowScale: number };
  /**
   * Crawl only near these points ([x, z, radius]) and drive in high range at `speed`
   * elsewhere, as a player does on a whole run (with mode 'high').
   */
  crawlNear?: readonly (readonly [number, number, number])[];
  /** Fuel burnt per litre the engine uses (the episode's `fuelScale`); none when absent. */
  fuelScale?: number;
  /** Metres the creeks stand above their own level, and their current's multiple. */
  creekRise?: number;
  flowScale?: number;
}

/**
 * Drive a path from a standstill as the obstacle tests do, with realistic damage, and report
 * how it went: whether it got to the end, the worst lean, the current, cuts and the engine.
 */
export async function drivePath(world: World, path: Path, o: PathDriveOptions = {}) {
  const tuning = o.tuning ?? vehicleTuning;
  const env = o.day?.env ?? o.env ?? lateAfternoon;
  const sim = new Simulation(await loadRapier(), world, env);
  try {
    sim.damage = 'realistic';
    if (o.fuelScale) sim.fuelScale = o.fuelScale;
    if (o.day) sim.setWeather(env, o.day.creekRise, o.day.flowScale);
    else if (o.creekRise !== undefined || o.flowScale !== undefined)
      sim.setWeather(env, o.creekRise ?? 0, o.flowScale ?? 1);
    const [x0, z0] = path[0];
    const [x1, z1] = path[Math.min(path.length - 1, 4)];
    const heading = (Math.atan2(x1 - x0, -(z1 - z0)) * 180) / Math.PI;
    const v = sim.addVehicle('p', sim.poseAt(x0, z0, heading, tuning.wheelRadius), tuning);
    if (o.psi) setPressure(v.condition, o.psi);
    const inputs = new Map([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
    for (let i = 0; i < 90; i++) sim.step(inputs, DT);
    let crawl = (o.mode ?? 'crawl') === 'crawl';
    const pilot = new Autopilot(path, crawl ? 0.7 : (o.speed ?? 4));
    const setMode = (low: boolean) => {
      crawl = low;
      v.drivetrain.range = low ? 'low' : 'high';
      v.transfer.mode = low ? '4L' : '4H';
      v.drivetrain.shiftTimer = Math.max(v.drivetrain.shiftTimer, 0.5);
      v.precisionCrawl = low;
      pilot.targetSpeed = low ? 0.7 : (o.speed ?? 4);
      pilot.lowRange = low;
    };
    if (crawl) setMode(true);
    const rolling = { back: false };
    const giveUp = new GiveUp(path, o.giveUpAfter ?? 25);
    const recovery = o.winch ? new WinchRecovery(sim, v, path) : null;
    const bridge = o.planks ? new PlankCrossing(sim, v, o.planks) : null;
    const limit = o.limit ?? 200;
    let [tilt, roll, pitch, swept, water, time] = [0, 0, 0, 0, 0, 0];
    let gaveUp = false;
    let worst = [0, 0];
    const engine0 = v.condition.engine;
    for (let n = 0; time < limit; time += DT, n++) {
      if (n % 600 === 599) await new Promise((r) => setImmediate(r));
      if (o.crawlNear && n % 30 === 0) {
        const p = v.position;
        const near = o.crawlNear.some(([x, z, r]) => Math.hypot(p.x - x, p.z - z) < r);
        if (near !== crawl && Math.abs(v.speed) < (near ? 3 : 1.5)) setMode(near);
        else if (near && !crawl) pilot.targetSpeed = 1;
      }
      let command = pilot.input(v, DT);
      if (!crawl) command.toggleRange = false;
      if (pilot.done) break;
      if (crawl) {
        command.throttle = 1;
        command.brake = 0;
        command = holdOnRollback(v, command, rolling);
      }
      if (bridge) command = bridge.update(command, DT);
      if (recovery) {
        command.winchIn = recovery.update(DT);
        if (recovery.backingOff)
          command = { ...command, throttle: 0, brake: 0.7, steer: 0, handbrake: false };
      }
      for (const axle of ['front', 'rear'] as const)
        if (v.differentials[axle] !== (crawl && !o.open) && Math.abs(v.speed) < 1.3) v.toggleDiff(axle);
      inputs.set('p', command);
      sim.step(inputs, DT);
      if (v.tiltDeg() > tilt) worst = [v.position.x, v.position.z];
      tilt = Math.max(tilt, v.tiltDeg());
      const a = attitude(v);
      roll = Math.max(roll, Math.abs(a.roll));
      pitch = Math.max(pitch, Math.abs(a.pitch));
      swept = Math.max(swept, v.swept);
      for (const w of v.wheels) water = Math.max(water, w.water);
      if (giveUp.update(v, DT, sim.toolsOf(v.id).winch.attached)) {
        gaveUp = true;
        break;
      }
      if (v.tiltDeg() > 100) break;
      if (process.env.WALL_PROBE && n % 15 === 0) {
        const wc = (
          v as unknown as {
            wheelContacts: { walls: Int8Array; wallRise: Float32Array; wallFloor: Float32Array };
          }
        ).wheelContacts;
        const walls = wc.walls;
        if (walls.some((x) => x !== 0) || v.wheels.some((w) => !w.contact))
          console.log(
            time.toFixed(1),
            v.position.x.toFixed(1),
            v.position.z.toFixed(1),
            'speed',
            v.speed.toFixed(2),
            'walls',
            [...walls].join(','),
            'contact',
            v.wheels.map((w) => (w.contact ? 1 : 0)).join(''),
            'water',
            v.wheels.map((w) => w.water.toFixed(2)).join(','),
            'floor',
            [...wc.wallFloor].map((x) => x.toFixed(2)).join(','),
            'rise',
            [...wc.wallRise].map((x) => x.toFixed(2)).join(','),
          );
      }
    }
    const c = v.condition;
    return {
      done: pilot.done,
      remaining: pilot.remaining(v),
      time,
      tilt,
      /** Where it leaned most (x, z). */
      worst,
      at: [v.position.x, v.position.z],
      roll,
      pitch,
      swept,
      water,
      gaveUp,
      /** Ended on its side or roof. */
      rolled: v.tiltDeg() > 70,
      cuts: c.tyreFault.filter((f) => f !== 'none').length,
      suspension: Math.min(...c.suspension),
      engineLost: engine0 - c.engine,
      flooded: c.flood.stalled,
      winched: recovery?.uses ?? 0,
      fuel: c.fuel,
    };
  } finally {
    sim.physics.free();
  }
}

export { plankTuning };
