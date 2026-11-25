import { describe, expect, it } from 'vitest';
import {
  GHOST_STEP,
  GhostGap,
  GhostRecorder,
  ghostPoseAt,
  loadGhost,
  minSec,
  saveGhost,
  type GhostPose,
} from '../src/sim/ghost';
import { MemoryStore } from './helpers/saves';

const pose = (x: number): GhostPose => ({ x, y: 1, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, suspension: 0.05 });

/** A run along the x axis at 10 m/s for `seconds`, stepped at 60 Hz. */
function drive(rec: GhostRecorder, from: number, seconds: number): void {
  for (let t = from; t <= from + seconds; t += 1 / 60) rec.record(t, pose(t * 10));
}

describe('ghost car', () => {
  it('records a pose every quarter second and replays between them', () => {
    const rec = new GhostRecorder(0);
    drive(rec, 0, 10);
    expect(rec.count).toBeGreaterThanOrEqual(Math.floor(10 / GHOST_STEP));
    expect(rec.count).toBeLessThanOrEqual(Math.floor(10 / GHOST_STEP) + 1);
    const trace = rec.trace('shortie', 10)!;
    const out = pose(0);
    expect(ghostPoseAt(trace, 5.1, out).x).toBeCloseTo(51, 0);
    // Before the start and after the finish it waits at the ends.
    expect(ghostPoseAt(trace, -3, out).x).toBeCloseTo(0, 0);
    expect(ghostPoseAt(trace, 99, out).x).toBeGreaterThan(97);
    expect(out.qw).toBeCloseTo(1);
  });

  it('forgets the driving after a camp when the run restarts there', () => {
    const rec = new GhostRecorder(0);
    drive(rec, 0, 10);
    rec.rewind(4);
    expect(rec.count).toBe(17);
    drive(rec, 4, 2);
    const trace = rec.trace('shortie', 6)!;
    expect(ghostPoseAt(trace, 3, pose(0)).x).toBeCloseTo(30, 0);
    expect(ghostPoseAt(trace, 5.5, pose(0)).x).toBeCloseTo(55, 0);
  });

  it('makes no ghost from a run resumed part way after a reload', () => {
    const rec = new GhostRecorder(600);
    drive(rec, 600, 10);
    expect(rec.trace('shortie', 610)).toBeNull();
  });

  it('saves and loads a ghost, and ignores a broken one', () => {
    const s = new MemoryStore();
    const rec = new GhostRecorder(0);
    drive(rec, 0, 3);
    const trace = rec.trace('troopy', 3)!;
    expect(saveGhost('ironbark', trace, s)).toBe(true);
    expect(loadGhost('ironbark', s)).toEqual(trace);
    expect(loadGhost('other', s)).toBeNull();
    s.setItem('4wdsim.save.v2.ghost.ironbark', '{"version":1,"vehicle":"troopy","seconds":3,"poses":[1,2]}');
    expect(loadGhost('ironbark', s)).toBeNull();
  });

  it('says how far behind or ahead of the ghost the car is', () => {
    const rec = new GhostRecorder(0);
    drive(rec, 0, 60);
    const gap = new GhostGap(rec.trace('shortie', 60)!);
    // At 200 m after 25 s: the ghost was there at 20 s, so 5 s behind.
    for (let x = 0; x <= 200; x += 5) gap.update(x, 0, x / 8);
    expect(gap.update(200, 0, 25)).toBeCloseTo(5, 1);
    expect(gap.update(205, 0, 19)).toBeCloseTo(-1.5, 1);
    expect(minSec(-75.4)).toBe('1:15');
  });
});
