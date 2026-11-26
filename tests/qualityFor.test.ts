import { describe, expect, it } from 'vitest';
import {
  offeredQualities,
  phoneMaxQuality,
  qualityFor,
  qualityPresets,
  shownQuality,
} from '../src/data/quality';
import { touchTuning } from '../src/data/touch';

describe('qualityFor', () => {
  it('draws each setting as its own preset, on a phone as on a computer (v0.24)', () => {
    expect(phoneMaxQuality).toBe('high');
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(qualityFor(level, true)).toBe(qualityPresets[level]);
      expect(qualityFor(level, false)).toBe(qualityPresets[level]);
    }
  });
});

describe('the Graphics row', () => {
  it('offers all three settings on a phone and on a computer (v0.24)', () => {
    expect(offeredQualities(true)).toEqual(['low', 'medium', 'high']);
    expect(offeredQualities(false)).toEqual(['low', 'medium', 'high']);
  });

  it('shows a phone the setting it saved', () => {
    expect(shownQuality('high', true)).toBe('high');
    expect(shownQuality('high', false)).toBe('high');
    expect(shownQuality('low', true)).toBe('low');
  });

  it('starts a phone with no saved settings on Medium (v0.24)', () => {
    expect(touchTuning.defaultQuality).toBe('medium');
  });
});
