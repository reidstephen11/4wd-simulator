/** Dev helper: drive into a tree near River Flat Camp and print the speed, tilt and heading. */
import { lateAfternoon } from '../src/data/environment';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { testWorld } from '../tests/world';

const sim = new Simulation(await loadRapier(), testWorld(), lateAfternoon);
const v = sim.addVehicle('p', sim.poseAt(-160, 246, 180));
sim.startEngine('p');
const inputs = new Map<string, VehicleInput>();
const dt = 1 / 60;
let t = 0;
for (; t < 1.5; t += dt) {
  inputs.set('p', emptyInput());
  sim.step(inputs, dt);
}
let minSpeed = 0;
for (let i = 0; i < 13 * 60; i++, t += dt) {
  inputs.set('p', { ...emptyInput(), throttle: 1 });
  sim.step(inputs, dt);
  const fwd = v.speed * 3.6;
  if (i > 60) minSpeed = Math.min(minSpeed, fwd);
  if (i % 15 === 0) {
    const p = v.position;
    console.log(
      `${t.toFixed(2)}s speed=${fwd.toFixed(1)} tilt=${v.tiltDeg().toFixed(0)} pos=(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) contacts=${v.wheels.filter((w) => w.contact).length} vel=(${v.body.linvel().x.toFixed(1)}, ${v.body.linvel().y.toFixed(1)}, ${v.body.linvel().z.toFixed(1)}) yawrate=${v.body.angvel().y.toFixed(2)} fwd=(${v.forward().x.toFixed(2)}, ${v.forward().z.toFixed(2)})`,
    );
  }
}
console.log(`most reverse speed after pulling away: ${minSpeed.toFixed(1)} km/h`);
