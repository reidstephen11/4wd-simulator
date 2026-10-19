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

/** Scripted test drives along a world's tracks, shared by the obstacle tests (and free of Vitest, so dev scripts can use them). */
export const DT = 1 / 60;
const deg = 180 / Math.PI;
export type Lockers = 'open' | 'rear' | 'both' | 'high';

export function pathFor(track: TrackInfo, back = false) {
  const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
    const p = trailPoint(track, Math.min(track.poly.length, i * 0.5));
    return [p.x, p.z] as [number, number];
  });
  return back ? path.reverse() : path;
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

/** Hands the event loop back to Vitest so its worker messages don't time out on long drives. */
const yieldToRunner = () => new Promise((resolve) => setImmediate(resolve));

export async function runLeg(s: Scene, track: TrackInfo, back = false, limit = 110) {
  const { sim, v, inputs } = s;
  const high = v.drivetrain.range === 'high';
  const pilot = new Autopilot(pathFor(track, back), high ? 1.5 : 0.7);
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
    const command = pilot.input(v, DT);
    if (pilot.done) break;
    if (!high) {
      command.throttle = 1;
      command.brake = 0;
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
  };
}

export async function driveLeg(s: Scene, track: TrackInfo, back = false, limit = 110) {
  const result = await runLeg(s, track, back, limit);
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
      v.toggleRange();
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
  ) {
    const s = await scene(trackId, back, lockers, tuning);
    try {
      return await runLeg(s, s.track, back, limit);
    } finally {
      s.sim.physics.free();
    }
  }

  return { trackOf, scene, drive };
}
