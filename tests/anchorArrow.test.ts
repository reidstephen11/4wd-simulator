import { describe, expect, it } from 'vitest';
import { edgeArrow } from '../src/core/anchorPicker';

describe('the winch chooser’s arrow to an anchor out of view (v2.19)', () => {
  it('shows nothing for an anchor in view', () => {
    expect(edgeArrow({ x: 0, y: 0, ahead: true })).toBeNull();
    expect(edgeArrow({ x: 0.9, y: -0.9, ahead: true })).toBeNull();
  });

  it('sits on the edge towards an anchor off to one side, pointing at it', () => {
    const right = edgeArrow({ x: 1.6, y: 0, ahead: true })!;
    expect(right.x).toBeCloseTo(0.84);
    expect(right.y).toBeCloseTo(0);
    // Clockwise from up: a quarter turn points right.
    expect(right.turn).toBeCloseTo(Math.PI / 2);
    const left = edgeArrow({ x: -3, y: 0.3, ahead: true })!;
    expect(left.x).toBeCloseTo(-0.84);
    expect(left.turn).toBeLessThan(0);
    const up = edgeArrow({ x: 0.1, y: 1.4, ahead: true })!;
    expect(up.y).toBeCloseTo(0.84);
    expect(Math.abs(up.turn)).toBeLessThan(0.2);
  });

  it('turns a point behind the camera back through the centre', () => {
    // Behind and to the driver's right projects to the left: the arrow must go right.
    const a = edgeArrow({ x: -0.4, y: 0.1, ahead: false })!;
    expect(a.x).toBeCloseTo(0.84);
    expect(a.turn).toBeGreaterThan(0);
    // Dead behind: on the bottom edge, pointing down.
    const behind = edgeArrow({ x: 0, y: 0, ahead: false })!;
    expect(behind.y).toBeCloseTo(-0.84);
    expect(Math.abs(behind.turn)).toBeCloseTo(Math.PI);
  });
});
