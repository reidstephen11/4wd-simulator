import { lateAfternoon, type EnvironmentConfig } from '../../src/data/environment';
import { vehicleTuning, type VehicleTuning } from '../../src/data/vehicle';
import { Autopilot } from '../../src/sim/input/autopilot';
import { emptyInput, type VehicleInput } from '../../src/sim/input/vehicleInput';
import { loadRapier } from '../../src/sim/physics';
import { Simulation } from '../../src/sim/sim';
import type { Vehicle } from '../../src/sim/vehicle/vehicle';
import { trailPoint, trailProgress } from '../../src/sim/world/crawlTrail';
import type { TrackInfo } from '../../src/sim/world/features';
import type { World } from '../../src/sim/world/world';
import type { GullyDef } from '../../src/sim/world/mapTypes';
import { plankTuning } from '../../src/data/tools';

/** Scripted test drives along a world's tracks, shared by the obstacle tests (and free of Vitest, so dev scripts can use them). */
export const DT = 1 / 60;
const deg = 180 / Math.PI;
export type Lockers = 'open' | 'rear' | 'both' | 'high';

export function pathAlong(track: TrackInfo, lateralAt: (s: number) => number = () => 0, back = false) {
  const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
    const s = Math.min(track.poly.length, i * 0.5);
    const p = trailPoint(track, s, lateralAt(s));
    return [p.x, p.z] as [number, number];
  });
  return back ? path.reverse() : path;
}

export function pathFor(track: TrackInfo, back = false) {
  return pathAlong(track, () => 0, back);
}

/** Steepest rise or fall over `window` metres of centreline, in degrees. */
export function steepest(track: TrackInfo, window = 12) {
  let max = 0;
  for (let k = 0; k < track.poly.count; k++) {
    let j = k;
    while (j + 1 < track.poly.count && track.poly.s[j] - track.poly.s[k] < window) j++;
    const ds = track.poly.s[j] - track.poly.s[k];
    if (ds < window * 0.8) continue;
    const grade = Math.abs(Math.atan2(track.profile[j] - track.profile[k], ds)) * (180 / Math.PI);
    if (grade > max) max = grade;
  }
  return max;
}

/**
 * Both lines of a fork as paths: from `lead` metres before the fork on the main track to
 * `tail` metres past where the lines meet again, along the main track ('main') or the
 * other line ('alt').
 */
export function forkPaths(
  world: World,
  fork: { main: string; alt: string; tail?: number },
  lead = 40,
  tail = fork.tail ?? 30,
) {
  const track = (id: string) => world.features.tracks.find((t) => t.def.id === id)!;
  const main = track(fork.main);
  const alt = track(fork.alt);
  const from = trailProgress(main, alt.poly.xs[0], alt.poly.zs[0]).along;
  const to = trailProgress(main, alt.poly.xs[alt.poly.count - 1], alt.poly.zs[alt.poly.count - 1]).along;
  const along = (a: number, b: number) =>
    Array.from({ length: Math.ceil((b - a) / 0.5) + 1 }, (_, i) => {
      const p = trailPoint(main, Math.min(b, a + i * 0.5));
      return [p.x, p.z] as [number, number];
    });
  const start = Math.max(0, from - lead);
  const end = Math.min(main.poly.length, to + tail);
  return {
    main: along(start, end),
    alt: [...along(start, from).slice(0, -1), ...pathFor(alt), ...along(to, end).slice(1)],
    from,
    to,
  };
}

/** Nose-up pitch and right-side-down roll, in degrees. */
export function attitude(v: Vehicle) {
  const q = v.body.rotation();
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x - q.y * q.z)))) * deg,
    roll: Math.asin(Math.max(-1, Math.min(1, 2 * (q.x * q.y + q.w * q.z)))) * deg,
  };
}

export interface Scene {
  sim: Simulation;
  v: Vehicle;
  inputs: Map<string, VehicleInput>;
  /** Locker settings the driver keeps asking for; they engage below walking pace. */
  lockers: { front: boolean; rear: boolean };
}

/**
 * Self-recovery as a player does it: bogged for `after` seconds, hook the winch to the tree
 * or boulder furthest along the path ahead within reach (and near it), then winch in while
 * driving until the vehicle is nearly there or running free. `update` returns whether to
 * hold the winch in this step.
 */
