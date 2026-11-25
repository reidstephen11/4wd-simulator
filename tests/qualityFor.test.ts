import { describe, expect, it } from 'vitest';
import { offeredQualities, qualityFor, qualityPresets, shownQuality } from '../src/data/quality';

describe('qualityFor', () => {
  it('draws a phone saved on High at Medium', () => {
    expect(qualityFor('high', true)).toBe(qualityPresets.medium);
  });

  it('leaves the other settings and computers unchanged', () => {
    expect(qualityFor('high', false)).toBe(qualityPresets.high);
    expect(qualityFor('medium', true)).toBe(qualityPresets.medium);
    expect(qualityFor('low', true)).toBe(qualityPresets.low);
  });
});

describe('the Graphics row (v1.23)', () => {
  it('offers Low and Medium on a phone, all three on a computer', () => {
    expect(offeredQualities(true)).toEqual(['low', 'medium']);
    expect(offeredQualities(false)).toEqual(['low', 'medium', 'high']);
  });

  it('shows a phone saved on High as Medium', () => {
    expect(shownQuality('high', true)).toBe('medium');
    expect(shownQuality('high', false)).toBe('high');
    expect(shownQuality('low', true)).toBe('low');
  });
});
