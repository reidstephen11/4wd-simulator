import { describe, expect, it } from 'vitest';
import { ringOverlaps, ringPoint, ringRadii } from '../src/ui/toolMenu';

describe('tool menu layout', () => {
  // Option size and screen size: desktop, a phone held sideways and held upright.
  const screens = [
    { name: 'desktop', w: 128, h: 72, vw: 1280, vh: 720 },
    { name: 'phone sideways', w: 112, h: 62, vw: 844, vh: 390 },
    { name: 'phone upright', w: 104, h: 62, vw: 390, vh: 844 },
  ];
  for (const sc of screens)
    for (const n of [6, 7, 8])
      it(`spaces ${n} options without overlap, on the screen (${sc.name})`, () => {
        const { rx, ry } = ringRadii(n, sc.w, sc.h, sc.vw, sc.vh);
        expect(ringOverlaps(n, rx, ry, sc.w, sc.h)).toBe(false);
        for (let i = 0; i < n; i++) {
          const p = ringPoint(i, n, rx, ry);
          expect(Math.abs(p.x) + sc.w / 2).toBeLessThanOrEqual(sc.vw / 2);
          expect(Math.abs(p.y) + sc.h / 2).toBeLessThanOrEqual(sc.vh / 2);
        }
      });
});
