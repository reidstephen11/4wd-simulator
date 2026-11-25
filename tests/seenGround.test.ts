import { describe, expect, it } from 'vitest';
import { SeenGround } from '../src/sim/seenGround';

describe('seen ground', () => {
  it('fills in round the car and nowhere else', () => {
    const s = new SeenGround(700, 3000);
    expect(s.seenAt(0, 0)).toBe(false);
    s.mark(0, 0);
    expect(s.seenAt(0, 0)).toBe(true);
    expect(s.seenAt(90, 0)).toBe(true);
    expect(s.seenAt(220, 0)).toBe(false);
    expect(s.near(350, 0, 250)).toBe(true);
    expect(s.near(550, 0, 250)).toBe(false);
  });

  it('comes back the same from the save', () => {
    const s = new SeenGround(700, 3000);
    s.mark(-300, 1200);
    s.mark(400, -2500);
    const back = new SeenGround(700, 3000, s.encode());
    expect([...back.cells()]).toEqual([...s.cells()]);
    expect(new SeenGround(700, 3000, 'not base64!').seenAt(-300, 1200)).toBe(false);
  });
});
