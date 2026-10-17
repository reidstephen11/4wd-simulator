import { describe, expect, it } from 'vitest';
import { makeScene } from './helpers/scenes';

/**
 * SPEC §15 M2 checks plus the §6.2 feel targets that can be measured headless.
 * The ground in these scenes is flat dirt tilted to the angle under test.
 */
describe('vehicle physics (M2)', () => {
  it('full throttle on flat dirt for 5 s moves the car more than 30 m', async () => {
    const s = await makeScene({});
    const p0 = { ...s.vehicle.position };
    s.run(5, { throttle: 1 });
    const p = s.vehicle.position;
    const dist = Math.hypot(p.x - p0.x, p.z - p0.z);
    expect(dist).toBeGreaterThan(30);
    // and it went forwards (the vehicle faces -z)
    expect(p.z).toBeLessThan(p0.z);
  });

  it('low range climbs a 30° ramp from a standing start', async () => {
    const s = await makeScene({ pitchDeg: 30 });
    s.vehicle.toggleRange();
    expect(s.vehicle.drivetrain.range).toBe('low');
    const y0 = s.vehicle.position.y;
    s.run(12, { throttle: 1 });
    expect(s.vehicle.position.y - y0).toBeGreaterThan(10);
    expect(s.vehicle.tiltDeg()).toBeLessThan(45);
  });

  it('high range fails the same 30° ramp', async () => {
    const s = await makeScene({ pitchDeg: 30 });
    expect(s.vehicle.drivetrain.range).toBe('high');
    const y0 = s.vehicle.position.y;
    s.run(12, { throttle: 1 });
    expect(s.vehicle.position.y - y0).toBeLessThan(1);
  });

  it('high range still creeps up a 20° slope (struggles, but not stuck)', async () => {
    const s = await makeScene({ pitchDeg: 18 });
    const y0 = s.vehicle.position.y;
    s.run(10, { throttle: 1 });
    expect(s.vehicle.position.y - y0).toBeGreaterThan(1);
  });

  it('a hard turn at 50 km/h on a 20° side slope rolls the car', async () => {
    // +x is downhill; steering right turns down the slope.
    const s = await makeScene({ rollDeg: 20, speed: 50 / 3.6 });
    let maxTilt = 0;
    for (let i = 0; i < 40; i++) {
      s.run(0.1, (t) => ({ throttle: 0.6, steer: t > 0.3 ? 1 : 0 }));
      maxTilt = Math.max(maxTilt, s.vehicle.tiltDeg());
    }
    expect(maxTilt).toBeGreaterThan(90);
  });

  it('the same turn on flat ground at 40 km/h slides but stays upright', async () => {
    const s = await makeScene({ speed: 40 / 3.6 });
    let maxTilt = 0;
    for (let i = 0; i < 30; i++) {
      s.run(0.1, (t) => ({ throttle: 0.6, steer: t > 0.2 ? 1 : 0 }));
      maxTilt = Math.max(maxTilt, s.vehicle.tiltDeg());
    }
    expect(maxTilt).toBeLessThan(45);
  });

  it('drives across a 31° slope but rolls across a 38° slope', async () => {
    const ok = await makeScene({ rollDeg: 31, speed: 2 });
    ok.run(5, { throttle: 0.25 });
    expect(ok.vehicle.tiltDeg()).toBeLessThan(60);
    const bad = await makeScene({ rollDeg: 38, speed: 2 });
    bad.run(5, { throttle: 0.25 });
    expect(bad.vehicle.tiltDeg()).toBeGreaterThan(60);
  });

  it('steering right turns the car right', async () => {
    const s = await makeScene({ speed: 3 });
    s.run(2, { throttle: 0.2, steer: 1 });
    expect(s.vehicle.body.linvel().x).toBeGreaterThan(0.5);
  });

  it('brakes stop the car and S then reverses', async () => {
    const s = await makeScene({ speed: 15 });
    let stopTime = 0;
    while (s.vehicle.speed > 0.5 && s.time < 10) s.run(0.05, { brake: 1 });
    stopTime = s.time - 1;
    // 54 km/h to a stop in well under 3 s on dirt.
    expect(stopTime).toBeLessThan(3);
    s.run(3, { brake: 1 });
    expect(s.vehicle.speed).toBeLessThan(-0.5);
    expect(s.vehicle.drivetrain.gear).toBe(-1);
  });

  it('holds still on a 20° slope with no input', async () => {
    const s = await makeScene({ pitchDeg: 20 });
    const p0 = { ...s.vehicle.position };
    s.run(4, {});
    const p = s.vehicle.position;
    expect(Math.hypot(p.x - p0.x, p.z - p0.z)).toBeLessThan(0.5);
  });
});
