import { lateAfternoon, type EnvironmentConfig } from '../../src/data/environment';
import { vehicleTuning, type VehicleTuning } from '../../src/data/vehicle';
import type { WinchClimb } from '../../src/data/winchClimbs';
import { Autopilot } from '../../src/sim/input/autopilot';
import { emptyInput, type VehicleInput } from '../../src/sim/input/vehicleInput';
import { loadRapier } from '../../src/sim/physics';
import { Simulation } from '../../src/sim/sim';
import { trailPoint, trailProgress } from '../../src/sim/world/crawlTrail';
import type { World } from '../../src/sim/world/world';
import { DT, pathFor } from './drive';

/** Hands the event loop back to Vitest so its worker messages don't time out on long drives. */
const yieldToRunner = () => new Promise((resolve) => setImmediate(resolve));

export interface WinchRun {
  /** Reached the top of the climb. */
  reached: boolean;
  time: number;
  /** Furthest point reached along the climb (m). */
  furthest: number;
  tilt: number;
  /** Each hook-up: the index of the climb's anchor quick attach picked (-1: something else). */
  hookups: number[];
}

/**
 * Winch up a climb as a player would: from the bay at the bottom, press E (quick attach)
 * to hook the nearest useful anchor ahead and reel in at a crawl, steering gently up the
 * line. A few metres short of the anchor, let go, drive up onto the landing, stop and
 * hook the next one, until the top.
 */
export async function winchUp(
  world: World,
  climb: WinchClimb,
  tuning: VehicleTuning = vehicleTuning,
  env: EnvironmentConfig = lateAfternoon,
  limit = 300,
  log?: (line: string) => void,
): Promise<WinchRun> {
  const sim = new Simulation(await loadRapier(), world, env);
  const track = world.features.tracks.find((t) => t.def.id === climb.id)!;
  // At the top of the bay, nose to the first pitch.
  const start = trailPoint(track, 3.5);
  const v = sim.addVehicle('p', sim.poseAt(start.x, start.z, start.headingDeg, tuning.wheelRadius), tuning);
  const inputs = new Map<string, VehicleInput>([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
  for (let i = 0; i < 90; i++) sim.step(inputs, DT);
  v.toggleRange();
  // Crawl control: a light throttle creeps slower than the winch reels in.
  v.precisionCrawl = true;
  const pilot = new Autopilot(pathFor(track), 0.6);
  pilot.lowRange = true;
  const L = track.poly.length;
  const winch = sim.toolsOf('p').winch;
  const hookups: number[] = [];
  let target = -1;
  let state: 'hook' | 'pull' | 'drive' = 'hook';
  let tilt = 0,
    furthest = 0,
    time = 0,
    clock = 0;
  try {
    for (let step = 0; time < limit; time += DT, step++) {
      if (step % 600 === 599) await yieldToRunner();
      for (const axle of ['front', 'rear'] as const) if (!v.differentials[axle]) v.toggleDiff(axle);
      const along = trailProgress(track, v.position.x, v.position.z).along;
      furthest = Math.max(furthest, along);
      tilt = Math.max(tilt, v.tiltDeg());
      if (along > L - 3) return { reached: true, time, furthest, tilt, hookups };
      const command = pilot.input(v, DT);
      command.brake = 0;
      clock += DT;
      // The turn in the landing at the top of the pitch being climbed.
      const turn = target >= 0 && target < climb.turns.length ? climb.turns[target] : L;
      if (state === 'hook') {
        // Stopped: hold still for a moment, then hook the next anchor.
        command.throttle = 0;
        command.steer = 0;
        if (clock > 0.8) {
          sim.quickAttach('p');
          if (!winch.attached) return { reached: false, time, furthest, tilt, hookups };
          const a = winch.anchor!.point;
          target = climb.anchors.findIndex((b) => Math.hypot(b.x - a.x, b.z - a.z) < 1.5);
          hookups.push(target);
          state = 'pull';
          clock = 0;
        }
      } else if (state === 'pull') {
        // Reel in at a crawl, keeping the nose on the anchor.
        const a = winch.anchor!.point,
          f = v.forward();
        const off = Math.atan2(
          f.x * (a.z - v.position.z) - f.z * (a.x - v.position.x),
          f.x * (a.x - v.position.x) + f.z * (a.z - v.position.z),
        );
        command.winchIn = true;
        command.throttle = 0.3;
        command.steer = Math.max(-0.5, Math.min(0.5, off * 2));
        // Let go once the car is up on the landing, leaving room to turn on it.
        const landing = target >= 0 ? climb.pitchRanges[target][1] : L;
        if (winch.distance() < 5 || along > landing + 1.5) {
          sim.quickAttach('p');
          command.winchIn = false;
          state = 'drive';
          clock = 0;
        }
      } else {
        // Round the turn on the landing at a crawl, then stop.
        command.throttle = 0.35;
        command.steer = Math.max(-0.8, Math.min(0.8, command.steer));
        // Stop lined up with the next pitch. After the last pitch, drive on over the top.
        const last = target === climb.anchors.length - 1;
        const next = last ? null : trailPoint(track, climb.pitchRanges[target + 1][0] + 3);
        const f = v.forward();
        const aligned =
          next !== null &&
          Math.abs(
            Math.atan2(
              Math.sin((next.headingDeg * Math.PI) / 180 - Math.atan2(f.x, -f.z)),
              Math.cos((next.headingDeg * Math.PI) / 180 - Math.atan2(f.x, -f.z)),
            ),
          ) <
            (12 * Math.PI) / 180;
        if (!last && ((along > turn + 2 && aligned) || clock > 15)) {
          command.throttle = 0;
          if (Math.abs(v.speed) < 0.15) {
            state = 'hook';
            clock = 0;
          }
        }
      }
      inputs.set('p', command);
      sim.step(inputs, DT);
      if (log && step % 30 === 0) {
        const a = winch.anchor?.point;
        log(
          `t=${time.toFixed(1)} ${state} along=${along.toFixed(1)} v=${v.speed.toFixed(2)} tilt=${v.tiltDeg().toFixed(0)} ` +
            `winch=${a ? `(${a.x.toFixed(0)},${a.z.toFixed(0)}) T=${(winch.tension / 1000).toFixed(1)}kN d=${winch.distance().toFixed(1)}` : 'off'} ` +
            `thr=${command.throttle.toFixed(2)} steer=${command.steer.toFixed(2)} contacts=${v.wheels.map((w) => (w.contact ? 1 : 0)).join('')} body=${(v.bodyContact.force / 1000).toFixed(1)}kN`,
        );
      }
    }
    return { reached: false, time, furthest, tilt, hookups };
  } finally {
    sim.physics.free();
  }
}
