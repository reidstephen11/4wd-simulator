import { describe, expect, it } from 'vitest';
import { scoreRun } from '../src/sim/runScore';
import { createCondition } from '../src/sim/vehicle/condition';

const packed = { fuel: 50, jerryCans: 1, spares: 2, plugs: 3 };

describe('scoreRun', () => {
  it('gives gold to an early, clean finish with fuel and kit left', () => {
    const c = createCondition(70);
    c.jerryCans = 1;
    c.spares = 2;
    c.plugs = 3;
    const s = scoreRun({ condition: c, packed, minutes: 25, hoursSpare: 2, targetMinutes: 30 });
    expect(s.points).toBe(1000);
    expect(s.medal).toBe('gold');
  });

  it('gives bronze to a late, battered finish', () => {
    const c = createCondition(5);
    c.engine = 0.3;
    c.jerryCans = 0;
    c.spares = 0;
    c.plugs = 0;
    const s = scoreRun({ condition: c, packed, minutes: 90, hoursSpare: 0.1, targetMinutes: 30 });
    expect(s.medal).toBe('bronze');
  });

  it('counts the kit left against what was packed', () => {
    const c = createCondition(50);
    c.jerryCans = 1;
    c.spares = 2;
    c.plugs = 3;
    const kit = (p: typeof packed) =>
      scoreRun({ condition: c, packed: p, minutes: 25, hoursSpare: 2, targetMinutes: 30 }).parts[2].points;
    expect(kit(packed)).toBe(200);
    // Packed three spares and six plugs, used a spare and three plugs.
    expect(kit({ ...packed, spares: 3, plugs: 6 })).toBe(160);
  });

  it('scores the car on its engine, suspension and tyres: a wreck gets nothing', () => {
    const c = createCondition(70);
    c.engine = 0;
    c.suspension = [0, 0, 0, 0];
    c.tyres = [0, 0, 0, 0];
    const s = scoreRun({ condition: c, packed, minutes: 25, hoursSpare: 2, targetMinutes: 30 });
    expect(s.parts[1]).toEqual({ label: 'Car', points: 0 });
    // Half the tyres gone: a third of the share is the tyres', and half of that is lost.
    const d = createCondition(70);
    d.tyres = [0, 0, 1, 1];
    expect(
      scoreRun({ condition: d, packed, minutes: 25, hoursSpare: 2, targetMinutes: 30 }).parts[1].points,
    ).toBe(333);
  });
});
