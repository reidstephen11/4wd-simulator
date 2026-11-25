import { afterEach, describe, expect, it } from 'vitest';
import { FJ40_CAB_DROP, shortieCabin, useFj40Cab, vehicles } from '../src/data/vehicles';

describe('the FJ40 cab', () => {
  afterEach(() => useFj40Cab(false));

  it('keeps the code body’s cab until the Blender body is in use', () => {
    expect(vehicles.shortie.cabin).toBe(shortieCabin);
  });

  it('sits 78 mm lower with the Blender body (0.12 m less its 42 mm lift): eye, dials, lamps, wheel and handbrake together', () => {
    useFj40Cab(true);
    const c = vehicles.shortie.cabin;
    expect(FJ40_CAB_DROP).toBeCloseTo(-0.078);
    expect(c.eye.y).toBeCloseTo(shortieCabin.eye.y + FJ40_CAB_DROP);
    expect(c.dialY).toBeCloseTo(shortieCabin.dialY + FJ40_CAB_DROP);
    expect(c.lamps.y).toBeCloseTo(shortieCabin.lamps.y + FJ40_CAB_DROP);
    expect(c.steeringWheel.centre.y).toBeCloseTo(shortieCabin.steeringWheel.centre.y + FJ40_CAB_DROP);
    expect(c.handbrake.base.y).toBeCloseTo(shortieCabin.handbrake.base.y + FJ40_CAB_DROP);
    // Nothing moves along or across the car.
    expect(c.eye.x).toBe(shortieCabin.eye.x);
    expect(c.eye.z).toBe(shortieCabin.eye.z);
  });

  it('leaves the earlier 40 Series and the ute on the higher cab', () => {
    useFj40Cab(true);
    expect(vehicles.forty.cabin).toBe(shortieCabin);
    expect(vehicles.ute40.cabin.eye.y).toBe(shortieCabin.eye.y);
  });
});
