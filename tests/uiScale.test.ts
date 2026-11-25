import { describe, expect, it } from 'vitest';
import { dashScaleFor, uiScaleFor } from '../src/ui/uiScale';
import { defaultUiSize, isUiSize } from '../src/data/uiSize';
import { DRIVE_OFF_METRES, DRIVE_OFF_SECONDS, drivenOff } from '../src/ui/episodeCards';
import { defaultSettings, loadSave } from '../src/sim/save/save';

describe('interface scale (v1.75)', () => {
  it('leaves phones and windows up to 1280×720 as drawn', () => {
    expect(uiScaleFor(390, 844, true)).toBe(1);
    expect(uiScaleFor(844, 390, true)).toBe(1);
    expect(uiScaleFor(1280, 720, false)).toBe(1);
    expect(uiScaleFor(1024, 600, false)).toBe(1);
  });

  it('reads from a couch on a 1080p television: 13 px body text becomes 24 px or more', () => {
    const tv = uiScaleFor(1920, 1080, false);
    expect(tv).toBeCloseTo(1.875, 3);
    expect(13 * tv).toBeGreaterThanOrEqual(24);
    // The full-size dial lettering's 10 px floor (instruments.ts) reaches 18 px.
    expect(10 * tv).toBeGreaterThanOrEqual(18);
  });

  it('keeps the same apparent size at 4K and grows smoothly in between', () => {
    expect(uiScaleFor(3840, 2160, false)).toBeCloseTo(2 * uiScaleFor(1920, 1080, false), 3);
    let last = 1;
    for (let w = 1280; w <= 3840; w += 64) {
      const s = uiScaleFor(w, (w * 9) / 16, false);
      expect(s).toBeGreaterThanOrEqual(last);
      expect(s - last).toBeLessThan(0.1);
      last = s;
    }
  });

  it('Small and Large take a step either side of Normal', () => {
    const normal = uiScaleFor(1920, 1080, false, 'normal');
    expect(uiScaleFor(1920, 1080, false, 'small')).toBeLessThan(normal);
    expect(uiScaleFor(1920, 1080, false, 'large')).toBeGreaterThan(normal);
    expect(uiScaleFor(390, 844, true, 'large')).toBeGreaterThan(1);
  });

  it('is saved with the settings; older saves get Normal', () => {
    expect(defaultSettings.uiSize).toBe(defaultUiSize);
    expect(isUiSize('large')).toBe(true);
    expect(isUiSize('huge')).toBe(false);
    const store = (settings: object) => ({
      getItem: () => JSON.stringify({ version: 1, settings }),
      setItem: () => {},
    });
    expect(loadSave(store({ uiSize: 'small' }))!.settings.uiSize).toBe('small');
    expect(loadSave(store({}))!.settings.uiSize).toBe('normal');
    expect(loadSave(store({ uiSize: 'giant' }))!.settings.uiSize).toBe('normal');
  });
});

describe('a history note makes way once the player drives on (v1.75)', () => {
  it('stays up while parked or just started, and shrinks after both the time and the distance', () => {
    expect(drivenOff(60, 0)).toBe(false);
    expect(drivenOff(DRIVE_OFF_SECONDS - 0.1, 500)).toBe(false);
    expect(drivenOff(DRIVE_OFF_SECONDS, DRIVE_OFF_METRES)).toBe(true);
    // Long enough to read a few lines before it goes.
    expect(DRIVE_OFF_SECONDS).toBeGreaterThanOrEqual(8);
  });
});

describe('the dash cluster on a big screen (v1.75)', () => {
  it('is 0.8 of the interface scale at 1080p and 4K, so its 12 px lettering floor reaches 18 px', () => {
    expect(dashScaleFor(1280, 720, false)).toBe(1);
    expect(dashScaleFor(390, 844, true)).toBe(1);
    expect(dashScaleFor(1920, 1080, false)).toBeCloseTo(1.5, 3);
    expect(dashScaleFor(3840, 2160, false)).toBeCloseTo(3, 3);
    expect(12 * dashScaleFor(1920, 1080, false)).toBeGreaterThanOrEqual(18);
  });
});
