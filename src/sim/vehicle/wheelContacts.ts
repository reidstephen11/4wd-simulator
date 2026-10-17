import type RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleTuning } from '../../data/vehicle';
import type { Physics } from '../physics';
import { dot, rotate, v3 } from './math';

/** Samples the round tyre footprint so a downward ray finds logs before the hub reaches them. */
export class WheelContacts {
  private readonly ray: RAPIER.Ray;
  private readonly local = v3();
  private readonly samples: { offset: number; rise: number }[];

  constructor(
    private readonly physics: Physics,
    private readonly tuning: VehicleTuning,
  ) {
    this.ray = new physics.R.Ray(v3(), v3());
    const r = tuning.wheelRadius;
    this.samples = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -0.95, 0.95].map((fraction) => ({
      offset: r * fraction,
      rise: r * (1 - Math.sqrt(1 - fraction * fraction)),
    }));
  }

  update(body: RAPIER.RigidBody, controller: RAPIER.DynamicRayCastVehicleController, filter: number): void {
    const t = this.tuning;
    const p = body.translation();
    const q = body.rotation();
    rotate(q, 0, -1, 0, this.ray.dir);
    for (let i = 0; i < t.wheels.length; i++) {
      const w = t.wheels[i];
      const steer = controller.wheelSteering(i) ?? 0;
      const sx = -Math.sin(steer);
      const sz = Math.cos(steer);
      let bestLength = Infinity;
      let offset = 0;
      let rise = 0;
      for (const sample of this.samples) {
        rotate(q, w.x + sx * sample.offset, w.y + sample.rise, w.z + sz * sample.offset, this.ray.origin);
        this.ray.origin.x += p.x;
        this.ray.origin.y += p.y;
        this.ray.origin.z += p.z;
        const hit = this.physics.world.castRayAndGetNormal(
          this.ray,
          (controller.wheelSuspensionRestLength(i) ?? t.suspensionRestLength) + t.wheelRadius,
          true,
          this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
          filter,
          undefined,
          body,
        );
        // Extend a grounded wheel's contact patch; a hub over a deep drop must still
        // lose support rather than reaching sideways across the void to the far lip.
        if (sample.offset === 0 && !hit) break;
        // Near-vertical faces belong to the solid bump stops, not suspension support.
        if (!hit || dot(hit.normal, this.ray.dir) > -0.65) continue;
        const length = hit.timeOfImpact - t.wheelRadius;
        if (length < bestLength - 0.001) {
          bestLength = length;
          offset = sample.offset;
          rise = sample.rise;
        }
      }
      // The profile rise keeps suspension length measured at the hub rather than the sample.
      this.local.x = w.x + sx * offset;
      this.local.y = w.y + rise;
      this.local.z = w.z + sz * offset;
      controller.setWheelChassisConnectionPointCs(i, this.local);
    }
  }
}
