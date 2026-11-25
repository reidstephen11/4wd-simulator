import type { VehicleTuning } from '../../src/data/vehicle';
import { Autopilot } from '../../src/sim/input/autopilot';
import { emptyInput, type VehicleInput } from '../../src/sim/input/vehicleInput';
import type { Simulation } from '../../src/sim/sim';
import { trailPoint, trailProgress } from '../../src/sim/world/crawlTrail';
import type { TrackInfo } from '../../src/sim/world/features';
import type { World } from '../../src/sim/world/world';
import type { SurprisePlan } from '../../src/sim/world/surprisePlan';
import { DT } from './drive';
import type { Vehicle } from '../../src/sim/vehicle/vehicle';

/** Hands the event loop back to Vitest so its worker messages don't time out on long drives. */
const yieldToRunner = () => new Promise((resolve) => setImmediate(resolve));

export interface GetPastResult {
  past: boolean;
  /** Seconds from the start of the approach. */
  time: number;
  /** How far short of the spot the car was when it started (m along the track). */
  startedShort: number;
  /** Closest the car came to any piece while it was coming down (m, from the piece's surface). */
  closest: number;
  /** The car's speed when it started (m/s). */
  startedSpeed: number;
  /** How many times the winch was hooked on. */
  winched: number;
  /** Times it started (must be once). */
  starts: number;
}

/** Which side of the track (+1 or −1, as `trailPoint` lays laterals) a point is on, and how far along. */
function sideOf(track: TrackInfo, x: number, z: number) {
  const t = trailProgress(track, x, z);
  const c = trailPoint(track, t.along);
  const n = trailPoint(track, t.along, 1);
  const lateral = (x - c.x) * (n.x - c.x) + (z - c.z) * (n.z - c.z);
  return { along: t.along, lateral };
}

/**
 * Bogged on the way: after 6 s stuck, hook the tree 5–28 m ahead that stands nearest the
 * track's line, within 10 m of it and not up a bank (that pulls the car over) and winch in while driving,
 * until nearly there or running free. `update` says whether to winch in this step.
 */
export class TrackRecovery {
  uses = 0;
  private stuck = 0;
  private free = 0;
  private target = 0;

  constructor(
    private readonly sim: Simulation,
    private readonly v: Vehicle,
    private readonly track: TrackInfo,
  ) {}

  update(dt: number): boolean {
    const { sim, v, track } = this;
    const winch = sim.toolsOf(v.id).winch;
    const here = sideOf(track, v.position.x, v.position.z).along;
    if (winch.attached) {
      this.free = Math.abs(v.speed) > 1.6 ? this.free + dt : 0;
      if (here >= this.target - 3 || winch.length < 3 || this.free > 1.5) {
        sim.detachWinch(v.id);
        this.stuck = 0;
        return false;
      }
      return true;
    }
    this.stuck = Math.abs(v.speed) < 0.3 ? this.stuck + dt : 0;
    if (this.stuck < 6) return false;
    this.stuck = 0;
    let best: { anchor: ReturnType<Simulation['findAnchors']>[number]; off: number; along: number } | null =
      null;
    for (const anchor of sim.findAnchors(v.id)) {
      if (anchor.kind !== 'tree') continue;
      const t = sideOf(track, anchor.point.x, anchor.point.z);
      const off = Math.abs(t.lateral);
      // Up a bank: well above the track level with it.
      const c = trailPoint(track, t.along);
      const bank = anchor.point.y - 1.1 - sim.world.terrain.heightAt(c.x, c.z);
      if (t.along < here + 5 || off > 10 || bank > 1.5) continue;
      if (!best || off < best.off) best = { anchor, off, along: t.along };
    }
    if (process.env.SURPRISE_DEBUG)
      console.log(
        'stuck at',
        here.toFixed(1),
        sim
          .findAnchors(v.id)
          .filter((a) => a.kind === 'tree')
          .map((a) => {
            const t = sideOf(track, a.point.x, a.point.z);
            return `${t.along.toFixed(0)}/${t.lateral.toFixed(1)}/${(a.point.y - v.position.y).toFixed(1)}`;
          })
          .join(' '),
      );
    if (!best) return false;
    sim.attachTo(v.id, best.anchor);
    this.target = best.along;
    this.uses++;
    return true;
  }
}

