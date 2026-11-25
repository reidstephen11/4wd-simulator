import { describe, expect, it } from 'vitest';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { PLAIN, chuteExitLip, chuteLip, creekBogs, water } from '../src/data/levels/ironbarkCreek';
import { knollBogs } from '../src/data/levels/ironbarkKnoll';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { ute40Tuning } from '../src/data/ute40';
import { vehicleTuning } from '../src/data/vehicle';
import { trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import { driver, steepest } from './helpers/drive';
import { ironbarkWorld } from './world';

/** Ironbark Creek, the first playground level (v0.22). */
const world = ironbarkWorld();
const { drive, trackOf } = driver(world);
const t = world.terrain;
const KNOLL_LINES = [
  'knoll-rock-climb',
  'knoll-switchbacks',
  'knoll-side-slope',
  'knoll-drop',
  'knoll-steep-descent',
  'knoll-axle-twisters',
  'knoll-bog-trench',
];
const CROSSINGS = ['creek-ford', 'creek-deep', 'creek-chute'];
const WEST_BANK_LINES = ['bog-hole', 'rock-garden'];

/** The nearest point of `track`'s profile to (x, z). */
function profileAt(track: ReturnType<typeof trackOf>, x: number, z: number): number {
  let k = 0;
  for (let i = 0; i < track.poly.count; i++)
    if (
      Math.hypot(track.poly.xs[i] - x, track.poly.zs[i] - z) <
      Math.hypot(track.poly.xs[k] - x, track.poly.zs[k] - z)
    )
      k = i;
  return track.profile[k];
}

describe('Ironbark Creek: the level', () => {
  it('is a playground: no goal, no deadline, no storm and no fuel burnt', () => {
    expect(ironbarkLevel.goal).toBeUndefined();
    expect(ironbarkLevel.deadline).toBeUndefined();
    expect(ironbarkLevel.storm).toBeUndefined();
    expect(ironbarkLevel.fuelScale).toBe(0);
    expect(ironbarkMap.width).toBe(512);
    expect(ironbarkMap.length).toBe(512);
  });

  it('has a camp on each side of the creek, on level ground inside the wall', () => {
    const camps = ironbarkMap.pois.filter((p) => p.kind === 'campsite');
    expect(camps.map((c) => c.id).sort()).toEqual(['ironbark-camp', 'top-paddock-camp']);
    expect(ironbarkMap.spawnCampsite).toBe('ironbark-camp');
    const creekX = -120;
    expect(camps.some((c) => c.x < creekX) && camps.some((c) => c.x > creekX)).toBe(true);
    for (const c of camps) {
      const r = c.reset!;
      expect(Math.abs(r.x), c.id).toBeLessThan(ironbarkMap.wall[0] - 5);
      expect(Math.abs(r.z), c.id).toBeLessThan(ironbarkMap.wall[1] - 5);
      const slope = Math.abs(t.heightAt(r.x + 2, r.z) - t.heightAt(r.x - 2, r.z)) / 4;
      expect(slope, c.id).toBeLessThan(0.05);
      expect(t.waterDepthAt(r.x, r.z), c.id).toBe(0);
    }
  });

  it('joins every knoll line to the loop or the summit, level with it, with a sign at each end', () => {
    const loop = trackOf('knoll-loop');
    const summit = ironbarkMap.flats.find((f) => f.id === 'knoll-top')!;
    for (const id of KNOLL_LINES) {
      const line = trackOf(id);
      for (const s of [0, line.poly.length]) {
        const p = trailPoint(line, s);
        const onLoop = trailProgress(loop, p.x, p.z);
        const top = Math.hypot(p.x - summit.x, p.z - summit.z) < summit.radius + 2;
        expect(onLoop.distance < 0.5 || top, `${id}@${s}`).toBe(true);
        if (!top) {
          // The two graded profiles agree where they meet: a line graded higher than the loop
          // leaves a ridge across the loop that stops a crawling car.
          const end = s === 0 ? line.profile[0] : line.profile[line.profile.length - 1];
          expect(Math.abs(end - profileAt(loop, p.x, p.z)), `${id}@${s}`).toBeLessThan(0.15);
          const heights = [-1.5, 0, 1.5].map((ds) => {
            const q = trailPoint(loop, onLoop.along + ds);
            return t.heightAt(q.x, q.z);
          });
          expect(Math.max(...heights) - (heights[0] + heights[2]) / 2, `${id}@${s} hump`).toBeLessThan(0.2);
        }
        expect(
          ironbarkMap.props.some((q) => q.kind === 'signpost' && Math.hypot(q.x - p.x, q.z - p.z) < 14),
          `${id} sign @${s.toFixed(0)}`,
        ).toBe(true);
      }
    }
  });

  it('runs each crossing from the loop to the west bank track, level with both, signed at each end', () => {
    const loop = trackOf('knoll-loop');
    const bank = trackOf('west-bank');
    for (const id of CROSSINGS) {
      const line = trackOf(id);
      const a = trailPoint(line, 0);
      const b = trailPoint(line, line.poly.length);
      expect(trailProgress(loop, a.x, a.z).distance, id).toBeLessThan(0.5);
      expect(trailProgress(bank, b.x, b.z).distance, id).toBeLessThan(0.5);
      expect(Math.abs(line.profile[0] - profileAt(loop, a.x, a.z)), `${id} east`).toBeLessThan(0.15);
      expect(
        Math.abs(line.profile[line.profile.length - 1] - profileAt(bank, b.x, b.z)),
        `${id} west`,
      ).toBeLessThan(0.15);
      for (const p of [a, b])
        expect(
          ironbarkMap.props.some((q) => q.kind === 'signpost' && Math.hypot(q.x - p.x, q.z - p.z) < 14),
          `${id} sign`,
        ).toBe(true);
    }
    for (const id of WEST_BANK_LINES) {
      const line = trackOf(id);
      for (const s of [0, line.poly.length]) {
        const p = trailPoint(line, s);
        expect(trailProgress(bank, p.x, p.z).distance, `${id}@${s}`).toBeLessThan(0.5);
      }
    }
  });

  it('makes the three crossings different: a shallow ford, a deep line with a bar, a steep chute', () => {
    const deepest = (id: string) => {
      const line = trackOf(id);
      let d = 0;
      for (let s = 0; s < line.poly.length; s += 0.5) {
        const p = trailPoint(line, s);
        d = Math.max(d, t.waterDepthAt(p.x, p.z));
      }
      return d;
    };
    // The ford: under half a metre of water, on ramps a car in high range walks up.
    expect(deepest('creek-ford')).toBeGreaterThan(0.3);
    expect(deepest('creek-ford')).toBeLessThan(0.55);
    expect(steepest(trackOf('creek-ford'), 8)).toBeLessThan(16);
    // The deep crossing: over a metre on the straight line, about half that on the bar downstream.
    expect(deepest('creek-deep')).toBeGreaterThan(1.1);
    const bar = ironbarkMap.creeks[0].bars![0];
    expect(t.waterDepthAt(bar.x, bar.z)).toBeGreaterThan(0.4);
    expect(t.waterDepthAt(bar.x, bar.z)).toBeLessThan(0.75);
    expect(steepest(trackOf('creek-deep'), 8)).toBeLessThan(20);
    // The chute: the water is about five metres below the plain, down a bank past 28°.
    expect(PLAIN - water.chute).toBeGreaterThan(5);
    expect(steepest(trackOf('creek-chute'), 8)).toBeGreaterThan(26);
    expect(chuteExitLip).toBeGreaterThan(chuteLip + 20);
  });

  it('digs the bog hole and the bog trench as deep bogs with something to winch from', () => {
    expect(creekBogs.length).toBe(2);
    for (const b of [...creekBogs, ...knollBogs.filter((k) => k.id.startsWith('knoll-bog-trench'))]) {
      expect(b.deep, b.id).toBe(true);
      expect(b.winchTrees, b.id).toBe(true);
      expect(b.depth, b.id).toBeGreaterThan(0.6);
    }
  });

  it('keeps every signed line clear of the wall and the border', () => {
    for (const track of world.features.tracks)
      for (let i = 0; i < track.poly.count; i++) {
        expect(Math.abs(track.poly.xs[i]), track.def.id).toBeLessThan(ironbarkMap.wall[0] - 8);
        expect(Math.abs(track.poly.zs[i]), track.def.id).toBeLessThan(ironbarkMap.wall[1] - 8);
      }
  });
});

describe('Ironbark Creek: driving it (low range, crawling)', () => {
  it('needs both lockers on the rock climb, and the short and long 40s get up it locked', async () => {
    const open = await drive('knoll-rock-climb', 'open', false, 200, vehicleTuning, 25);
    expect(open.done, 'open diffs').toBe(false);
    for (const tuning of [vehicleTuning, ute40Tuning]) {
      const r = await drive('knoll-rock-climb', 'both', false, 200, tuning);
      expect(r.done, `${tuning.name} stopped ${r.remaining.toFixed(1)} m from the top`).toBe(true);
    }
  }, 300_000);

  it('gets round the rest of the knoll with both lockers', async () => {
    for (const id of KNOLL_LINES.slice(1)) {
      const r = await drive(id, 'both', false, 260, vehicleTuning, 30);
      expect(r.done, `${id} stopped ${r.remaining.toFixed(1)} m short`).toBe(true);
    }
  }, 600_000);

  it('fords the creek either way with open diffs, in under half a metre of water', async () => {
    for (const back of [false, true]) {
      const r = await drive('creek-ford', 'open', back, 120, vehicleTuning, 25);
      expect(r.done, back ? 'east' : 'west').toBe(true);
      expect(r.water).toBeLessThan(0.6);
    }
  }, 300_000);

  it('takes the deep crossing either way with both lockers, in over a metre of water', async () => {
    for (const back of [false, true]) {
      const r = await drive('creek-deep', 'both', back, 140, vehicleTuning, 25);
      expect(r.done, back ? 'east' : 'west').toBe(true);
      expect(r.water).toBeGreaterThan(1.1);
    }
  }, 300_000);

  it('gets through the chute westwards locked but not open, and not back up it without the winch', async () => {
    const locked = await drive('creek-chute', 'both', false, 140, vehicleTuning, 25);
    expect(locked.done, `locked stopped ${locked.remaining.toFixed(1)} m short`).toBe(true);
    const open = await drive('creek-chute', 'open', false, 140, vehicleTuning, 25);
    expect(open.done, 'open diffs').toBe(false);
    const back = await drive('creek-chute', 'both', true, 140, vehicleTuning, 25);
    expect(back.done, 'back up the chute').toBe(false);
  }, 400_000);

  it('gets through the bog hole and the rock garden locked, and stops in both with open diffs', async () => {
    for (const id of WEST_BANK_LINES) {
      const locked = await drive(id, 'both', false, 200, vehicleTuning, 25);
      expect(locked.done, `${id} locked stopped ${locked.remaining.toFixed(1)} m short`).toBe(true);
      const open = await drive(id, 'open', false, 200, vehicleTuning, 25);
      expect(open.done, `${id} open diffs`).toBe(false);
    }
  }, 500_000);
});
