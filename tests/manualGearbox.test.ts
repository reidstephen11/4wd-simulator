import { describe, expect, it } from 'vitest';
import { hiluxTuning as hilux } from '../src/data/hilux';
import { vehicleTuning as shorty } from '../src/data/vehicle';
import {
  coupledRpm,
  createDrivetrainState,
  engineBrakeForce,
  gearLabel,
  shiftGear,
  updateDrivetrain,
  type DriveRequest,
  type DrivetrainState,
} from '../src/sim/vehicle/drivetrain';

const DT = 1 / 60;

function inGear(gear: number, rpm = hilux.engine.idleRpm): DrivetrainState {
  return { ...createDrivetrainState(), gear, rpm, neutral: false };
}

const req = (r: Partial<DriveRequest>): DriveRequest => ({
  throttle: 0,
  reverse: false,
  speed: 0,
  enginePower: 1,
  mode: 'manual',
  ...r,
});

describe('manual gearbox', () => {
  it('holds its gear up to the redline cut, where the drive stops', () => {
    const s = inGear(0);
    const redlineSpeed = hilux.engine.redlineRpm / coupledRpm(hilux, 1, 0, 'high');
    let f = 0;
    for (let v = 0; v < redlineSpeed * 1.05; v += 0.05)
      f = updateDrivetrain(hilux, s, req({ throttle: 1, speed: v }), DT);
    expect(s.gear).toBe(0);
    expect(s.neutral).toBe(false);
    expect(f).toBeLessThanOrEqual(0);
    // Below the cut it pulls hard in 1st.
    const t = inGear(0, coupledRpm(hilux, redlineSpeed * 0.6, 0, 'high'));
    expect(updateDrivetrain(hilux, t, req({ throttle: 1, speed: redlineSpeed * 0.6 }), DT)).toBeGreaterThan(
      0,
    );
  });

  it('with a clutch, letting it out at idle with the wheels held stalls within a second', () => {
    const s = inGear(0);
    s.clutch = 0;
    let stalledAt = -1;
    for (let i = 0; i < 60 && stalledAt < 0; i++) {
      updateDrivetrain(hilux, s, req({ mode: 'clutch', clutchPedal: 0 }), DT);
      if (s.stalled) stalledAt = i;
    }
    expect(stalledAt).toBeGreaterThanOrEqual(0);
    expect(s.engineRunning).toBe(false);
    expect(s.rpm).toBe(0);
    // The stall is reported for one step only.
    updateDrivetrain(hilux, s, req({ mode: 'clutch', clutchPedal: 0 }), DT);
    expect(s.stalled).toBe(false);
  });

  for (const range of ['low', 'high'] as const)
    it(`with a clutch, pulls away in 1st ${range} range letting the clutch out with some throttle`, () => {
      const s = inGear(0);
      s.range = range;
      s.clutch = 0;
      let speed = 0;
      for (let i = 0; i < 30; i++)
        updateDrivetrain(hilux, s, req({ mode: 'clutch', clutchPedal: 1, throttle: 0.5 }), DT);
      for (let i = 0; i < 180; i++) {
        const f = updateDrivetrain(
          hilux,
          s,
          req({ mode: 'clutch', clutchPedal: 0, throttle: 0.5, speed }),
          DT,
        );
        speed = Math.max(0, speed + ((f - 400) / hilux.mass) * DT);
        expect(s.engineRunning).toBe(true);
      }
      expect(speed).toBeGreaterThan(1);
      expect(s.clutch).toBe(1);
    });

  it('with the clutch held in, the engine idles in gear', () => {
    const s = inGear(0);
    for (let i = 0; i < 120; i++) updateDrivetrain(hilux, s, req({ mode: 'clutch', clutchPedal: 1 }), DT);
    expect(s.engineRunning).toBe(true);
    expect(s.clutch).toBe(0);
  });

  it('in Manual the clutch is worked for you: no stall, and the throttle pulls away', () => {
    const s = inGear(0);
    for (let i = 0; i < 120; i++) updateDrivetrain(hilux, s, req({}), DT);
    expect(s.engineRunning).toBe(true);
    let f = 0;
    for (let i = 0; i < 60; i++) f = updateDrivetrain(hilux, s, req({ throttle: 0.5 }), DT);
    expect(s.engineRunning).toBe(true);
    expect(f).toBeGreaterThan(0);
  });

  it('precision crawl works the clutch in "Manual with clutch" too', () => {
    const s = inGear(0);
    for (let i = 0; i < 120; i++) updateDrivetrain(hilux, s, req({ mode: 'clutch', autoClutch: true }), DT);
    expect(s.engineRunning).toBe(true);
  });

  it('brakes on the engine off the throttle in 3rd, and not at all in neutral', () => {
    const speed = 60 / 3.6;
    const s = inGear(2, coupledRpm(hilux, speed, 2, 'high'));
    let f = 0;
    for (let i = 0; i < 10; i++) f = updateDrivetrain(hilux, s, req({ speed }), DT);
    expect(f).toBeLessThan(0);
    s.neutral = true;
    for (let i = 0; i < 10; i++) f = updateDrivetrain(hilux, s, req({ speed }), DT);
    expect(f).toBe(0);
    expect(s.engineRunning).toBe(true);
  });

  it('ignores the automatic reverse request; reverse is a gear and pushes backwards', () => {
    const s = inGear(0);
    updateDrivetrain(hilux, s, req({ reverse: true, throttle: 1 }), DT);
    expect(s.gear).toBe(0);
    const r = inGear(-1);
    let f = 0;
    for (let i = 0; i < 60; i++) f = updateDrivetrain(hilux, r, req({ throttle: 0.6 }), DT);
    expect(f).toBeLessThan(0);
  });

  it('shifts sequentially: N → 1 → … → top, and down through N to R', () => {
    const s = { ...createDrivetrainState(), neutral: true };
    const seen = [gearLabel(s)];
    while (shiftGear(hilux, s, 1)) seen.push(gearLabel(s));
    const forward = hilux.gearbox.ratios.map((_, i) => String(i + 1));
    expect(seen).toEqual(['N', ...forward]);
    expect(s.shiftTimer).toBeGreaterThan(0);
    const down = [];
    while (shiftGear(hilux, s, -1)) down.push(gearLabel(s));
    expect(down).toEqual([...forward.slice(0, -1).reverse(), 'N', 'R']);
    expect(s.gear).toBe(-1);
    expect(shiftGear(hilux, s, 1)).toBe(true);
    expect(gearLabel(s)).toBe('N');
  });

  it('the drive is out while a gear change runs', () => {
    const speed = 20 / 3.6;
    const s = inGear(1, coupledRpm(hilux, speed, 1, 'high'));
    shiftGear(hilux, s, 1);
    expect(updateDrivetrain(hilux, s, req({ throttle: 1, speed }), DT)).toBe(0);
  });

  it('a dead engine left in gear drags the wheels; neutral or the clutch pressed frees them', () => {
    const s = inGear(0);
    s.engineRunning = false;
    updateDrivetrain(hilux, s, req({ mode: 'clutch', clutchPedal: 0 }), DT);
    expect(engineBrakeForce(hilux, s)).toBeGreaterThan(0);
    updateDrivetrain(hilux, s, req({ mode: 'clutch', clutchPedal: 1 }), DT);
    expect(engineBrakeForce(hilux, s)).toBe(0);
    s.neutral = true;
    updateDrivetrain(hilux, s, req({ mode: 'manual' }), DT);
    expect(engineBrakeForce(hilux, s)).toBe(0);
  });

  it('the 40 Series (an automatic) ignores the clutch pedal, holds its gear and never stalls', () => {
    const a = { ...createDrivetrainState(), rpm: shorty.engine.idleRpm };
    const b = { ...createDrivetrainState(), rpm: shorty.engine.idleRpm };
    for (let i = 0; i < 120; i++) {
      const fa = updateDrivetrain(shorty, a, req({ mode: 'clutch', clutchPedal: 0, throttle: 0.3 }), DT);
      const fb = updateDrivetrain(shorty, b, req({ mode: 'clutch', clutchPedal: 1, throttle: 0.3 }), DT);
      expect(fa).toBeCloseTo(fb, 6);
      expect(a.stalled).toBe(false);
    }
    expect(a.engineRunning).toBe(true);
    // No upshift on its own, even at speed.
    for (let i = 0; i < 60; i++)
      updateDrivetrain(shorty, a, req({ mode: 'manual', throttle: 1, speed: 15 }), DT);
    expect(a.gear).toBe(0);
  });

  it('Automatic mode is unchanged: no neutral, the clutch reads engaged', () => {
    const s = createDrivetrainState();
    updateDrivetrain(hilux, s, { throttle: 1, reverse: false, speed: 0, enginePower: 1 }, DT);
    expect(s.neutral).toBe(false);
    expect(s.clutch).toBe(1);
  });
});
