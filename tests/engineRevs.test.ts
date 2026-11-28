import { describe, expect, it } from 'vitest';
import { vehicles } from '../src/data/vehicles';
import type { VehicleId } from '../src/data/vehicle';
import { combustionTorque, frictionTorque } from '../src/sim/vehicle/drivetrain';

/**
 * Each engine as it was up to v2.28: its rev limit, the automatic's full-throttle upshift,
 * and the torque it delivered at full throttle (Nm, after friction and the airflow limit) at
 * each point of its torque curve up to that limit, and its peak power (kW). v2.29 let every engine but the Range
 * Rover's rev 10% further and gave each about 8% more power at the limit, without touching
 * the bottom half of the revs.
 */
const before: Record<VehicleId, { redline: number; peakKw: number; upFull: number; delivered: number[][] }> =
  {
    sooty80: {
      redline: 4000,
      peakKw: 147.8,
      upFull: 3600,
      delivered: [
        [600, 210],
        [1000, 300],
        [1400, 420],
        [1800, 500],
        [2600, 500],
        [3200, 440],
        [3800, 365],
        [4000, 321.67],
      ],
    },
    shortie: {
      redline: 4300,
      peakKw: 85.8,
      upFull: 3800,
      delivered: [
        [600, 150],
        [1200, 235],
        [2000, 280],
        [2800, 285],
        [3600, 212.89],
        [4300, 162.93],
      ],
    },
    forty: {
      redline: 4300,
      peakKw: 85.8,
      upFull: 3800,
      delivered: [
        [600, 150],
        [1200, 235],
        [2000, 280],
        [2800, 285],
        [3600, 212.89],
        [4300, 162.93],
      ],
    },
    ute40: {
      redline: 4300,
      peakKw: 85.8,
      upFull: 3800,
      delivered: [
        [600, 150],
        [1200, 235],
        [2000, 280],
        [2800, 285],
        [3600, 212.89],
        [4300, 162.93],
      ],
    },
    camel: {
      redline: 4200,
      peakKw: 45.7,
      upFull: 3800,
      delivered: [
        [600, 95],
        [1000, 132],
        [1500, 150],
        [1800, 155],
        [2400, 150],
        [3200, 136],
        [4000, 89],
        [4200, 79.22],
      ],
    },
    rangie: {
      redline: 5000,
      peakKw: 95.9,
      upFull: 4600,
      delivered: [
        [600, 150],
        [1000, 200],
        [1500, 235],
        [2000, 250],
        [2500, 258],
        [3000, 255],
        [3500, 245],
        [4000, 228],
        [4500, 194.56],
        [5000, 164],
      ],
    },
    perentie: {
      redline: 3600,
      peakKw: 71.2,
      upFull: 3300,
      delivered: [
        [600, 150],
        [1000, 205],
        [1500, 238],
        [1900, 245],
        [2400, 238],
        [3000, 220],
        [3400, 200],
        [3600, 182],
      ],
    },
    hilux: {
      redline: 5500,
      peakKw: 65.6,
      upFull: 5000,
      delivered: [
        [600, 85],
        [1200, 118],
        [2000, 136],
        [2800, 146],
        [3600, 150],
        [4400, 141],
        [5200, 116],
        [5500, 106.32],
      ],
    },
    xtracab: {
      redline: 5500,
      peakKw: 84.8,
      upFull: 5000,
      delivered: [
        [600, 112],
        [1200, 152],
        [2000, 178],
        [2800, 190],
        [3600, 186],
        [4400, 178],
        [4800, 167],
        [5200, 149.62],
        [5500, 138.05],
      ],
    },
    unimog: {
      redline: 2800,
      peakKw: 123.9,
      upFull: 2600,
      delivered: [
        [500, 250],
        [900, 360],
        [1400, 470],
        [1800, 505],
        [2200, 490],
        [2600, 455],
        [2800, 420],
      ],
    },
    troopy: {
      redline: 4000,
      peakKw: 94.1,
      upFull: 3700,
      delivered: [
        [600, 170],
        [1000, 232],
        [1600, 268],
        [2200, 285],
        [2800, 278],
        [3400, 262],
        [3800, 227.43],
        [4000, 209.5],
      ],
    },
    hj60: {
      redline: 3900,
      peakKw: 75.9,
      upFull: 3500,
      delivered: [
        [600, 150],
        [1000, 205],
        [1400, 232],
        [1800, 241],
        [2400, 236],
        [3000, 224],
        [3500, 207],
        [3800, 188],
        [3900, 169],
      ],
    },
    mq: {
      redline: 3900,
      peakKw: 69.8,
      upFull: 3400,
      delivered: [
        [600, 140],
        [1000, 185],
        [1400, 208],
        [1800, 216],
        [2200, 213],
        [2600, 206],
        [3000, 198],
        [3600, 184.2],
        [3900, 159],
      ],
    },
    patrol: {
      redline: 4000,
      peakKw: 83.6,
      upFull: 3600,
      delivered: [
        [600, 170],
        [1000, 228],
        [1500, 256],
        [2000, 264],
        [2600, 258],
        [3200, 240],
        [3800, 204.92],
        [4000, 188.5],
      ],
    },
    lc79: {
      redline: 4100,
      peakKw: 214.5,
      upFull: 3800,
      delivered: [
        [600, 300],
        [1000, 470],
        [1400, 650],
        [1800, 750],
        [2600, 750],
        [3200, 640],
        [3600, 560],
        [4000, 480],
        [4100, 340],
      ],
    },
  };

