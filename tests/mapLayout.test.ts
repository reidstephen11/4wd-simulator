import { describe, expect, it } from 'vitest';
import { echoesTouchButton } from '../src/ui/hud';
import { clampMapPan, mapCanvasBase } from '../src/ui/paperMap';

/** The CREB sheet: a tall strip (see PaperMap's MIN_SHEET sizing). */
const MAP_W = 630;
const MAP_H = 1400;

describe('paper map on a phone', () => {
  it('fills a sideways screen by width and scrolls the length', () => {
    const view = mapCanvasBase(900, 360, MAP_W, MAP_H);
    expect(view.windowed).toBe(true);
    expect(view.baseW).toBe(900);
    expect(view.baseH).toBeCloseTo(900 / (MAP_W / MAP_H));
    expect(view.baseH).toBeGreaterThan(360);
  });

  it('keeps an upright phone and a desktop sheet fitted to the view', () => {
    expect(mapCanvasBase(350, 760, MAP_W, MAP_H)).toEqual({
      baseW: 350,
      baseH: 760,
      windowed: false,
    });
    expect(mapCanvasBase(800, 800, 1000, 1000)).toEqual({
      baseW: 800,
      baseH: 800,
      windowed: false,
    });
  });

  it('does nothing until the sheet has a size', () => {
    expect(mapCanvasBase(0, 0, MAP_W, MAP_H).windowed).toBe(false);
  });

  it('scrolls a wide sheet along the route and still covers the view', () => {
    const base = mapCanvasBase(800, 360, MAP_W, MAP_H);
    const atEnd = clampMapPan(0, -99999, 800, 360, base.baseW, base.baseH, 1);
    expect(atEnd.panX).toBe(0);
    expect(atEnd.panY).toBeCloseTo(360 - base.baseH);
    const dragged = clampMapPan(40, atEnd.panY + 120, 800, 360, base.baseW, base.baseH, 1);
    expect(dragged.panX).toBe(0);
    expect(dragged.panY).toBeGreaterThan(atEnd.panY);
    const zoomed = clampMapPan(-100, -100, 800, 360, base.baseW, base.baseH, 2);
    expect(zoomed.panX).toBeGreaterThanOrEqual(800 - base.baseW * 2);
    expect(zoomed.panX).toBeLessThanOrEqual(0);
  });
});

describe('touch prompts', () => {
  it('drops the badge only when the key is already a button', () => {
    expect(echoesTouchButton('USE')).toBe(true);
    expect(echoesTouchButton('IN / OUT')).toBe(true);
    expect(echoesTouchButton('HAND')).toBe(true);
    expect(echoesTouchButton('Hold UPRIGHT')).toBe(false);
    expect(echoesTouchButton('Stick ↕')).toBe(false);
    expect(echoesTouchButton('')).toBe(false);
  });
});
