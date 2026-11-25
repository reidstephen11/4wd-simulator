import { describe, expect, it } from 'vitest';
import { damageTuning } from '../src/data/damage';
import { temperatureLabel, temperatureShare, tyreLabel, type TyreGaugeState } from '../src/ui/vehicleGauges';

describe('vehicle instrument warnings', () => {
  it('puts the heat warning at the same temperature as the damage model', () => {
    const warning = damageTuning.engine.heatWarn;
    expect(temperatureLabel(warning - 0.001)).toBe('NORMAL');
    expect(temperatureLabel(warning)).toBe('HIGH');
    expect(temperatureLabel(1)).toBe('HOT');
    expect(temperatureLabel(0)).toBe('COLD');
    expect(temperatureShare(warning)).toBeLessThan(temperatureShare(1));
    expect(temperatureShare(-1)).toBe(0);
    expect(temperatureShare(5)).toBe(1);
  });

  it('shows a puncture before air has escaped, then distinguishes a flat tyre', () => {
    const tyre: TyreGaugeState = { front: true, left: true, inflation: 1, fault: 'puncture' };
    expect(tyreLabel(tyre)).toBe('LEAK');
    expect(tyreLabel({ ...tyre, inflation: 0.5 })).toBe('LEAK');
    expect(tyreLabel({ ...tyre, inflation: 0.05 })).toBe('FLAT');
    expect(tyreLabel({ ...tyre, inflation: 0, fault: 'sidewall' })).toBe('FLAT');
    expect(tyreLabel({ ...tyre, fault: 'none' })).toBe('100%');
  });
});
