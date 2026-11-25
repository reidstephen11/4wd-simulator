import { describe, expect, it } from 'vitest';
import { LowRangeHint, waterAhead } from '../src/core/lowRangeHint';

describe('the low-range prompt before water (v2.19)', () => {
  it('shows with water close ahead in high range and not otherwise', () => {
    const hint = new LowRangeHint();
    expect(hint.show('high', true, () => false)).toBe(false);
    expect(hint.show('high', true, () => true)).toBe(true);
  });

  it('does not show while the run is not being driven', () => {
    expect(new LowRangeHint().show('high', false, () => true)).toBe(false);
  });

  it('teaches once: after low range has been used it never shows again', () => {
    const hint = new LowRangeHint();
    expect(hint.show('high', true, () => true)).toBe(true);
    expect(hint.show('low', true, () => true)).toBe(false);
    // Back in high range at the next creek.
    expect(hint.show('high', true, () => true)).toBe(false);
    // Low range used well away from water counts too.
    const other = new LowRangeHint();
    other.show('low', true, () => false);
    expect(other.show('high', true, () => true)).toBe(false);
  });

  it('finds water within 30 m ahead of the car, and not behind it or beyond that', () => {
    // A creek 10 m wide and 0.5 m deep across z = 0, the car coming north (towards -z).
    const depthAt = (_x: number, z: number) => (Math.abs(z) <= 5 ? 0.5 : 0);
    expect(waterAhead(depthAt, 0, 60, 0, -1)).toBe(false);
    expect(waterAhead(depthAt, 0, 34, 0, -1)).toBe(true);
    expect(waterAhead(depthAt, 0, 8, 0, -1)).toBe(true);
    // Across and driving away: the water is behind.
    expect(waterAhead(depthAt, 0, -8, 0, -1)).toBe(false);
    // Facing along the bank: none ahead.
    expect(waterAhead(depthAt, 0, 12, 1, 0)).toBe(false);
    // A puddle 0.1 m deep is not a crossing.
    expect(waterAhead((_x, z) => (Math.abs(z) <= 5 ? 0.1 : 0), 0, 20, 0, -1)).toBe(false);
  });
});
