import { describe, expect, it } from 'vitest';
import { GateCount, crosses, footprintSize, type CarFootprint } from '../src/sim/gateCount';
import { vehicles } from '../src/data/vehicles';
import { gateLapDetail, gateText } from '../src/ui/hud';
import type { GateInfo } from '../src/sim/world/features';
import { crawlerCreekWorld } from './world';

/** Gates every 10 m along a straight track heading north (-z) from the origin. */
function line(n: number): GateInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    trackId: 't',
    headingDeg: 0,
    left: { x: -1.8, y: 0, z: -10 * (i + 1) },
    right: { x: 1.8, y: 0, z: -10 * (i + 1) },
  }));
}

/** The short-wheelbase 4WD heading north. */
const north: CarFootprint = { fx: 0, fz: -1, ...footprintSize(vehicles.shortie.tuning) };

/** Drive from (x, z0) to (x, z1) in 0.25 m steps; all the events on the way. */
function drive(c: GateCount, x: number, z0: number, z1: number, car?: CarFootprint) {
  const events = [];
  const step = z1 > z0 ? 0.25 : -0.25;
  for (let z = z0; step > 0 ? z <= z1 : z >= z1; z += step) events.push(...c.update(x, z, car));
  return events;
}

describe('gate count', () => {
  it('passes a gate only between its flags and in its direction', () => {
    const [g] = line(1);
    expect(crosses(g, 0, -9.9, 0, -10.1)).toBe(true);
    expect(crosses(g, 0, -10.1, 0, -9.9)).toBe(false);
    expect(crosses(g, 2.2, -9.9, 2.2, -10.1)).toBe(false);
    expect(crosses(g, -1.7, -9.9, -1.7, -10.1)).toBe(true);
  });

  it('counts gates in order, and the lap', () => {
    const c = new GateCount(line(4));
    const events = drive(c, 0, 0, -45);
    expect(events.filter((e) => e.type === 'passed').map((e) => e.type === 'passed' && e.n)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(events.at(-1)).toEqual({ type: 'finished', passed: 4, missed: 0, flags: 0 });
    expect(c.next).toBe(5);
  });

  it('counts a gate driven round as missed', () => {
    const c = new GateCount(line(4));
    drive(c, 0, 0, -15);
    drive(c, 3, -15, -25);
    const events = drive(c, 0, -25, -35);
    expect(events).toContainEqual({ type: 'missed', gates: [2], n: 3 });
    expect(c.missed).toBe(1);
    expect(c.passed).toBe(2);
    expect(c.next).toBe(4);
  });

  it('starts where the trail is joined, ignores driving back and teleports', () => {
    const c = new GateCount(line(6));
    expect(drive(c, 0, -25, -35)).toEqual([{ type: 'passed', n: 3 }]);
    expect(c.missed).toBe(0);
    // Back the wrong way through gate 3 and forwards again: nothing new.
    expect(drive(c, 0, -35, -25)).toEqual([]);
    expect(drive(c, 0, -25, -35)).toEqual([]);
    // A jump past gates 4 and 5 is not a drive through them.
    c.update(0, -55.5);
    expect(c.next).toBe(4);
  });

  it('finds every Crawler Creek gate square across its track', () => {
    const gates = crawlerCreekWorld().features.gates;
    expect(gates.length).toBe(52);
    for (const g of gates) {
      // Drive straight through the middle of each gate in its direction of travel.
      const h = (g.headingDeg * Math.PI) / 180;
      const mx = (g.left.x + g.right.x) / 2,
        mz = (g.left.z + g.right.z) / 2;
      const fx = Math.sin(h),
        fz = -Math.cos(h);
      expect(crosses(g, mx - fx, mz - fz, mx + fx, mz + fz), `gate ${g.n}`).toBe(true);
    }
  });

  it('counts each flag the car touches once a lap', () => {
    const c = new GateCount(line(4));
    // Through the middle: the car is 1.84 m wide and the gates 3.6 m, so nothing is touched.
    expect(drive(c, 0, 0, -25, north).filter((e) => e.type === 'flag')).toEqual([]);
    // 0.9 m to the left, gate 3's left flag is under the car's left side.
    expect(drive(c, -0.9, -25, -35, north).filter((e) => e.type === 'flag')).toEqual([
      { type: 'flag', n: 3, side: 'left' },
    ]);
    expect(c.flags).toBe(1);
    // Backing up and touching it again doesn't count twice.
    drive(c, -0.9, -35, -25, north);
    drive(c, -0.9, -25, -35, north);
    expect(c.flags).toBe(1);
    const events = drive(c, 0.9, -35, -45, north);
    expect(events).toContainEqual({ type: 'flag', n: 4, side: 'right' });
    expect(events.at(-1)).toEqual({ type: 'finished', passed: 4, missed: 0, flags: 2 });
  });

  it('counts a flag touched entering the first gate of a lap, but not ones before it', () => {
    const c = new GateCount(line(4));
    // Brush gate 1's right flag sideways on, then drive through gate 2 clipping its left flag.
    const side: CarFootprint = { ...north, fx: 1, fz: 0 };
    c.update(0.3, -10);
    expect(c.update(0.4, -10, side)).toContainEqual({ type: 'flag', n: 1, side: 'right' });
    expect(c.flags).toBe(0);
    drive(c, -0.9, -15, -25, north);
    expect(c.next).toBe(3);
    expect(c.flags).toBe(1);
  });

  it('leaves the flags of a finished lap alone until the next one starts', () => {
    const c = new GateCount(line(2));
    drive(c, 0.9, 0, -25, north);
    expect(c.flags).toBe(2);
    // Past the end; touching gate 2's flag again on the way back is not this lap's.
    drive(c, 0.9, -25, -15, { ...north, fz: 1 });
    expect(c.flags).toBe(2);
    drive(c, 0, 0, -15, north);
    expect(c.flags).toBe(0);
  });

  it('shows flags touched in the gate count and the lap result', () => {
    const g = { next: 14, total: 52, passed: 13, missed: 1, flags: 0 };
    expect(gateText(g)).toBe('Gate 14 / 52 · 1 missed');
    expect(gateText({ ...g, flags: 2 })).toBe('Gate 14 / 52 · 1 missed · 2 flags');
    expect(gateText({ ...g, next: 53, passed: 52, missed: 0, flags: 1 })).toBe(
      'Lap done: 52 / 52 gates · 1 flag',
    );
    expect(gateLapDetail(0, 0)).toBe('Every gate in order, no flags touched');
    expect(gateLapDetail(0, 3)).toBe('Every gate in order · 3 flags touched');
    expect(gateLapDetail(2, 1)).toBe('2 missed · 1 flag touched');
  });
});
