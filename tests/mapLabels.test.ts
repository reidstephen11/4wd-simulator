import { expect, it } from 'vitest';
import { placeMapLabels } from '../src/ui/mapLabels';

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
