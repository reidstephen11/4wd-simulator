import { describe, expect, it } from 'vitest';
import { clearWater, depthTone, shallowsOf } from '../src/render/water';

/**
 * A clear creek can be read from the bank (v2.25): clear water shows the pale shallows and
 * breaks over them, and is dark where it is deep. Only what is drawn.
 */
describe('clear water', () => {
  it('shows the bed and breaks up over the shelf, and not where it is deep', () => {
    // The shelf (0.6 m) and the shallows along the far bank (0.3 m) count in full.
    expect(shallowsOf(0.3)).toBe(1);
    expect(shallowsOf(0.6)).toBe(1);
    // Beside the shelf (1.7 m) and in the creek's ordinary 1.1 m, not at all.
    expect(shallowsOf(1.1)).toBe(0);
    expect(shallowsOf(1.7)).toBe(0);
    // In between it fades.
    expect(shallowsOf(0.8)).toBeGreaterThan(0.4);
    expect(shallowsOf(0.8)).toBeLessThan(0.7);
    // The water's edge is as clear as it gets.
    expect(shallowsOf(0)).toBe(1);
  });

  it('is at its darkest from 1.1 m, so the shelf is far paler than the water beside it', () => {
    expect(clearWater.deepAt).toBe(1.1);
    expect(depthTone(0.6, true)).toBeLessThan(0.5);
    expect(depthTone(1.1, true)).toBe(1);
    expect(depthTone(1.7, true)).toBe(1);
    // Water that is not clear is drawn as before: as dark as it gets by 0.8 m.
    expect(depthTone(0.6, false)).toBeCloseTo(0.667, 2);
    expect(depthTone(0.8, false)).toBe(1);
  });
});
