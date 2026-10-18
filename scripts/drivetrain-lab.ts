/** Dev helper: steady-state drivetrain numbers on flat ground and slopes (creep, stall, part throttle). */
import { makeScene } from '../tests/helpers/scenes';

const f1 = (n: number) => n.toFixed(1);
for (const range of ['high', 'low'] as const) {
  // Stall: hold the car with a locked body and measure wheel force via rpm and load.
  for (const th of [0, 0.1, 0.25, 0.5, 1]) {
    const s = await makeScene({});
    if (range === 'low') s.vehicle.toggleRange();
    s.run(12, { throttle: th });
    const d = s.vehicle.drivetrain;
    console.log(
      `${range} flat throttle ${th}: speed ${f1(s.vehicle.speed * 3.6)} km/h rpm ${d.rpm.toFixed(0)} gear ${d.gear} slip ${d.slip.toFixed(2)} load ${d.load.toFixed(2)}`,
    );
  }
  for (const deg of [10, 20, 25, 30]) {
    const s = await makeScene({ pitchDeg: deg });
    if (range === 'low') s.vehicle.toggleRange();
    const y0 = s.vehicle.position.y;
    s.run(10, { throttle: 1 });
    console.log(
      `${range} ${deg}° full throttle: climbed ${f1(s.vehicle.position.y - y0)} m speed ${f1(s.vehicle.speed * 3.6)} km/h rpm ${s.vehicle.drivetrain.rpm.toFixed(0)}`,
    );
  }
  {
    const s = await makeScene({ pitchDeg: -15 });
    if (range === 'low') s.vehicle.toggleRange();
    s.run(0.2, { throttle: 0.3 });
    s.run(10, {});
    console.log(
      `${range} 15° descent coasting: speed ${f1(s.vehicle.speed * 3.6)} km/h rpm ${s.vehicle.drivetrain.rpm.toFixed(0)} gear ${s.vehicle.drivetrain.gear}`,
    );
  }
}
{
  const s = await makeScene({});
  s.run(0.1, {});
  const rpm = s.vehicle.drivetrain.rpm;
  const t0 = s.time;
  s.run(0.25, { throttle: 1 });
  console.log(
    `rev response: ${rpm.toFixed(0)} -> ${s.vehicle.drivetrain.rpm.toFixed(0)} rpm in ${(s.time - t0).toFixed(2)} s`,
  );
}
{
  const s = await makeScene({});
  const p0 = { ...s.vehicle.position };
  s.run(5, { throttle: 1 });
  const p = s.vehicle.position;
  console.log(
    `5 s full throttle: ${f1(Math.hypot(p.x - p0.x, p.z - p0.z))} m, ${f1(s.vehicle.speed * 3.6)} km/h, gear ${s.vehicle.drivetrain.gear}`,
  );
  s.run(25, { throttle: 1 });
  console.log(
    `30 s: ${f1(s.vehicle.speed * 3.6)} km/h, gear ${s.vehicle.drivetrain.gear} rpm ${s.vehicle.drivetrain.rpm.toFixed(0)}`,
  );
  s.run(10, {});
  console.log(
    `then coast 10 s: ${f1(s.vehicle.speed * 3.6)} km/h, gear ${s.vehicle.drivetrain.gear} rpm ${s.vehicle.drivetrain.rpm.toFixed(0)}`,
  );
}