export class WinchRecovery {
  /** How many times the winch was used. */
  uses = 0;
  private stuck = 0;
  private free = 0;
  private target = -1;
  /** Time since the last pull ended (s). */
  private sincePull = Infinity;
  /** Pulls to each anchor so far: a player tries a rock twice, not all afternoon. */
  private readonly pulls = new Map<string, number>();
  /** Time left backing off (s). */
  private backing = 0;

  constructor(
    private readonly sim: Simulation,
    private readonly v: Vehicle,
    private readonly path: ReadonlyArray<readonly [number, number]>,
    private readonly after = 6,
  ) {}

  private indexOf(x: number, z: number): { i: number; d: number } {
    let best = { i: 0, d: Infinity };
    this.path.forEach(([px, pz], i) => {
      const d = Math.hypot(px - x, pz - z);
      if (d < best.d) best = { i, d };
    });
    return best;
  }

  /** Backing off after a stall with nothing to winch to: reverse, straight, gently. */
  get backingOff(): boolean {
    return this.backing > 0;
  }

  update(dt: number): boolean {
    const { sim, v } = this;
    const winch = sim.toolsOf(v.id).winch;
    const here = this.indexOf(v.position.x, v.position.z).i;
    if (winch.attached) {
      this.free = Math.abs(v.speed) > 1.6 ? this.free + dt : 0;
      if (here >= this.target - 6 || winch.length < 3 || this.free > 1.5) {
        sim.detachWinch(v.id);
        this.stuck = 0;
        this.sincePull = 0;
        return false;
      }
      return true;
    }
    this.sincePull += dt;
    if (this.backing > 0) {
      this.backing -= dt;
      this.stuck = 0;
      return false;
    }
    // Not getting anywhere: stopped, or sliding back down the hill under the brakes.
    this.stuck = v.speed < 0.3 ? this.stuck + dt : 0;
    // Stalled again straight after a pull (on the churned verge beside the rock it was
    // pulled to), a player hooks the next anchor at once rather than spinning for longer.
    const after = this.sincePull < 20 ? Math.min(this.after, 2) : this.after;
    if (this.stuck < after) return false;
    let best: { anchor: ReturnType<Simulation['findAnchors']>[number]; i: number } | null = null;
    const mount = v.tuning.winchMount;
    const m = v.localToWorld(mount.x, mount.y, mount.z);
    for (const anchor of sim.findAnchors(v.id)) {
      const { i, d } = this.indexOf(anchor.point.x, anchor.point.z);
      // Not one it is already beside (that pull would only drag it sideways), and not
      // one it has been pulled to twice already.
      const reach = Math.hypot(anchor.point.x - m.x, anchor.point.z - m.z);
      if (
        i > here + 8 &&
        d < 12 &&
        reach > 6 &&
        (this.pulls.get(anchor.id) ?? 0) < 2 &&
        (!best || i > best.i)
      )
        best = { anchor, i };
    }
    this.stuck = 0;
    // Nothing to hook: back off a few metres rather than dig in, as the README says to;
    // it also brings the rock it was pulled to back within reach for a second pull.
    if (!best) {
      this.backing = 2.5;
      return false;
    }
    sim.attachTo(v.id, best.anchor);
    this.pulls.set(best.anchor.id, (this.pulls.get(best.anchor.id) ?? 0) + 1);
    this.target = best.i;
    this.uses++;
    return true;
  }
}

/**
 * Bridging a washout as a player does it: stop short of the gap, square up, lay the two
 * planks across it under the wheels and crawl over. `update` takes the driver's command and
 * returns the one to use this step.
 */
export class PlankCrossing {
  /** Whether the planks went down. */
  placed = false;
  private stopped = 0;

  constructor(
    private readonly sim: Simulation,
    private readonly v: Vehicle,
    private readonly gully: GullyDef,
  ) {}

  /** Distance (m) from the vehicle's front wheels to the middle of the gap, along its heading. */
  private frontToGap(): number {
    const g = this.gully;
    const a = (g.headingDeg * Math.PI) / 180;
    const [dirX, dirZ] = [Math.sin(a), -Math.cos(a)];
    const f = this.v.forward();
    const fl = Math.hypot(f.x, f.z) || 1;
    // Across the gully, signed towards it.
    const [nx, nz] = [-dirZ, dirX];
    const p = this.v.position;
    const lat = (g.x - p.x) * nx + (g.z - p.z) * nz;
    const cos = ((f.x / fl) * nx + (f.z / fl) * nz) * Math.sign(lat || 1);
    return Math.abs(lat) / Math.max(0.5, cos) - Math.abs(Math.min(...this.v.tuning.wheels.map((w) => w.z)));
  }