/** Tracks the route drive crawls (scripts/creb-drive.ts). */
export const CRAWLED = new Set([
  'big-red',
  'creb-ridge',
  'roaring-meg-climb',
  'bobs-hill',
  'concrete-descent',
]);

/**
 * Where to start the drive up to a spot: `approach` metres short of it, or just past a
 * washout on the way (crossing one takes the planks, which these drives don't lay).
 */
export function approachStart(world: World, track: TrackInfo, at: number, approach: number): number {
  let from = Math.max(0, at - approach);
  for (const g of world.map.gullies) {
    const t = trailProgress(track, g.x, g.z);
    if (t.distance < 5 && t.along > from - 10 && t.along < at) from = Math.max(from, t.along + 15);
  }
  // Not in a ford: start on dry ground.
  const { creekDistance } = world.features;
  const t = world.terrain;
  const wet = (s: number) => {
    const p = trailPoint(track, s);
    return creekDistance[Math.round(p.z + t.halfZ) * t.resX + Math.round(p.x + t.halfX)] < 4;
  };
  while (from < at - 10 && wet(from)) from += 2;
  return from;
}

/**
 * Drive up to a run's surprise as a player would: along the track at a bush pace until it
 * starts, stop, wait for it to come down, then go on in low range with both lockers.
 *
 * A tree: stop short of it on the side its root lies, hook the crown end and winch it in, so
 * the trunk swings round to lie along that side; then crawl past on the other side.
 * Rocks: crawl past on the side away from the bank, where the big ones don't land. Either
 * way, if the car still sticks, hook whatever piece is nearest and winch it in.
 */
