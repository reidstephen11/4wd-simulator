import { describe, expect, it } from 'vitest';
import { strandedPose } from '../src/sim/stranded';

describe('stranded drivers', () => {
  it('sits beside its track, the side asked, nose to it', () => {
    const north: [number, number][] = [
      [0, 0],
      [0, -100],
    ];
    const base = { id: 'a', name: 'A', sink: 0.3, freeAfter: 5, breakout: 1, drag: 1, reward: {} };
    const right = strandedPose({ ...base, track: 't', at: 0.5, side: 'right', off: 8 }, north);
    expect(right.x).toBeCloseTo(8);
    expect(right.z).toBeCloseTo(-50);
    // East of a northbound track, it faces west back to it.
    expect(right.headingDeg).toBeCloseTo(-90);
    const left = strandedPose({ ...base, track: 't', at: 0.5, side: 'left', off: 8 }, north);
    expect(left.x).toBeCloseTo(-8);
    expect(left.headingDeg).toBeCloseTo(90);
  });
});