  update(command: VehicleInput, dt: number): VehicleInput {
    if (this.placed) return command;
    const gap = this.frontToGap();
    if (gap > plankTuning.length / 2 + 1.2 || gap < 0) return command;
    // Pull up and stop.
    this.stopped = Math.abs(this.v.speed) < 0.25 ? this.stopped + dt : 0;
    if (this.stopped < 1) return { ...command, throttle: 0, brake: 1, handbrake: true };
    const kit = this.sim.toolsOf(this.v.id).planks;
    kit.angleDeg = 0;
    kit.distance = Math.max(0, gap - plankTuning.length / 2 - this.v.tuning.wheelRadius * 0.6);
    this.placed = this.sim.placePlanks(this.v.id);
    return { ...command, throttle: 0, brake: 1, handbrake: true };
  }
}

/**
 * Crawling flat out, as the test drives do, with the car sliding backwards down a greasy
 * climb: a player gets on the brakes until it stops (then waits, and winches if there is
 * something to winch to), rather than spinning the wheels all the way down and cutting the
 * clay up as it goes. Both pedals together brake (the brake pedal alone, below walking
 * pace, means reverse), and the handbrake helps hold it.
 */
export function holdOnRollback(v: Vehicle, command: VehicleInput, rolling: { back: boolean }): VehicleInput {
  if (v.speed < -0.3) rolling.back = true;
  else if (v.speed > -0.05) rolling.back = false;
  return rolling.back ? { ...command, throttle: 1, brake: 1, handbrake: true } : command;
}

/**
 * How long a test drive that should fail waits without gaining ground before giving up (s).
 * Long enough for a stall, a roll back and another go, and for the spinning wheels to dig in.
 */
export const GIVE_UP_AFTER = 20;

/**
 * Giving up a drive that has stopped getting anywhere, so a test that expects the car not to
 * make it does not run out the whole clock (v1.45). The drive gives up once the car has gained
 * no new ground along the path for `after` seconds, whether it has stopped, is spinning in
 * place or is rolling back and trying again; time on the winch cable does not count.
 */
export class GiveUp {
  /** Longest wait (s) that ended in new ground: under `after`, giving up changed nothing. */
  longestPause = 0;
  private readonly s: number[] = [0];
  private i = 0;
  private best = 0;
  private idle = 0;

