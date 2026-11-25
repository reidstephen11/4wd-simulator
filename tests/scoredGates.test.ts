import { describe, expect, it } from 'vitest';
import { GateCount, type CarFootprint } from '../src/sim/gateCount';
import { ScoredGates, gateScore, type GateCourseInput, type ScoredGateEvent } from '../src/sim/scoredGates';
import type { CrawlBests } from '../src/sim/crawlRuns';
import type { GateInfo, TrackInfo } from '../src/sim/world/features';
import { densify } from '../src/sim/world/polyline';
import { gateText } from '../src/ui/hud';
import { loadSave, writeSave } from '../src/sim/save/save';
import { MemoryStore, saveData } from './helpers/saves';

const gates: GateInfo[] = [10, 20, 30, 40].map((at, k) => ({
  n: k + 1,
  trackId: 'test',
  headingDeg: 0,
  left: { x: -1.8, y: 0, z: -at },
  right: { x: 1.8, y: 0, z: -at },
}));
const poly = densify(
  [
    [0, 0],
    [0, -60],
  ],
  1,
);
const track: TrackInfo = {
  def: {
    id: 'test',
    name: 'Test',
    points: [
      [0, 0],
      [0, -60],
    ],
    width: 4,
    shoulder: 2,
    smooth: 0,
    surface: 'rock',
    ruts: 0,
    camber: 0,
  },
  poly,
  profile: new Float32Array(poly.count),
};
const car: CarFootprint = { fx: 0, fz: -1, halfLength: 2.3, halfWidth: 0.9 };
const input = (z: number, extra: Partial<GateCourseInput> = {}): GateCourseInput => ({
  x: 0,
  z,
  car,
  vehicle: 'shortie',
  tilt: 0,
  knock: false,
  winch: false,
  dt: 0.1,
  ...extra,
});
function setup(bests: CrawlBests = {}) {
  return new ScoredGates(
    { id: 'test', name: 'Rock climb', trackId: 'test' },
    new GateCount(gates),
    track,
    bests,
  );
}
function drive(
  c: ScoredGates,
  from: number,
  to: number,
  at: (z: number) => Partial<GateCourseInput> = () => ({}),
) {
  const out: ScoredGateEvent[] = [];
  const step = to < from ? -0.25 : 0.25;
  for (let z = from; step < 0 ? z >= to : z <= to; z += step) out.push(...c.update(input(z, at(z))));
  return out;
}
const finish = (events: ScoredGateEvent[]) => events.find((e) => e.type === 'finished');

describe('scored gate course', () => {
  it('requires gate 1, counts the tail touching the last flag and saves only once clear', () => {
    const c = setup();
    expect(finish(drive(c, -25, -45))).toBeUndefined();
    expect(c.best('shortie')).toBeUndefined();
    c.cancel();
    drive(c, 0, -38);
    expect(c.active).toBe(true);
    expect(gateText(c.hud()!)).toContain('1000 / 1000');
    expect(finish(drive(c, -38.25, -40.5, () => ({ x: 0.95 })))).toBeUndefined();
    const result = finish(drive(c, -40.75, -43.5, () => ({ x: 0.95 })))!;
    expect(result.type === 'finished' && result.result.flags).toBe(1);
    expect(result.type === 'finished' && result.result.score).toBe(975);
    expect(c.best('shortie')?.points).toBe(25);
    expect(c.active).toBe(false);
  });

  it('counts each touched flag once and excludes missed-gate runs from personal bests', () => {
    const c = setup();
    const result = finish(drive(c, 0, -45, (z) => ({ x: z < -17 && z > -23 ? 0.95 : 0 })))!;
    expect(result.type === 'finished' && result.result.flags).toBe(1);
    expect(result.type === 'finished' && result.result.score).toBe(975);
    const missed = setup();
    const r = finish(drive(missed, 0, -45, (z) => ({ x: z < -15 && z > -25 ? 3 : 0 })))!;
    expect(r.type === 'finished' && r.result.missed).toBe(1);
    expect(r.type === 'finished' && r.best).toBe(false);
    expect(missed.best('shortie')).toBeUndefined();
  });

  it('charges distinct reverses, knocks and winch attachments, not every held frame', () => {
    const c = setup();
    drive(c, 0, -15);
    drive(c, -14.75, -14);
    expect(c.reverses).toBe(1);
    drive(c, -14.25, -16);
    drive(c, -15.75, -15);
    expect(c.reverses).toBe(2);
    for (let n = 0; n < 3; n++) c.update(input(-15, { winch: true, knock: true }));
    expect(c.winches).toBe(1);
    expect(c.knocks).toBe(1);
    expect(c.points).toBe(65);
    c.update(input(-15, { winch: false }));
    c.update(input(-15, { winch: true }));
    expect(c.winches).toBe(2);
  });

  it('abandons on teleport, rollover, leaving the track or a vehicle change without saving', () => {
    for (const extra of [{ z: -40 }, { tilt: 80 }, { vehicle: 'hilux' as const }]) {
      const c = setup();
      drive(c, 0, -12);
      const events = c.update(input(-12, extra));
      expect(events[0]?.type).toBe('failed');
      expect(c.active).toBe(false);
      expect(c.best('shortie')).toBeUndefined();
    }
    const c = setup();
    drive(c, 0, -12);
    for (let x = 1; x <= 6; x++) c.update(input(-12, { x }));
    expect(c.active).toBe(false);
    expect(c.best('shortie')).toBeUndefined();
  });

  it('ranks score before time, breaks ties by time and keeps per-vehicle bests through saves', () => {
    const bests: CrawlBests = {};
    const first = setup(bests);
    expect(finish(drive(first, 0, -45))?.type).toBe('finished');
    const oldTime = first.best('shortie')!.seconds;
    const fast = setup(bests);
    const better = finish(drive(fast, 0, -45, () => ({ dt: 0.05 })))!;
    expect(better.type === 'finished' && better.best).toBe(true);
    expect(fast.best('shortie')!.seconds).toBeLessThan(oldTime);
    expect(fast.best('hilux')).toBeUndefined();
    const flagged = setup(bests);
    const worse = finish(drive(flagged, 0, -45, (z) => ({ dt: 0.01, x: z < -17 && z > -23 ? 0.95 : 0 })))!;
    expect(worse.type === 'finished' && worse.best).toBe(false);
    const store = new MemoryStore();
    writeSave(saveData({ crawlBests: bests }), store);
    const reloaded = setup(loadSave(store)!.crawlBests);
    expect(reloaded.best('shortie')).toEqual(fast.best('shortie'));
    expect(gateScore(2000)).toBe(0);
  });
});
