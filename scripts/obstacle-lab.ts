/**
 * Dev helper: drive the Granite Spur obstacles headlessly and report where they bite:
 * peak pitch and roll and where along the line they happen, stalls, lifted wheels and
 * chassis contact, in 2 m bins along the track.
 * Usage: npx vite-node scripts/obstacle-lab.ts <trackId|all|loop> [open|rear|both|high|matrix] [back]
 * `matrix` prints one summary line per obstacle, locker setting and direction; `loop`
 * drives the whole suggested loop with one car and prints each leg, with bins for the
 * leg named by the third argument.
 */
import { challengeLoopRoute, challengeTrails } from '../src/data/challenges';
import { lateAfternoon } from '../src/data/environment';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import { testWorld } from '../tests/world';

const DT = 1 / 60;
const deg = 180 / Math.PI;
const world = testWorld();
const R = await loadRapier();

interface Bin {
  pitch: number;
  roll: number;
  time: number;
  air: number;
  body: number;
  speed: number;
}

function spawn(id: string, lockers: string, back: boolean) {
  const sim = new Simulation(R, world, lateAfternoon);
  const track = world.features.tracks.find((t) => t.def.id === id)!;
  const p0 = trailPoint(track, back ? track.poly.length : 0);
  const v = sim.addVehicle('p', sim.poseAt(p0.x, p0.z, p0.headingDeg + (back ? 180 : 0)));
  const inputs = new Map([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
  for (let i = 0; i < 90; i++) sim.step(inputs, DT);
  if (lockers !== 'high') {
    v.toggleRange();
    v.precisionCrawl = true;
  }
  return { sim, v, inputs };
}

function drive(
  id: string,
  lockers: string,
  back: boolean,
  limit = 120,
  car: ReturnType<typeof spawn> & { free?: boolean } = spawn(id, lockers, back),
) {
  const { sim, v, inputs } = car;
  const track = world.features.tracks.find((t) => t.def.id === id)!;
  // Like a player, keep pressing the locker buttons until they engage below walking pace.
  const want = { front: lockers === 'both', rear: lockers === 'both' || lockers === 'rear' };
  const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
    const q = trailPoint(track, Math.min(track.poly.length, i * 0.5));
    return [q.x, q.z] as [number, number];
  });
  if (back) path.reverse();
  const pilot = new Autopilot(path, lockers === 'high' ? 1.5 : 0.7);
  pilot.lowRange = lockers !== 'high';
  const bins = new Map<number, Bin>();
  let time = 0,
    maxPitch = 0,
    maxRoll = 0,
    knocks = 0;
  for (; time < limit; time += DT) {
    const cmd = pilot.input(v, DT);
    if (pilot.done) break;
    if (lockers !== 'high') {
      cmd.throttle = 1;
      cmd.brake = 0;
    }
    inputs.set('p', cmd);
    for (const axle of ['front', 'rear'] as const)
      if (want[axle] && !v.differentials[axle]) v.toggleDiff(axle);
    sim.step(inputs, DT);
    const q = v.body.rotation();
    const fy = -2 * (q.y * q.z - q.w * q.x);
    const ry = 2 * (q.x * q.y + q.w * q.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, fy))) * deg;
    const roll = Math.asin(Math.max(-1, Math.min(1, ry))) * deg;
    maxPitch = Math.max(maxPitch, Math.abs(pitch));
    maxRoll = Math.max(maxRoll, Math.abs(roll));
    if (v.bodyContact.knock > 0) knocks++;
    const pos = v.body.translation();
    const key = Math.floor(trailProgress(track, pos.x, pos.z).along / 2) * 2;
    const b = bins.get(key) ?? { pitch: 0, roll: 0, time: 0, air: 0, body: 0, speed: 0 };
    if (Math.abs(pitch) > Math.abs(b.pitch)) b.pitch = pitch;
    if (Math.abs(roll) > Math.abs(b.roll)) b.roll = roll;
    b.time += DT;
    b.air += v.wheels.filter((w) => !w.contact).length * DT;
    if (v.bodyContact.force > 0) b.body += DT;
    b.speed = Math.max(b.speed, Math.abs(v.speed));
    bins.set(key, b);
  }
  const remaining = pilot.remaining(v);
  if (car.free !== false) sim.physics.free();
  return { done: pilot.done, remaining, time, bins, maxPitch, maxRoll, knocks };
}

function printBins(bins: Map<number, Bin>) {
  for (const [k, b] of [...bins.entries()].sort((a, c) => a[0] - c[0]))
    console.log(
      `  ${String(k).padStart(3)}–${String(k + 2).padStart(3)} m  t=${b.time.toFixed(1).padStart(5)} s  pitch=${b.pitch.toFixed(0).padStart(4)}°  roll=${b.roll.toFixed(0).padStart(4)}°  wheel-air=${b.air.toFixed(1).padStart(4)} s  body=${b.body.toFixed(1).padStart(4)} s  vmax=${b.speed.toFixed(1)}`,
    );
}

const [only = 'all', mode = 'matrix', dir = ''] = process.argv.slice(2);
if (only === 'loop') {
  const car = { ...spawn(challengeLoopRoute[0], 'both', false), free: false };
  for (const id of challengeLoopRoute) {
    const r = drive(id, 'both', false, 110, car);
    console.log(
      `${id.padEnd(16)} ${r.done ? 'done ' : 'STUCK'} ${r.time.toFixed(1).padStart(5)} s  pitch ${r.maxPitch.toFixed(0)}° roll ${r.maxRoll.toFixed(0)}°`,
    );
    if (id === mode || !r.done) printBins(r.bins);
    if (!r.done) break;
  }
  car.sim.physics.free();
  process.exit(0);
}
const ids = only === 'all' ? challengeTrails.map((t) => t.trackId) : [only];
for (const id of ids) {
  if (mode === 'matrix') {
    for (const lockers of ['both', 'rear', 'open', 'high'])
      for (const back of lockers === 'both' ? [false, true] : [false]) {
        const r = drive(id, lockers, back, lockers === 'both' ? 120 : 75);
        console.log(
          `${id.padEnd(14)} ${lockers.padEnd(4)} ${back ? 'back' : 'fwd '} ${r.done ? 'done ' : 'STUCK'} ${r.time.toFixed(1).padStart(5)} s  ${r.done ? '' : `${r.remaining.toFixed(1)} m left  `}pitch ${r.maxPitch.toFixed(0)}° roll ${r.maxRoll.toFixed(0)}° knocks ${r.knocks}`,
        );
      }
    continue;
  }
  const r = drive(id, mode, dir === 'back');
  console.log(
    `${id} ${mode}${dir === 'back' ? ' back' : ''}: ${r.done ? 'done' : `STUCK ${r.remaining.toFixed(1)} m from the end`} in ${r.time.toFixed(1)} s`,
  );
  printBins(r.bins);
}