  constructor(
    private readonly path: ReadonlyArray<readonly [number, number]>,
    private readonly after: number,
  ) {
    for (let k = 1; k < path.length; k++)
      this.s.push(this.s[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
  }

  /** Whether to give up, after this step. */
  update(v: Vehicle, dt: number, winching = false): boolean {
    const p = v.position;
    let bestD = Infinity;
    const from = this.i;
    for (let k = Math.max(0, from - 40); k < Math.min(this.path.length, from + 40); k++) {
      const d = Math.hypot(this.path[k][0] - p.x, this.path[k][1] - p.z);
      if (d < bestD) {
        bestD = d;
        this.i = k;
      }
    }
    const along = this.s[this.i];
    if (along > this.best + 0.5) {
      this.best = along;
      this.longestPause = Math.max(this.longestPause, this.idle);
      this.idle = 0;
    } else if (winching) this.idle = 0;
    else this.idle += dt;
    return this.idle >= this.after;
  }
}

/** Hands the event loop back to Vitest so its worker messages don't time out on long drives. */
const yieldToRunner = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Drive a leg with the autopilot; with `winch`, it winches out of a bog to a tree ahead as a
 * player would, and with `planks` it bridges that washout.
 */
export async function runLeg(
  s: Scene,
  track: TrackInfo,
  back = false,
  limit = 110,
  winch = false,
  planks?: GullyDef,
  path?: ReadonlyArray<readonly [number, number]>,
  lookAhead = 0,
  /** Stop once it has gained no ground for this long (s); 0 drives out the whole `limit`. */
  giveUpAfter = 0,
) {
  const { sim, v, inputs } = s;
  const high = v.drivetrain.range === 'high';
  path ??= pathFor(track, back);
  const pilot = new Autopilot(path, high ? 1.5 : 0.7);
  if (lookAhead > 0) pilot.lookAhead = lookAhead;
  const recovery = winch ? new WinchRecovery(sim, v, path) : null;
  const bridge = planks ? new PlankCrossing(sim, v, planks) : null;
  const rolling = { back: false };
  const giveUp = giveUpAfter > 0 ? new GiveUp(path, giveUpAfter) : null;
  let gaveUp = false;
  pilot.lowRange = !high;
  let tilt = 0,
    pitch = 0,
    roll = 0,
    speed = 0,
    sustained = 0,
    deviation = 0,
    water = 0,
    time = 0;
  for (let step = 0; time < limit; time += DT, step++) {
    if (step % 600 === 599) await yieldToRunner();
    let command = pilot.input(v, DT);
    // A high-range trial must stay in high; the recovery pilot normally drops to low.
    if (high) command.toggleRange = false;
    if (pilot.done) break;
    if (!high) {
      command.throttle = 1;
      command.brake = 0;
      command = holdOnRollback(v, command, rolling);
    }
    if (bridge) command = bridge.update(command, DT);
    if (recovery) {
      command.winchIn = recovery.update(DT);
      // On the cable, steer hard for the line: a rock beside the track would otherwise
      // drag the car onto the verge, and a player holds it on the crown while winching.
      pilot.lookAhead = command.winchIn ? 3 : lookAhead;
      // (The brake pedal alone below walking pace is reverse.)
      if (recovery.backingOff) command = { ...command, throttle: 0, brake: 0.7, steer: 0, handbrake: false };
    }
    for (const axle of ['front', 'rear'] as const)
      if (v.differentials[axle] !== s.lockers[axle]) v.toggleDiff(axle);
    inputs.set('p', command);
    sim.step(inputs, DT);
    tilt = Math.max(tilt, v.tiltDeg());
    const a = attitude(v);
    pitch = Math.max(pitch, Math.abs(a.pitch));
    roll = Math.max(roll, Math.abs(a.roll));
    // Dropping off a ledge spikes the speed for a moment; crawl control holds the average.
    sustained += (Math.abs(v.speed) - sustained) * (DT / 0.5);
    speed = Math.max(speed, sustained);
    for (const w of v.wheels) water = Math.max(water, w.water);
    const near = trailProgress(track, v.position.x, v.position.z);
    // At a junction the vehicle begins behind this leg's finite centreline.
    if (near.along > 1 && near.along < track.poly.length - 1) deviation = Math.max(deviation, near.distance);
    if (giveUp?.update(v, DT, sim.toolsOf(v.id).winch.attached)) {
      gaveUp = true;
      break;
    }
  }
  return {
    done: pilot.done,
    remaining: pilot.remaining(v),
    time,
    tilt,
    pitch,
    roll,
    speed,
    deviation,
    /** Deepest water any wheel stood in (m). */
    water,
    /** Times the winch pulled it out of a bog. */
    winched: recovery?.uses ?? 0,
    /** Whether it stopped getting anywhere and gave up before `limit`. */
    gaveUp,
    /** Longest it sat without gaining ground before getting going again (s), with `giveUpAfter`. */
    pause: giveUp?.longestPause ?? 0,
  };
}

export async function driveLeg(
  s: Scene,
  track: TrackInfo,
  back = false,
  limit = 110,
  winch = false,
  planks?: GullyDef,
  path?: ReadonlyArray<readonly [number, number]>,
  lookAhead = 0,
) {
  const result = await runLeg(s, track, back, limit, winch, planks, path, lookAhead);
  if (!result.done) throw new Error(`${track.def.id} stopped ${result.remaining.toFixed(1)} m from the end`);
  return result;
}

/** Drives on one world: a vehicle parked at either end of a track, in low range unless 'high'. */
export function driver(world: World, env: EnvironmentConfig = lateAfternoon) {
  const trackOf = (id: string) => {
    const track = world.features.tracks.find((t) => t.def.id === id);
    if (!track) throw new Error(`No track ${id}`);
    return track;
  };

  async function scene(
    trackId: string,
    back = false,
    lockers: Lockers = 'both',
    tuning: VehicleTuning = vehicleTuning,
  ) {
    const sim = new Simulation(await loadRapier(), world, env);
    const track = trackOf(trackId);
    const p = trailPoint(track, back ? track.poly.length : 0);
    const pose = sim.poseAt(p.x, p.z, p.headingDeg + (back ? 180 : 0), tuning.wheelRadius);
    const v = sim.addVehicle('p', pose, tuning);
    const inputs = new Map([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
    for (let i = 0; i < 90; i++) sim.step(inputs, DT);
    if (lockers !== 'high') {
      // This fixture starts in low; it is not testing a driver shifting while rolling.
      v.drivetrain.range = 'low';
      v.transfer.mode = '4L';
      v.drivetrain.shiftTimer = Math.max(v.drivetrain.shiftTimer, 0.5);
      v.precisionCrawl = true;
    }
    const s: Scene = {
      sim,
      v,
      inputs,
      lockers: { front: lockers === 'both', rear: lockers === 'both' || lockers === 'rear' },
    };
    return { ...s, track };
  }

  async function drive(
    trackId: string,
    lockers: Lockers = 'both',
    back = false,
    limit = 110,
    tuning: VehicleTuning = vehicleTuning,
    giveUpAfter = 0,
  ) {
    const s = await scene(trackId, back, lockers, tuning);
    try {
      return await runLeg(s, s.track, back, limit, false, undefined, undefined, 0, giveUpAfter);
    } finally {
      s.sim.physics.free();
    }
  }

  /**
   * Drive part of a track, from `from` to `to` metres along it, starting parked: crawling in
   * low range with both lockers ('crawl') or in high range at `speed` m/s with open diffs
   * ('high'). Realistic damage, so a careless line shows as cut tyres and bent corners.
   */
  async function stretch(
    trackId: string,
    from: number,
    to: number,
    mode: 'crawl' | 'high',
    tuning: VehicleTuning = vehicleTuning,
    {
      speed = 1.2,
      limit = 120,
      stopAt,
      planks,
      open = false,
      giveUpAfter = 0,
    }: {
      speed?: number;
      limit?: number;
      stopAt?: number;
      planks?: GullyDef;
      /** Crawling, leave the diffs open. */
      open?: boolean;
      /** Stop once it has gained no ground for this long (s); 0 drives out the whole `limit`. */
      giveUpAfter?: number;
    } = {},
  ) {
    const sim = new Simulation(await loadRapier(), world, env);
    try {
      sim.damage = 'realistic';
      const track = trackOf(trackId);
      const start = trailPoint(track, from);
      const v = sim.addVehicle(
        'p',
        sim.poseAt(start.x, start.z, start.headingDeg + (to < from ? 180 : 0), tuning.wheelRadius),
        tuning,
      );
      const inputs = new Map([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
      for (let i = 0; i < 90; i++) sim.step(inputs, DT);
      const crawl = mode === 'crawl';
      if (crawl) {
        // This fixture starts in low; it is not testing a driver shifting while rolling.
        v.drivetrain.range = 'low';
        v.transfer.mode = '4L';
        v.drivetrain.shiftTimer = Math.max(v.drivetrain.shiftTimer, 0.5);
        v.precisionCrawl = true;
      }
      const path: [number, number][] = [];
      const step = to > from ? 0.5 : -0.5;
      for (let s = from; step > 0 ? s <= to : s >= to; s += step) {
        const p = trailPoint(track, s);
        path.push([p.x, p.z]);
      }
      const pilot = new Autopilot(path, crawl ? 0.7 : speed);
      pilot.lowRange = crawl;
      const bridge = planks ? new PlankCrossing(sim, v, planks) : null;
      const rolling = { back: false };
      const giveUp = giveUpAfter > 0 ? new GiveUp(path, giveUpAfter) : null;
      let gaveUp = false;
      let [tilt, roll, deviation, time, stopped, swept, crept] = [0, 0, 0, 0, 0, 0, 0];
      for (let n = 0; time < limit; time += DT, n++) {
        if (n % 600 === 599) await yieldToRunner();
        let command = pilot.input(v, DT);
        if (pilot.done) break;
        if (crawl) {
          command.throttle = 1;
          command.brake = 0;
          command = holdOnRollback(v, command, rolling);
        }
        if (bridge) command = bridge.update(command, DT);
        const along = trailProgress(track, v.position.x, v.position.z).along;
        // Stopping part way (in a creek, say) and waiting there.
        if (stopAt !== undefined && stopped < 20 && Math.abs(along - stopAt) < 1) {
          Object.assign(command, { throttle: 0, brake: 1, steer: 0 });
          stopped += DT;
        }
        for (const axle of ['front', 'rear'] as const)
          if (v.differentials[axle] !== (crawl && !open) && Math.abs(v.speed) < 1.3) v.toggleDiff(axle);
        inputs.set('p', command);
        sim.step(inputs, DT);
        tilt = Math.max(tilt, v.tiltDeg());
        roll = Math.max(roll, Math.abs(attitude(v).roll));
        const near = trailProgress(track, v.position.x, v.position.z);
        deviation = Math.max(deviation, near.distance);
        if (stopped > 0 && stopped < 20) crept = Math.max(crept, near.distance);
        swept = Math.max(swept, v.swept);
        if (giveUp?.update(v, DT)) {
          gaveUp = true;
          break;
        }
      }
      const c = v.condition;
      return {
        done: pilot.done,
        remaining: pilot.remaining(v),
        time,
        tilt,
        roll,
        deviation,
        /** Tyres cut on the way. */
        cuts: c.tyreFault.filter((f) => f !== 'none').length,
        /** Worst suspension corner (1 = sound). */
        suspension: Math.min(...c.suspension),
        /** Longest the current carried it (s); 4 s is swept away. */
        swept,
        /** How far off the line the current pushed it while it was held stopped (m). */
        crept,
        flooded: c.flood.stalled,
        /** Whether it stopped getting anywhere and gave up before `limit`. */
        gaveUp,
        /** Longest it sat without gaining ground before getting going again (s), with `giveUpAfter`. */
        pause: giveUp?.longestPause ?? 0,
      };
    } finally {
      sim.physics.free();
    }
  }

  return { trackOf, scene, drive, stretch };
}

/**
 * Drive one line of a fork (see `forkPaths`) in low range with both lockers, as a careful
 * player would, winching out of a bog to a tree ahead. Reports the time taken, the winching
 * and any cut tyres (damage on Realistic).
 */
export async function driveFork(
  world: World,
  env: EnvironmentConfig,
  path: ReadonlyArray<readonly [number, number]>,
  tuning: VehicleTuning,
  limit = 400,
  /** Called after every step (dev probes log the drive through it). */
  onStep?: (sim: Simulation, v: Vehicle, time: number) => void,
) {
  const sim = new Simulation(await loadRapier(), world, env);
  try {
    sim.damage = 'realistic';
    const [[x0, z0], [x1, z1]] = [path[0], path[4]];
    const heading = (Math.atan2(x1 - x0, -(z1 - z0)) * 180) / Math.PI;
    const v = sim.addVehicle('p', sim.poseAt(x0, z0, heading, tuning.wheelRadius), tuning);
    const inputs = new Map([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
    for (let i = 0; i < 90; i++) sim.step(inputs, DT);
    // This fixture starts in low; it is not testing a driver shifting while rolling.
    v.drivetrain.range = 'low';
    v.transfer.mode = '4L';
    v.drivetrain.shiftTimer = Math.max(v.drivetrain.shiftTimer, 0.5);
    v.precisionCrawl = true;
    const pilot = new Autopilot(path, 1.2);
    pilot.lowRange = true;
    const recovery = new WinchRecovery(sim, v, path);
    const rolling = { back: false };
    let cuts = 0;
    sim.events.on('damage', (e) => {
      if (e.part === 'tyre') cuts++;
    });
    let time = 0;
    for (let step = 0; time < limit; time += DT, step++) {
      if (step % 600 === 599) await yieldToRunner();
      let command = pilot.input(v, DT);
      if (pilot.done) break;
      command.throttle = 1;
      command.brake = 0;
      command = holdOnRollback(v, command, rolling);
      command.winchIn = recovery.update(DT);
      pilot.lookAhead = command.winchIn ? 3 : 0;
      if (recovery.backingOff) command = { ...command, throttle: 0, brake: 0.7, steer: 0, handbrake: false };
      for (const axle of ['front', 'rear'] as const)
        if (!v.differentials[axle] && Math.abs(v.speed) < 1.3) v.toggleDiff(axle);
      inputs.set('p', command);
      sim.step(inputs, DT);
      onStep?.(sim, v, time);
    }
    return {
      done: pilot.done,
      remaining: pilot.remaining(v),
      time,
      winched: recovery.uses,
      cuts,
      stalled: v.condition.flood.stalled,
    };
  } finally {
    sim.physics.free();
  }
}
