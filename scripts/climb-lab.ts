/**
 * Dev probe: a climb (or any track) driven by the test driver (`runLeg`), with a log every
 * 2 s. npx vite-node scripts/climb-lab.ts <track> [vehicle id] [both|open|rear|high] [limit s] [winch] [map: ironbark|high-country]
 */
import { lateAfternoon } from '../src/data/environment';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { vehicleTuning, type VehicleId } from '../src/data/vehicle';
import { vehicles } from '../src/data/vehicles';
import { buildWorld } from '../src/sim/world/world';
import { trailProgress } from '../src/sim/world/crawlTrail';
import { highCountryMap } from '../tests/fixtures/maps/map';
import { driver, runLeg, type Lockers } from '../tests/helpers/drive';

const trackId = process.argv[2] ?? 'knoll-rock-climb';
const tuning =
  process.argv[3] && process.argv[3] !== '-' ? vehicles[process.argv[3] as VehicleId].tuning : vehicleTuning;
const lockers = (process.argv[4] ?? 'both') as Lockers;
const limit = Number(process.argv[5] ?? 200);
const winch = process.argv[6] === 'winch';
const map = process.argv[7] === 'high-country' ? highCountryMap : ironbarkMap;
const world = buildWorld(map);
const { scene } = driver(world, lateAfternoon);
const s = await scene(trackId, false, lockers, tuning);
const t = world.terrain;
const step = s.sim.step.bind(s.sim);
let time = 0;
let last = -1;
s.sim.step = (inputs, dt) => {
  step(inputs, dt);
  time += dt;
  if (Math.floor(time / 2) !== last) {
    last = Math.floor(time / 2);
    const v = s.v;
    const near = trailProgress(s.track, v.position.x, v.position.z);
    const ws = v.wheels.map(
      (w) =>
        `${w.surface}/${w.spin.toFixed(2)}/${s.sim.churn.at(w.contactPoint.x, w.contactPoint.z).toFixed(2)}`,
    );
    const w = s.sim.toolsOf('p').winch;
    console.log(
      `t=${time.toFixed(0).padStart(3)} along=${near.along.toFixed(1).padStart(6)} off=${near.distance.toFixed(2)} v=${v.speed.toFixed(2)} slope=${t.slopeDegAt(v.position.x, v.position.z).toFixed(0)} thr=${v.throttle.toFixed(2)} brk=${v.brake.toFixed(1)} winch=${w.attached ? `on ${w.length.toFixed(0)}m` : 'off'} wheels(surf/spin/churn)=${ws.join(' ')}`,
    );
  }
};
const r = await runLeg(s, s.track, false, limit, winch);
console.log(
  `${trackId} ${tuning.id} ${lockers}${winch ? ' winch' : ''}: done=${r.done} remaining=${r.remaining.toFixed(1)} time=${r.time.toFixed(0)} winched=${r.winched} tilt=${r.tilt.toFixed(0)} water=${r.water.toFixed(2)}`,
);
s.sim.physics.free();
