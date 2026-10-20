import { describe, expect, it } from 'vitest';
import { formatSpeed, outlineRotation } from '../src/ui/crawlGauges';

/** Where a point of the outline ends up on the canvas (y down) after the gauge's rotation. */
function rotated(x: number, y: number, angleDeg: number) {
  const a = outlineRotation(angleDeg);
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

describe('crawl gauge outlines', () => {
  it('lift the side view’s nose (drawn on the left) when the car points uphill', () => {
    // Canvas y grows downwards, so "up on screen" is a smaller y.
    expect(rotated(-24, 0, 20).y).toBeLessThan(-5);
    expect(rotated(24, 0, 20).y).toBeGreaterThan(5);
    expect(rotated(-24, 0, -20).y).toBeGreaterThan(5);
  });

  it('drop the rear view’s right side when the right side is down', () => {
    expect(rotated(17, 0, 15).y).toBeGreaterThan(3);
    expect(rotated(-17, 0, 15).y).toBeLessThan(-3);
  });
});

describe('speed readout', () => {
  it('shows km/h or mph as chosen in the settings', () => {
    expect(formatSpeed(60, 'kmh')).toBe('60 km/h');
    expect(formatSpeed(60, 'mph')).toBe('37 mph');
    expect(formatSpeed(4.2, 'kmh')).toBe('4.2 km/h');
    expect(formatSpeed(4.2, 'mph')).toBe('2.6 mph');
  });
});
