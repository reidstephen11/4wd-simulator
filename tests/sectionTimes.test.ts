import { describe, expect, it } from 'vitest';
import { SectionTimes, timedSections } from '../src/sim/sectionTimes';
import { densify } from '../src/sim/world/polyline';

const hill = { id: 'hill', name: 'Hill', a: { x: 0, z: 0 }, b: { x: 0, z: -100 } };
const line = Array.from({ length: 101 }, (_, k) => [0, -k] as const);
const concrete = { ...hill, id: 'concrete', name: 'The concrete', line, width: 3.6 };

/** Drives from z0 to z1 at 1 m per 0.1 s step. */
function drive(t: SectionTimes, z0: number, z1: number) {
  const out = [];
  for (let z = z0; z0 < z1 ? z <= z1 : z >= z1; z += z0 < z1 ? 1 : -1) {
    const r = t.update(0, z, 0.1);
    if (r) out.push(r);
  }
  return out;
}

describe('SectionTimes', () => {
  it('times a section end to end, from leaving the start', () => {
    const t = new SectionTimes([hill], {});
    const [r] = drive(t, 20, -120);
    expect(r.seconds).toBeCloseTo(8, 0);
    expect(r.best).toBeNull();
    expect(t.bests.hill).toBeCloseTo(r.seconds);
  });

  it('times it driven the other way and keeps the quicker best', () => {
    const t = new SectionTimes([hill], { hill: 5 });
    const [r] = drive(t, -120, 20);
    expect(r.best).toBe(5);
    expect(t.bests.hill).toBe(5);
  });

  it('drops an attempt that turns back', () => {
    const t = new SectionTimes([hill], {});
    expect(drive(t, 20, -50)).toEqual([]);
    expect(drive(t, -50, 20)).toEqual([]);
  });

  it('drops an attempt that leaves the track, and keeps one that stays near it', () => {
    const t = new SectionTimes([concrete], {});
    expect(drive(t, 20, -40)).toEqual([]);
    // Off down the spur, 20 m from the line, then back onto it short of the end.
    for (let x = 0; x <= 20; x++) t.update(x, -50, 0.1);
    for (let x = 20; x >= 0; x--) t.update(x, -80, 0.1);
    expect(drive(t, -80, -120)).toEqual([]);
    expect(t.times).toEqual([]);
    // Pulling 5 m off to one side still counts.
    const u = new SectionTimes([concrete], {});
    expect(drive(u, 20, -40)).toEqual([]);
    for (let z = -40; z >= -60; z--) u.update(5, z, 0.1);
    expect(drive(u, -60, -120)).toHaveLength(1);
  });

  it('builds a section along a generated track, ends and line included', () => {
    const poly = densify(
      [
        [0, 0],
        [0, -60],
        [40, -100],
      ],
      1,
    );
    const tracks = [{ def: { id: 'bend', name: 'The bend', width: 3.6 }, poly }];
    const [section] = timedSections(['bend', 'missing'], tracks);
    expect(section).toMatchObject({
      id: 'bend',
      name: 'The bend',
      width: 3.6,
      a: { x: 0, z: 0 },
      b: { x: 40, z: -100 },
    });
    expect(section.line).toHaveLength(poly.count);
    expect(timedSections(['missing'], tracks)).toEqual([]);
  });

  it('resets: the attempt under way and the times go, the bests stay', () => {
    const t = new SectionTimes([hill], { hill: 5 });
    drive(t, 20, -120);
    expect(t.times).toHaveLength(1);
    drive(t, -120, -50);
    t.reset();
    expect(t.times).toEqual([]);
    expect(t.bests.hill).toBe(5);
    // Not timed: the attempt that was under way is gone.
    expect(drive(t, -50, 20)).toEqual([]);
  });
});
