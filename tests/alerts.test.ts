import { describe, expect, it } from 'vitest';
import {
  ADVISORY_HOLD_MS,
  ROTATE_MS,
  railItems,
  touchNotice,
  warningView,
  type WarningView,
} from '../src/ui/alerts';

const swept = 'The current is taking the car — get to shallow water';
const flooded = 'Engine flooded — get the air intake out of the water';
const lifting = 'Deep, fast water — the current is lifting the car';
const drying = (s: number) => `Engine flooded — drying out (${s} s)`;

describe('phone warnings', () => {
  it('shortens the two water warnings and keeps both critical', () => {
    expect(warningView(swept)).toMatchObject({
      id: 'swept',
      text: 'Shallow water',
      critical: true,
      full: swept,
    });
    expect(warningView(flooded)).toMatchObject({
      id: 'flooded',
      text: 'Raise intake',
      critical: true,
      full: flooded,
    });
  });

  it('shows both critical warnings at once, swept first', () => {
    const items = railItems([warningView(flooded), warningView(swept)], 0, new Map());
    expect(items.map((i) => i.id)).toEqual(['swept', 'flooded']);
    expect(items.every((i) => !i.minimised)).toBe(true);
  });

  it('keeps a critical line and shrinks an advisory after a few seconds', () => {
    const views = [warningView(lifting), warningView(swept)];
    const seen = new Map([
      ['lifting', 0],
      ['swept', 0],
    ]);
    const early = railItems(views, ADVISORY_HOLD_MS - 1, seen);
    expect(early.find((i) => i.id === 'lifting')).toMatchObject({
      text: 'Current lifting you',
      minimised: false,
    });
    const late = railItems(views, ADVISORY_HOLD_MS, seen);
    expect(late.find((i) => i.id === 'lifting')).toMatchObject({ text: 'Lifting', minimised: true });
    expect(late.find((i) => i.id === 'swept')).toMatchObject({ text: 'Shallow water', minimised: false });
  });

  it('opens a shrunk warning again when it was tapped', () => {
    const views = [warningView(lifting)];
    const seen = new Map([['lifting', 0]]);
    const open = railItems(views, 8000, seen, new Map([['lifting', 9000]]));
    expect(open[0]).toMatchObject({ text: 'Current lifting you', minimised: false });
  });

  it('uses one id for the drying countdown so the timer does not restart', () => {
    expect(warningView(drying(12)).id).toBe(warningView(drying(3)).id);
    expect(warningView(drying(12)).text).toBe('Drying out (12 s)');
    expect(warningView(drying(3)).chip).toBe('Drying 3s');
  });

  it('rotates a third warning through the second slot', () => {
    const views: WarningView[] = [
      warningView(swept),
      warningView('Water at the air intake!'),
      warningView(lifting),
    ];
    const first = railItems(views, 0, new Map()).map((i) => i.id);
    const later = railItems(views, ROTATE_MS, new Map()).map((i) => i.id);
    expect(first[0]).toBe('swept');
    expect(later[0]).toBe('swept');
    expect(first[1]).not.toBe(later[1]);
    expect(new Set([...first, ...later])).toEqual(new Set(['swept', 'intake', 'lifting']));
  });

  it('shortens a find and an unknown sentence', () => {
    expect(warningView('Jerry can on a crate — pull up beside it').text).toBe('Jerry can — pull up');
    expect(warningView('Something long is happening — and here is the rest of it').text).toBe(
      'Something long is happ…',
    );
  });

  it('cuts a long notice down to one line', () => {
    expect(touchNotice('Precision crawl — hold throttle for walking pace')).toBe('Precision crawl');
    expect(touchNotice('Handbrake on')).toBe('Handbrake on');
    expect(touchNotice('Low range')).toBe('Low range');
  });
});
