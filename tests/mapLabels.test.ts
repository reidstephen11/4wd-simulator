import { expect, it } from 'vitest';
import { mergeHints, placeMapLabels } from '../src/ui/mapLabels';

it('keeps clustered challenge names clear of other labels and map icons', () => {
  const points = [
    { id: 'v', x: 500, y: 800, width: 90 },
    { id: 'logs', x: 530, y: 809, width: 105 },
    { id: 'gates', x: 544, y: 839, width: 150 },
    { id: 'shelf', x: 517, y: 855, width: 190 },
    { id: 'camp', x: 385, y: 834, width: 170 },
  ];
  const labels = placeMapLabels(points, 1400, 70);
  expect(labels.some((p) => p.labelY !== p.y || p.labelX < p.x)).toBe(true);
  for (const [i, a] of labels.entries()) {
    expect(a.labelX).toBeGreaterThanOrEqual(70);
    expect(a.labelX + a.width).toBeLessThanOrEqual(1330);
    for (const b of labels.slice(i + 1))
      expect(
        a.labelX + a.width + 8 <= b.labelX ||
          b.labelX + b.width + 8 <= a.labelX ||
          Math.abs(a.labelY - b.labelY) >= 34,
      ).toBe(true);
    for (const icon of points)
      expect(
        a.labelX + a.width + 4 <= icon.x - 18 ||
          a.labelX - 4 >= icon.x + 18 ||
          Math.abs(a.labelY - icon.y) >= 35,
      ).toBe(true);
  }
});

it('keeps names off the question marks and the car arrow, at any mark size (v1.75)', () => {
  const k = 1.4;
  const points = [
    { id: 'pinch', x: 300, y: 1200, width: 150 * k },
    { id: 'village', x: 310, y: 1250, width: 200 * k },
  ];
  const hints = mergeHints(
    [
      { x: 320, y: 1180 },
      { x: 330, y: 1190 },
      { x: 290, y: 1225 },
    ],
    32 * k,
  );
  // The first two marks are closer than 32 × k: one is drawn.
  expect(hints).toHaveLength(2);
  const box = (x: number, y: number, r: number) => ({ left: x - r, right: x + r, top: y - r, bottom: y + r });
  const obstacles = [...hints.map((h) => box(h.x, h.y, 15 * k)), box(305, 1215, 26 * k)];
  const labels = placeMapLabels(points, 840, 70, 1400, k, obstacles);
  for (const a of labels) {
    const name = {
      left: a.labelX - 4 * k,
      right: a.labelX + a.width + 4 * k,
      top: a.labelY - 17 * k,
      bottom: a.labelY + 17 * k,
    };
    for (const o of obstacles)
      expect(
        name.right <= o.left || name.left >= o.right || name.bottom <= o.top || name.top >= o.bottom,
      ).toBe(true);
    expect(name.left).toBeGreaterThanOrEqual(70);
    expect(name.right).toBeLessThanOrEqual(770);
  }
});
