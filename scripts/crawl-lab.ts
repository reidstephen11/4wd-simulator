/**
 * Dev helper: drive the Granite Crawl obstacles headlessly and print how the vehicle
 * behaves (time, speed spread, throttle and rpm swings, wheel loads, body contact).
 * Usage: npx vite-node scripts/crawl-lab.ts [trailId] [open|rear|both|high] [crawl|manual] [throttle]
 */
import { challengeTrails } from '../src/data/challenges';
import { lateAfternoon } from '../src/data/environment';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { trailPoint } from '../src/sim/world/crawlTrail';
import { testWorld } from '../tests/world';

const DT = 1 / 60;
const [onlyId, lockers = 'both', mode = 'crawl', throttleArg = '0.35'] = process.argv.slice(2);
const world = testWorld();
const R = await loadRapier();

for (const t of challengeTrails) {
  if (onlyId && onlyId !== 'all' && t.id !== onlyId) continue;
  const sim = new Simulation(R, world, lateAfternoon);
  const track = world.features.tracks.find((x) => x.def.id === t.trackId)!;
  const p0 = trailPoint(track, 0);
  const v = sim.addVehicle('p', sim.poseAt(p0.x, p0.z, p0.headingDeg));
  const inputs = new Map([['p', emptyInput()]]);
  for (let i = 0; i < 60; i++) sim.step(inputs, DT);
  if (lockers !== 'high') v.toggleRange();
  v.precisionCrawl = mode === 'crawl';
  if (lockers === 'both') v.toggleDiff('front');
  if (lockers === 'both' || lockers === 'rear') v.toggleDiff('rear');
  const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
    const q = trailPoint(track, Math.min(track.poly.length, i * 0.5));
    return [q.x, q.z] as [number, number];
  });
  const pilot = new Autopilot(path, 0.7);
  pilot.lowRange = lockers !== 'high';
  let time = 0;
  let throttleFlips = 0;
  let lastThrottleDir = 0;
  let prevThrottle = 0;
  let maxRpm = 0;
  let minLoad = Infinity;
  let airborneWheelTime = 0;
  let bodyContactTime = 0;
  let vyNoise = 0;
  let prevVy = 0;
  let maxTilt = 0;
  let spinTime = 0;
  let knocks = 0;
  let maxKnock = 0;
  let scrapeForce = 0;
  let scrapeSlide = 0;
  let scrapeTime = 0;
  const speeds: number[] = [];
  const contactFilter = (c: { handle: number }) =>
    v.colliders.slice(0, v.tuning.bodyBoxes.length).some((b) => b.handle === c.handle);
  for (; time < 120; time += DT) {
    const cmd = pilot.input(v, DT);
    if (pilot.done) break;
    if (mode === 'crawl') {
      cmd.throttle = 1;
      cmd.brake = 0;
    } else if (lockers !== 'high') {
      cmd.throttle = Number(throttleArg);
      cmd.brake = 0;
    }
    inputs.set('p', cmd);
    sim.step(inputs, DT);
    const dir = Math.sign(v.throttle - prevThrottle);
    if (Math.abs(v.throttle - prevThrottle) > 0.05) {
      if (dir !== 0 && dir !== lastThrottleDir) throttleFlips++;
      lastThrottleDir = dir;
    }
    prevThrottle = v.throttle;
    maxRpm = Math.max(maxRpm, v.drivetrain.rpm);
    for (const w of v.wheels) {
      if (!w.contact) airborneWheelTime += DT / 4;
      else minLoad = Math.min(minLoad, w.load);
      if (w.spin > 0.3) spinTime += DT / 4;
    }
    let touching = false;
    for (const c of v.colliders.slice(0, v.tuning.bodyBoxes.length))
      sim.physics.world.contactPairsWith(c, (other) => {
        if (contactFilter(other)) return;
        sim.physics.world.contactPair(c, other, (m) => {
          if (m.numContacts() > 0) touching = true;
        });
      });
    if (touching) bodyContactTime += DT;
    const vy = v.body.linvel().y;
    vyNoise += Math.abs(vy - prevVy);
    prevVy = vy;
    maxTilt = Math.max(maxTilt, v.tiltDeg());
    if (v.bodyContact.knock > 0) {
      knocks++;
      maxKnock = Math.max(maxKnock, v.bodyContact.knock);
    }
    if (v.bodyContact.force > 0) {
      scrapeTime += DT;
      scrapeForce = Math.max(scrapeForce, v.bodyContact.force);
      scrapeSlide = Math.max(scrapeSlide, v.bodyContact.slide);
    }
    speeds.push(Math.abs(v.speed));
  }
  speeds.sort((a, b) => a - b);
  const pct = (q: number) => speeds[Math.floor(q * (speeds.length - 1))] ?? 0;
  console.log(
    `${t.id.padEnd(16)} ${pilot.done ? 'done' : `STUCK ${pilot.remaining(v).toFixed(1)}m`} t=${time.toFixed(1)}s ` +
      `speed p10/50/90=${pct(0.1).toFixed(2)}/${pct(0.5).toFixed(2)}/${pct(0.9).toFixed(2)} ` +
      `throttleFlips/s=${(throttleFlips / time).toFixed(1)} maxRpm=${maxRpm.toFixed(0)} ` +
      `minLoad=${minLoad.toFixed(0)} air=${((airborneWheelTime / time) * 100).toFixed(0)}% spin=${((spinTime / time) * 100).toFixed(0)}% ` +
      `body=${bodyContactTime.toFixed(1)}s vyJerk=${(vyNoise / time).toFixed(2)} tilt=${maxTilt.toFixed(0)} knocks=${knocks} maxKnock=${maxKnock.toFixed(0)} scrape ${scrapeTime.toFixed(1)}s maxF=${scrapeForce.toFixed(0)} maxSlide=${scrapeSlide.toFixed(2)}`,
  );
}
