/** Dev helper: print vehicle behaviour in the standard test scenes. */
import { makeScene } from '../tests/helpers/scenes';

const fmt = (n: number) => n.toFixed(2);
{
  const s = await makeScene({});
  const p0 = { ...s.vehicle.position };
  s.run(5, { throttle: 1 });
  const p = s.vehicle.position;
  console.log(
    `flat 5s: dist=${fmt(Math.hypot(p.x - p0.x, p.z - p0.z))} dz=${fmt(p.z - p0.z)} speed=${fmt(s.vehicle.speed * 3.6)}km/h gear=${s.vehicle.drivetrain.gear} rpm=${s.vehicle.drivetrain.rpm.toFixed(0)} y=${fmt(p.y)}`,
  );
  s.run(25, { throttle: 1 });
  console.log(`flat 30s: speed=${fmt(s.vehicle.speed * 3.6)}km/h gear=${s.vehicle.drivetrain.gear}`);
  s.run(2, { throttle: 0.3, steer: 1 });
  const v = s.vehicle.body.linvel();
  console.log(
    `steer +1 (right): vel x=${fmt(v.x)} z=${fmt(v.z)} (right means +x when facing -z) tilt=${fmt(s.vehicle.tiltDeg())}`,
  );
}
for (const range of ['high', 'low'] as const) {
  for (const deg of [20, 25, 30]) {
    const s = await makeScene({ pitchDeg: deg });
    if (range === 'low') s.vehicle.toggleRange();
    const p0 = { ...s.vehicle.position };
    s.run(12, { throttle: 1 });
    const p = s.vehicle.position;
    console.log(
      `${range} ${deg}°: dz=${fmt(p.z - p0.z)} dy=${fmt(p.y - p0.y)} speed=${fmt(s.vehicle.speed * 3.6)} spin=${s.vehicle.wheels.map((w) => fmt(w.spin)).join(',')}`,
    );
  }
}
for (const dir of [-1, 1]) {
  const s = await makeScene({ rollDeg: 20, speed: 50 / 3.6 });
  let maxTilt = 0;
  s.run(4, (t) => ({ throttle: 0.6, steer: t > 0.3 ? dir : 0 }));
  maxTilt = s.vehicle.tiltDeg();
  console.log(`side slope 20° @50 steer ${dir}: tilt=${fmt(maxTilt)} speed=${fmt(s.vehicle.speed * 3.6)}`);
}
{
  const s = await makeScene({ speed: 50 / 3.6 });
  s.run(3, (t) => ({ throttle: 0.6, steer: t > 0.3 ? 1 : 0 }));
  console.log(`flat @50 hard right: tilt=${fmt(s.vehicle.tiltDeg())} speed=${fmt(s.vehicle.speed * 3.6)}`);
}
