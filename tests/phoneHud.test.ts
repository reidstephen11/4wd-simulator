import { describe, expect, it } from 'vitest';
import { phoneTiltRisk, PITCH_RISK, ROLL_RISK } from '../src/ui/crawlGauges';
import { instrumentsNeedDetail } from '../src/ui/vehicleGauges';
import { damageTuning } from '../src/data/damage';
import type { VehicleGaugeState } from '../src/ui/vehicleGauges';

const healthy = (): VehicleGaugeState => ({
  fuel: 50,
  tank: 70,
  heat: 0.5,
  lowPressure: false,
  tyres: [
    { inflation: 1, fault: 'none', front: true, left: true },
    { inflation: 1, fault: 'none', front: true, left: false },
    { inflation: 1, fault: 'none', front: false, left: true },
    { inflation: 1, fault: 'none', front: false, left: false },
  ],
});

describe('phone HUD helpers', () => {
  it('shows pitch/roll only when the lean is getting risky or the belly is on the ground', () => {
    expect(phoneTiltRisk({ pitch: 0, roll: 0, bodyContact: false })).toBe(false);
    expect(phoneTiltRisk({ pitch: PITCH_RISK - 1, roll: 0, bodyContact: false })).toBe(false);
    expect(phoneTiltRisk({ pitch: PITCH_RISK, roll: 0, bodyContact: false })).toBe(true);
    expect(phoneTiltRisk({ pitch: 0, roll: ROLL_RISK, bodyContact: false })).toBe(true);
    expect(phoneTiltRisk({ pitch: 0, roll: 0, bodyContact: true })).toBe(true);
  });

  it('opens the instrument dials when heat, fuel or a tyre is in warning', () => {
    expect(instrumentsNeedDetail(healthy())).toBe(false);
    expect(instrumentsNeedDetail({ ...healthy(), heat: damageTuning.engine.heatWarn })).toBe(true);
    expect(instrumentsNeedDetail({ ...healthy(), fuel: 5 })).toBe(true);
    const leak = healthy();
    leak.tyres = leak.tyres.map((t, i) => (i === 0 ? { ...t, fault: 'puncture', inflation: 0.6 } : t));
    expect(instrumentsNeedDetail(leak)).toBe(true);
  });
});
