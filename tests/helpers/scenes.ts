import { flatDirt, Groups, groups, loadRapier, Physics, type GroundQuery } from '../../src/sim/physics';
import { vehicleTuning, type VehicleTuning } from '../../src/data/vehicle';
import { Vehicle, type VehicleEnv } from '../../src/sim/vehicle/vehicle';
import { emptyInput, type VehicleInput } from '../../src/sim/input/vehicleInput';
import { PHYSICS_DT } from '../../src/core/config';
import { rotate as rotateVec } from '../../src/sim/vehicle/math';

export interface Scene {
  physics: Physics;
  vehicle: Vehicle;
  run(seconds: number, input: Partial<VehicleInput> | ((t: number) => Partial<VehicleInput>)): void;
  time: number;
  /** Called after every physics step (e.g. to apply damage, as the simulation does). */
  afterStep?: (dt: number) => void;
}

/** A static box as ground: `pitchDeg` tilts it so -z goes uphill, `rollDeg` tilts it sideways (+x goes down). */
export async function makeScene(opts: {
  pitchDeg?: number;
  rollDeg?: number;
  tuning?: VehicleTuning;
  heading?: number;
  speed?: number;
  ground?: GroundQuery;
  /** Weather the vehicle drives in (dry by default). */
  env?: VehicleEnv;
}): Promise<Scene> {
  const R = await loadRapier();
  const physics = new Physics(R, opts.ground ?? flatDirt);
  const pitch = ((opts.pitchDeg ?? 0) * Math.PI) / 180;
  const roll = ((opts.rollDeg ?? 0) * Math.PI) / 180;
  // Rotation: pitch about +x, then roll about +z.
  const qp = { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) };
  const qr = { x: 0, y: 0, z: Math.sin(-roll / 2), w: Math.cos(-roll / 2) };
  const q = {
    w: qr.w * qp.w - qr.x * qp.x - qr.y * qp.y - qr.z * qp.z,
    x: qr.w * qp.x + qr.x * qp.w + qr.y * qp.z - qr.z * qp.y,
    y: qr.w * qp.y - qr.x * qp.z + qr.y * qp.w + qr.z * qp.x,
    z: qr.w * qp.z + qr.x * qp.y - qr.y * qp.x + qr.z * qp.w,
  };
  // Ground slab whose top surface passes through the origin, 3 km across: a 30 s run at
  // full throttle (drive-lab's top-speed check) covers about 700 m.
  const n = rotateVec(q, 0, 1, 0);
  const ground = R.ColliderDesc.cuboid(1500, 1, 1500)
    .setTranslation(-n.x, -n.y, -n.z)
    .setRotation(q)
    .setFriction(0.8)
    .setCollisionGroups(groups(Groups.TERRAIN, 0xffff));
  physics.terrainCollider = physics.world.createCollider(ground);
  const tuning = opts.tuning ?? vehicleTuning;
  const lift = tuning.wheelRadius + 0.02;
  const vehicle = new Vehicle(
    'test',
    physics,
    tuning,
    {
      x: n.x * lift,
      y: n.y * lift,
      z: n.z * lift,
      headingDeg: opts.heading ?? 0,
    },
    opts.env,
  );
  vehicle.body.setRotation(q, true);
  const scene: Scene = {
    physics,
    vehicle,
    time: 0,
    run(seconds, input) {
      const steps = Math.round(seconds / PHYSICS_DT);
      for (let i = 0; i < steps; i++) {
        const partial = typeof input === 'function' ? input(scene.time) : input;
        const inp = { ...emptyInput(), ...partial };
        vehicle.step(inp, PHYSICS_DT);
        physics.step();
        vehicle.postStep(PHYSICS_DT);
        scene.afterStep?.(PHYSICS_DT);
        scene.time += PHYSICS_DT;
      }
    },
  };
  // Settle on the ground.
  scene.run(1.0, {});
  if (opts.speed) {
    const f = vehicle.forward();
    vehicle.body.setLinvel({ x: f.x * opts.speed, y: f.y * opts.speed, z: f.z * opts.speed }, true);
  }
  return scene;
}