export async function getPast(
  sim: Simulation,
  plan: SurprisePlan,
  tuning: VehicleTuning,
  log: (s: string) => void = () => {},
  approach = 120,
  speed = 4.5,
  /** Fuel on board (a big tank, to measure what it burns). */
  fuel?: number,
): Promise<GetPastResult> {
  const track = sim.world.features.tracks.find((t) => t.def.id === plan.track)!;
  const from = approachStart(sim.world, track, plan.at, approach);
  const start = trailPoint(track, from);
  const v = sim.addVehicle('p', sim.poseAt(start.x, start.z, start.headingDeg, tuning.wheelRadius), tuning);
  if (fuel !== undefined) v.condition.fuel = fuel;
  const inputs = new Map<string, VehicleInput>([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
  const pieces = [...sim.dynamics.values()].filter((o) => o.id.startsWith(`${plan.id}:`));
  const winch = sim.toolsOf('p').winch;

  // A path from `a` to `b` along the track, `lateral` metres off its centre line.
  const pathAlong = (a: number, b: number, lateral: (s: number) => number) => {
    const out: [number, number][] = [];
    for (let s = a; s <= b; s += 0.5) {
      const p = trailPoint(track, s, lateral(s));
      out.push([p.x, p.z]);
    }
    return out;
  };
  const end = Math.min(track.poly.length, plan.at + 30);
  const approachPath = pathAlong(from, end, () => 0);
  // On the range the route drive crawls, in low range with both lockers (creb-drive.ts).
  const crawlIn = CRAWLED.has(plan.track);
  let pilot = new Autopilot(approachPath, crawlIn ? 1.2 : speed);
  if (crawlIn) {
    v.toggleRange();
    v.precisionCrawl = true;
    pilot.lowRange = true;
  }

  let mode: 'approach' | 'stopping' | 'toTree' | 'hook' | 'winch' | 'backUp' | 'past' = 'approach';
  let pulls = 0;
  let backTime = 0;
  let thenPass = false;
  let startedShort = NaN;
  let startedSpeed = NaN;
  let closest = Infinity;
  let winched = 0;
  let starts = 0;
  let stuck = 0;
  let winchTime = 0;
  // The side the car keeps to going past (+1/−1), and where the tree's root lies.
  let passSide = 0;
  sim.events.on('surprise', (e) => {
    if (e.id !== plan.id || e.phase !== 'started') return;
    starts++;
    const p = v.body.translation();
    startedShort = plan.at - trailProgress(track, p.x, p.z).along;
    startedSpeed = v.speed;
  });
  // Settle on the handbrake (listening already: starting this close, it may start now).
  for (let i = 0; i < 90; i++) sim.step(inputs, DT);
  const here = () => trailProgress(track, v.position.x, v.position.z).along;
  // Where the pieces lie now, for the log.
  const layout = () =>
    pieces
      .map((o) => {
        const b = o.body.translation();
        const where = (x: number, z: number) => {
          const t = sideOf(track, x, z);
          return `${(t.along - plan.at).toFixed(1)} m, ${t.lateral.toFixed(1)} across`;
        };
        if (!o.def) return `${o.id.split(':')[1]} at ${where(b.x, b.z)}`;
        const q = o.body.rotation();
        // The trunk's axis is its local +y.
        const ax = 2 * (q.x * q.y - q.w * q.z);
        const az = 2 * (q.y * q.z + q.w * q.x);
        const h = o.def.length / 2;
        return `root ${where(b.x - ax * h, b.z - az * h)}, crown ${where(b.x + ax * h, b.z + az * h)}`;
      })
      .join('; ');
  // Bogged on the way (a mud hole, not the surprise), winch out to a tree ahead.
  let recovery = new TrackRecovery(sim, v, track) as TrackRecovery | null;
  let approachStuck = 0;
  let recovered = 0;
  const crawl = (path: [number, number][]) => {
    if (v.drivetrain.range === 'high') v.toggleRange();
    v.precisionCrawl = true;
    const a = new Autopilot(path, 1.2);
    a.lowRange = true;
    recovered += recovery?.uses ?? 0;
    recovery = new TrackRecovery(sim, v, track);
    return a;
  };
  const passPath = () => {
    const at = here();
    return pathAlong(
      at,
      end,
      // Over to the far side within 6 m (no sooner than 18 m short), and back to the middle past the spot.
      // Clear of a tree's trunk; past rocks, a little less far over, as the far side of a
      // cutting is the drop.
      (s) =>
        passSide *
        (plan.kind === 'rockfall' ? 0.85 : 1.1) *
        Math.max(0, Math.min(1, (s - Math.max(at, plan.at - 18)) / 6, (plan.at + 22 - s) / 8)),
    );
  };
  const hook = (prefer?: string) => {
    const options = sim.findAnchors('p').filter((a) => a.body && pieces.some((o) => o.body === a.body));
    const p = v.body.translation();
    const pick =
      options.find((a) => prefer && a.id.endsWith(prefer)) ??
      options.reduce<(typeof options)[number] | null>(
        (best, a) =>
          !best ||
          Math.hypot(a.point.x - p.x, a.point.z - p.z) < Math.hypot(best.point.x - p.x, best.point.z - p.z)
            ? a
            : best,
        null,
      );
    log(options.map((a) => a.id).join(' '));
    if (!pick) return false;
    sim.attachTo('p', pick);
    winched++;
    winchTime = 0;
    log(`hooked ${pick.label}`);
    return true;
  };

  let time = 0;
  for (let step = 0; time < 420; time += DT, step++) {
    if (step % 600 === 599) await yieldToRunner();
    const phase = sim.surprises?.phaseOf(plan.id);
    const p = v.body.translation();
    if (phase === 'falling')
      for (const o of pieces) {
        const b = o.body.translation();
        closest = Math.min(
          closest,
          Math.hypot(b.x - p.x, b.z - p.z) - (o.def ? o.def.length / 2 : (o.radius ?? 0)),
        );
      }
    let cmd = pilot.input(v, DT);
    if ((pilot.done && mode === 'past') || here() > plan.at + 12) break;
    if (mode === 'approach') {
      // Bogged in a mud hole on the way: lockers in, and winch out to a tree ahead.
      approachStuck = Math.abs(v.speed) < 0.3 ? approachStuck + DT : 0;
      for (const axle of ['front', 'rear'] as const) {
        const want = crawlIn || approachStuck > 4 || winch.attached;
        if (v.differentials[axle] !== want && Math.abs(v.speed) < 1.3) v.toggleDiff(axle);
      }
      // Stuck in high range (out of a ford, say), drop to low range as a driver would.
      if (approachStuck > 4 && v.drivetrain.range === 'high') {
        v.toggleRange();
        pilot.lowRange = true;
      }
      cmd.winchIn = recovery?.update(DT) ?? false;
    }
    if (mode === 'approach' && phase !== 'waiting') {
      if (winch.attached) sim.detachWinch('p');
      mode = 'stopping';
      log(`started ${startedShort.toFixed(1)} m short at ${v.speed.toFixed(1)} m/s`);
    }
    if (mode === 'stopping') {
      // Brake to a stop and hold it there (the brake pedal reverses once stopped).
      cmd = { ...emptyInput(), brake: v.speed > 0.4 ? 1 : 0, handbrake: v.speed <= 0.4 };
      if (phase === 'down' && Math.abs(v.speed) < 0.2) {
        log(`down; going on from ${(plan.at - here()).toFixed(1)} m short`);
        const trunk = plan.pieces.find((q) => q.kind === 'trunk');
        if (trunk && trunk.kind === 'trunk') {
          // Stop 12 m short of the trunk's nearest point, to its root's side, so the cable is long enough to swing the crown over.
          const root = sideOf(track, trunk.base.x, trunk.base.z);
          const crown = sideOf(
            track,
            trunk.base.x + trunk.fx * trunk.length,
            trunk.base.z + trunk.fz * trunk.length,
          );
          const rootSide = Math.sign(root.lateral) || 1;
          passSide = -rootSide;
          const stopAt = Math.min(root.along, crown.along) - 12;
          pilot = crawl(
            pathAlong(here(), stopAt, (s) => rootSide * Math.min(1.2, Math.max(0, (s - stopAt + 20) / 12))),
          );
          mode = 'toTree';
          log(
            `to ${(stopAt - plan.at).toFixed(1)} m on the root's side (${rootSide}), from ${(here() - plan.at).toFixed(1)}`,
          );
        } else {
          let bank = 0;
          for (const q of plan.pieces)
            if (q.kind === 'rock' && q.rx > 0.4) bank += sideOf(track, q.end.x, q.end.z).lateral;
          passSide = bank > 0 ? -1 : 1;
          pilot = crawl(passPath());
          mode = 'past';
        }
        continue;
      }
    }
    if (mode === 'toTree' && pilot.done) {
      log(`at the tree, ${(here() - plan.at).toFixed(1)} m; ${layout()}`);
      mode = 'hook';
      cmd = { ...emptyInput(), handbrake: true };
    }
    if (mode === 'toTree' || mode === 'past') {
      for (const axle of ['front', 'rear'] as const) if (!v.differentials[axle]) v.toggleDiff(axle);
      cmd.throttle = 1;
      cmd.brake = 0;
      const before = recovery?.uses ?? 0;
      cmd.winchIn = recovery?.update(DT) ?? false;
      if ((recovery?.uses ?? 0) > before) {
        const w = sideOf(track, v.position.x, v.position.z);
        const a = winch.anchor?.point;
        const at = a ? sideOf(track, a.x, a.z) : null;
        log(
          `stuck at ${(w.along - plan.at).toFixed(1)} m, ${w.lateral.toFixed(1)} across: winching to ${winch.anchor?.label} at ${at ? `${(at.along - plan.at).toFixed(1)} m, ${at.lateral.toFixed(1)} across` : '?'}`,
        );
      }
      // Up against the tree before the stopping point: hook it from here.
      const trunk = pieces.find((o) => o.kind === 'fallenTree');
      stuck = Math.abs(v.speed) < 0.15 && !winch.attached ? stuck + DT : 0;
      if (mode === 'toTree' && trunk && stuck > 3) {
        const b = trunk.body.translation();
        if (Math.hypot(b.x - p.x, b.z - p.z) < 9) {
          log(`stopped by the tree at ${(here() - plan.at).toFixed(1)} m`);
          mode = 'hook';
        }
      }
    }
    if (mode === 'hook') {
      cmd = { ...emptyInput(), handbrake: true };
      if (Math.abs(v.speed) < 0.1) mode = hook(pulls < 3 ? ':crown' : undefined) ? 'winch' : 'past';
    }
    if (mode === 'backUp') {
      // Back up a few metres (the brake pedal reverses once stopped) to pull again.
      backTime += DT;
      cmd = { ...emptyInput(), brake: 1 };
      // Before driving past, back far enough to pull out round the crown.
      // ...but not off the edge (reversing on wet clay, the car slides).
      const drift = Math.abs(sideOf(track, v.position.x, v.position.z).lateral);
      if (backTime > (thenPass ? 8 : 5) || (backTime > 1 && drift > 1.6)) {
        cmd = { ...emptyInput(), handbrake: true };
        if (Math.abs(v.speed) < 0.1) {
          mode = thenPass ? 'past' : 'hook';
          if (thenPass) {
            pilot = crawl(passPath());
            log(`passing on side ${passSide}`);
          }
        }
      }
    }
    if (mode === 'winch') {
      // Winch in on the handbrake, holding the brake (it eases back against the pull), until it has come round or the cable is short.
      cmd = { ...emptyInput(), handbrake: true, brake: 1, winchIn: true };
      winchTime += DT;
      // A driver stops once the crown has come over to the root's side, before the winch
      // drags the whole tree along the track towards the car.
      const trunk = pieces.find((o) => o.kind === 'fallenTree');
      let over = false;
      if (trunk?.def) {
        const q = trunk.body.rotation();
        const b = trunk.body.translation();
        const h = trunk.def.length / 2;
        const crown = sideOf(
          track,
          b.x + 2 * (q.x * q.y - q.w * q.z) * h,
          b.z + 2 * (q.y * q.z + q.w * q.x) * h,
        );
        over = crown.lateral * -passSide > 0.6;
      }
      if (over || winch.length <= 3 || winchTime > 45) {
        sim.detachWinch('p');
        log(`winched ${winchTime.toFixed(0)} s, cable ${winch.length.toFixed(1)} m; ${layout()}`);
        stuck = 0;
        pulls++;
        // Pull again from further back until the crown has come over to the root's side.
        const trunk = pieces.find((o) => o.kind === 'fallenTree');
        if (trunk?.def && pulls < 3) {
          const q = trunk.body.rotation();
          const b = trunk.body.translation();
          const h = trunk.def.length / 2;
          const crown = sideOf(
            track,
            b.x + 2 * (q.x * q.y - q.w * q.z) * h,
            b.z + 2 * (q.y * q.z + q.w * q.x) * h,
          );
          if (crown.lateral * -passSide < 0.6) {
            mode = 'backUp';
            backTime = 0;
            log('backing up to pull again');
          }
        }
        // Back away from the trunk before pulling out round it.
        if (mode === 'winch') {
          mode = 'backUp';
          backTime = 0;
          thenPass = true;
        }
      }
    }
    inputs.set('p', cmd);
    sim.step(inputs, DT);
  }
  const past = here() > plan.at + 12;
  const last = sideOf(track, v.position.x, v.position.z);
  log(
    `ended at ${(last.along - plan.at).toFixed(1)} m, ${last.lateral.toFixed(1)} across, heading off by ${v.tiltDeg().toFixed(0)}° tilt`,
  );
  recovered += recovery?.uses ?? 0;
  return { past, time, startedShort, startedSpeed, closest, winched: winched + recovered, starts };
}