const ids = Object.keys(before) as VehicleId[];
/** Torque at the flywheel at an rpm and throttle (Nm). */
const delivered = (id: VehicleId, rpm: number, throttle = 1) =>
  combustionTorque(vehicles[id].tuning, rpm, throttle) - frictionTorque(vehicles[id].tuning, rpm, throttle);
const kw = (nm: number, rpm: number) => (nm * rpm * 2 * Math.PI) / 60000;

describe('engines that rev out (v2.29)', () => {
  it('covers every vehicle', () => {
    expect([...ids].sort()).toEqual((Object.keys(vehicles) as VehicleId[]).sort());
  });

  it('every engine but the Range Rover revs about 10% further, to a round hundred', () => {
    for (const id of ids) {
      const now = vehicles[id].tuning.engine.redlineRpm;
      if (id === 'rangie') expect(now, id).toBe(5000);
      else {
        expect(now / before[id].redline, id).toBeGreaterThan(1.085);
        expect(now / before[id].redline, id).toBeLessThan(1.115);
        expect(now % 100, id).toBe(0);
      }
    }
  });

  it('each delivers 6 to 10% more power at its rev limit than it did at its old one', () => {
    for (const id of ids) {
      const old = before[id];
      const [, nmWas] = old.delivered[old.delivered.length - 1];
      const limit = vehicles[id].tuning.engine.redlineRpm;
      const gain = kw(delivered(id, limit), limit) / kw(nmWas, old.redline);
      expect(gain, id).toBeGreaterThan(1.06);
      expect(gain, id).toBeLessThan(1.1);
    }
  });

  it('the bottom half of the revs pulls exactly as it did', () => {
    for (const id of ids)
      for (const [rpm, nm] of before[id].delivered)
        if (rpm <= before[id].redline / 2) expect(delivered(id, rpm), `${id} at ${rpm}`).toBeCloseTo(nm, 1);
  });

  it('nowhere does an engine pull less than it did', () => {
    for (const id of ids)
      for (const [rpm, nm] of before[id].delivered)
        expect(delivered(id, rpm), `${id} at ${rpm}`).toBeGreaterThan(nm - 0.5);
  });

  it('peak power rises a little: never down, and by no more than 10%', () => {
    for (const id of ids) {
      let peak = 0;
      for (let rpm = 600; rpm <= vehicles[id].tuning.engine.redlineRpm; rpm += 10)
        peak = Math.max(peak, kw(delivered(id, rpm), rpm));
      expect(peak / before[id].peakKw, id).toBeGreaterThan(0.999);
      expect(peak / before[id].peakKw, id).toBeLessThan(1.1);
    }
  });

  it("the automatic's full-throttle upshift uses the extra revs", () => {
    for (const id of ids) {
      const g = vehicles[id].tuning.gearbox;
      if (id === 'rangie') expect(g.upshiftRpm.full, id).toBe(before[id].upFull);
      else {
        expect(g.upshiftRpm.full / before[id].upFull, id).toBeGreaterThan(1.08);
        expect(g.upshiftRpm.full / before[id].upFull, id).toBeLessThan(1.12);
      }
      expect(g.upshiftRpm.full, id).toBeLessThan(vehicles[id].tuning.engine.redlineRpm);
    }
  });
});
