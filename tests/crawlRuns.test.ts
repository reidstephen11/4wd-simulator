import { describe, expect, it } from 'vitest';
import { challengeTrails, crawlScoring } from '../src/data/challenges';
import { lateAfternoon } from '../src/data/environment';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { betterRun, CrawlRuns, type CrawlRunEvent, type CrawlRunInput } from '../src/sim/crawlRuns';
import { trailPoint } from '../src/sim/world/crawlTrail';
import { testWorld } from './world';

const DT = 1 / 60;
const trail = challengeTrails.find((t) => t.id === 'whoa-boys')!;

function setup() {
  const world = testWorld();
  const track = world.features.tracks.find((t) => t.def.id === trail.trackId)!;
  const runs = new CrawlRuns([trail], world.features.tracks);
  const at = (along: number, lateral = 0, extra: Partial<CrawlRunInput> = {}): CrawlRunEvent | null => {
    const p = trailPoint(track, along, lateral);
    return runs.update({ x: p.x, z: p.z, tiltDeg: 5, knock: false, winchAttached: false, dt: DT, ...extra });
  };
  return { runs, track, at };
}

describe('scored crawl runs', () => {
  it('starts at either end, counts backing up, knocks and the winch, and finishes at the far end', () => {
    const { runs, track, at } = setup();
    expect(at(1)?.type).toBe('started');
    expect(runs.run?.dir).toBe(1);
    for (let s = 1; s < 6; s += 0.05) at(s);
    // Back up a metre (one penalty), creep forward, back up again (another).
    for (let s = 6; s > 5; s -= 0.05) at(s);
    for (let s = 5; s < 5.6; s += 0.05) at(s);
    for (let s = 5.6; s > 4.8; s -= 0.05) at(s);
    // Two knocks close together count once; a later one counts again.
    at(5, 0, { knock: true });
    at(5, 0, { knock: true });
    for (let k = 0; k < 60; k++) at(5.2);
    at(5.3, 0, { knock: true });
    at(6, 0, { winchAttached: true });
    at(6.1, 0, { winchAttached: true });
    at(6.2);
    let end: CrawlRunEvent | null = null;
    for (let s = 6.2; s < track.poly.length && !end; s += 0.05) end = at(s);
    expect(end?.type).toBe('finished');
    if (end?.type !== 'finished') return;
    expect(end.result.reverses).toBe(2);
    expect(end.result.knocks).toBe(2);
    expect(end.result.winches).toBe(1);
    expect(end.result.points).toBe(2 * crawlScoring.reverse + 2 * crawlScoring.knock + crawlScoring.winch);
    expect(end.best).toBe(true);
    expect(runs.bests[trail.id].points).toBe(end.result.points);
    // Sitting at the finish doesn't start a run back the other way until the car leaves.
    expect(at(track.poly.length - 1)).toBeNull();
    at(track.poly.length / 2, 10);
    expect(at(track.poly.length - 1)?.type).toBe('started');
    expect(runs.run?.dir).toBe(-1);
  });

  it('ends a run that leaves the line, but drifting past the entrance only cancels it', () => {
    const { runs, at } = setup();
    at(1);
    at(1.5, 6);
    expect(runs.run).toBeNull();
    at(30, 10);
    at(1);
    for (let s = 1; s < 8; s += 0.05) at(s);
    const end = at(8, 8);
    expect(end?.type).toBe('failed');
    if (end?.type === 'failed') expect(end.result.dnf).toBe('left');
  });

  it('starts the run for the obstacle the car is on where one ends and the next begins', () => {
    const world = testWorld();
    const runs = new CrawlRuns(challengeTrails, world.features.tracks);
    // The Log Step ends where The Sidling starts.
    const sidling = world.features.tracks.find((t) => t.def.id === 'sidling')!;
    const p = trailPoint(sidling, 0.6);
    const e = runs.update({ x: p.x, z: p.z, tiltDeg: 5, knock: false, winchAttached: false, dt: DT });
    expect(e?.type).toBe('started');
    expect(runs.run?.trail.id).toBe('sidling');
    expect(runs.run?.dir).toBe(1);
  });

  it('ranks fewer penalty points first, then the quicker time', () => {
    expect(betterRun({ points: 1, seconds: 90 }, { points: 2, seconds: 30 })).toBe(true);
    expect(betterRun({ points: 2, seconds: 25 }, { points: 2, seconds: 30 })).toBe(true);
    expect(betterRun({ points: 2, seconds: 35 }, { points: 2, seconds: 30 })).toBe(false);
  });

  it('scores a real drive up the Whoa-boys', async () => {
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    const track = world.features.tracks.find((t) => t.def.id === trail.trackId)!;
    // Start a few metres before the entrance on the approach.
    const p0 = trailPoint(track, 0);
    const back = trailPoint(track, 4);
    const v = sim.addVehicle('p', {
      ...sim.poseAt(p0.x - (back.x - p0.x), p0.z - (back.z - p0.z), p0.headingDeg),
    });
    const inputs = new Map([['p', emptyInput()]]);
    for (let i = 0; i < 30; i++) sim.step(inputs, DT);
    v.toggleRange();
    v.precisionCrawl = true;
    const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
      const q = trailPoint(track, Math.min(track.poly.length, i * 0.5));
      return [q.x, q.z] as [number, number];
    });
    const pilot = new Autopilot(path, 0.7);
    pilot.lowRange = true;
    const runs = new CrawlRuns(world.map.crawlTrails ?? [], world.features.tracks);
    const events: CrawlRunEvent[] = [];
    for (let t = 0; t < 60 && !pilot.done; t += DT) {
      const cmd = pilot.input(v, DT);
      cmd.throttle = 1;
      cmd.brake = 0;
      inputs.set('p', cmd);
      sim.step(inputs, DT);
      const p = v.position;
      const e = runs.update({
        x: p.x,
        z: p.z,
        tiltDeg: v.tiltDeg(),
        knock: v.bodyContact.knock > 0,
        winchAttached: false,
        dt: DT,
      });
      if (e) events.push(e);
    }
    for (let i = 0; i < 120 && events.length < 2; i++) {
      inputs.set('p', { ...emptyInput(), throttle: 0.3 });
      sim.step(inputs, DT);
      const e = runs.update({
        ...v.position,
        tiltDeg: v.tiltDeg(),
        knock: false,
        winchAttached: false,
        dt: DT,
      });
      if (e) events.push(e);
    }
    expect(events.map((e) => e.type)).toEqual(['started', 'finished']);
    const done = events[1];
    if (done.type !== 'finished') return;
    expect(done.result.trailId).toBe('whoa-boys');
    expect(done.result.seconds).toBeGreaterThan(8);
    expect(done.result.seconds).toBeLessThan(40);
    expect(done.result.reverses).toBe(0);
    sim.physics.free();
  });
});
