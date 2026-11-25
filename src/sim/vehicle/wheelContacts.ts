import type RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleTuning } from '../../data/vehicle';
import type { Physics } from '../physics';
import { dot, rotate, v3 } from './math';

/**
 * Ground just ahead of (or behind) a tyre standing more than this many tyre radii above the
 * ground under it is a wall the tyre meets, not ground it rolls up onto (v2.01): the far
 * edge of a hole the wheel has dropped into. Measured from the tyre's bottom where it is
 * now, which the footprint already lifts onto a ledge it is climbing, so the CREB's ledges
 * (about a radius and a quarter, on climbs of up to 30°) stay climbable.
 */
export const WALL_STEP = 1.5;
/**
 * The same for a tyre hanging free, with nothing under it (v2.01): a wheel that has dropped
 * into a hole. The suspension only lets it hang so far, so the hole's far edge stands about
 * a radius above it; a real tyre would sit far lower and meet a wall. A tyre climbing a ledge
 * keeps its footing on the footprint, so this never applies to it.
 */
export const WALL_STEP_HANGING = 0.3;
/**
 * And for that hanging tyre the ground ahead must stand this many radii above the ground
 * under the hub, where the tyre would come to rest (v2.01): a hole's floor, far below its edge.
 * A wheel lifted off the ground over a log or a ledge has ground about level with the log's
 * or ledge's foot under it, so the log or ledge ahead is no wall.
 */
export const WALL_FLOOR_STEP = 2;
/** Walls are only looked for at a crawl, below this speed (m/s), so a wheel in the air off a bump at speed never meets one. */
export const WALL_SPEED = 3;
/** The sides of a tyre a wall can stand on (bits). */
export const WallSide = { Ahead: 1, Behind: 2, Right: 4, Left: 8 } as const;

/** The wall check's rays start this far above the wheel's mounting point (m). */
const WALL_LIFT = 1.2;

/**
 * Samples the round tyre footprint so a downward ray finds logs before the hub reaches them,
 * and looks along it for a wall: the far edge of a hole a wheel has dropped into (v2.01).
 */
export class WheelContacts {
  /**
   * Per wheel, the sides of the tyre with a wall (bits of `WallSide`; 0 none). Set by
   * `update`; the vehicle stops that corner moving into each.
   */
  readonly walls = new Int8Array(4);
  /** Per wheel: the rolling direction's sine and cosine about +y (the steering angle), for the wall's push. */
  readonly steerSin = new Float32Array(4);
  readonly steerCos = new Float32Array(4);
  /** Per wheel, this step: how far the ground at the tyre's edges stands above its bottom (m; for tests and tuning). */
  readonly wallRise = new Float32Array(4);
  /** Per wheel, this step: how far the ground at the tyre's edges stands above the ground under its hub (m). */
  readonly wallFloor = new Float32Array(4);
  private readonly ray: RAPIER.Ray;
  private readonly local = v3();
  private readonly samples: { offset: number; rise: number }[];
  /** Where the wall check looks: each side of the tyre, along its rolling direction or its axle, and how far out (m). */
  private readonly wallSamples: { side: number; along: number; across: number }[];

  constructor(
    private readonly physics: Physics,
    private readonly tuning: VehicleTuning,
  ) {
    this.ray = new physics.R.Ray(v3(), v3());
    const r = tuning.wheelRadius;
    const out = tuning.wheelWidth / 2 + 0.12;
    this.wallSamples = [
      { side: WallSide.Ahead, along: r * 0.9, across: 0 },
      { side: WallSide.Behind, along: -r * 0.9, across: 0 },
      { side: WallSide.Right, along: 0, across: out },
      { side: WallSide.Left, along: 0, across: -out },
    ];
    this.samples = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -0.95, 0.95].map((fraction) => ({
      offset: r * fraction,
      rise: r * (1 - Math.sqrt(1 - fraction * fraction)),
    }));
  }

  update(
    body: RAPIER.RigidBody,
    controller: RAPIER.DynamicRayCastVehicleController,
    filter: number,
    wheelX: readonly number[],
    /** Look for walls this step (a crawl, with the car on its other wheels). */
    lookForWalls = false,
    /** Which wheels touched the ground last step. */
    grounded: readonly boolean[] = [],
  ): void {
    const t = this.tuning;
    const p = body.translation();
    const q = body.rotation();
    rotate(q, 0, -1, 0, this.ray.dir);
    this.walls.fill(0);
    this.wallRise.fill(0);
    this.wallFloor.fill(0);
    for (let i = 0; i < t.wheels.length; i++) {
      const w = t.wheels[i];
      const steer = controller.wheelSteering(i) ?? 0;
      // The probe can stay on the authored wheel line while that line is inside the
      // cambered tyre's tread. Only move it when the rolling beam pulls the tread away.
      // This avoids shifting a tuned rock/pothole contact by a few millimetres each step.
      const halfTread = t.wheelWidth / 2;
      const contactX = Math.max(wheelX[i] - halfTread, Math.min(wheelX[i] + halfTread, w.x));
      // Along the wheel's rolling direction: (0, 0, 1) turned by the steering angle about +y.
      const sx = Math.sin(steer);
      const sz = Math.cos(steer);
      this.steerSin[i] = sx;
      this.steerCos[i] = sz;
      let bestLength = Infinity;
      let offset = 0;
      let rise = 0;
      const reach = (controller.wheelSuspensionRestLength(i) ?? t.suspensionRestLength) + t.wheelRadius;
      // The wall check measures from where the tyre is now: hanging in a hole, or lifted by
      // the footprint onto the ledge it is climbing.
      const wallFrom = controller.wheelSuspensionLength(i) ?? t.suspensionRestLength;
      const wallStep = (grounded[i] === false ? WALL_STEP_HANGING : WALL_STEP) * t.wheelRadius;
      for (const sample of this.samples) {
        rotate(
          q,
          contactX + sx * sample.offset,
          w.y + sample.rise,
          w.z + sz * sample.offset,
          this.ray.origin,
        );
        this.ray.origin.x += p.x;
        this.ray.origin.y += p.y;
        this.ray.origin.z += p.z;
        const hit = this.physics.world.castRayAndGetNormal(
          this.ray,
          reach,
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
      // The wall check: from well above the wheel, so the rays come down onto the far edge of
      // a hole even when the car has tipped into it and the hub is below that edge. Ground at
      // the tyre's leading edge higher than the tyre's bottom by WALL_STEP radii is a wall.
      // Where the tyre would come to rest: the ground under the hub, found from above too.
      let floor = Infinity;
      if (lookForWalls) {
        rotate(q, contactX, w.y + WALL_LIFT, w.z, this.ray.origin);
        this.ray.origin.x += p.x;
        this.ray.origin.y += p.y;
        this.ray.origin.z += p.z;
        const hit = this.physics.world.castRay(
          this.ray,
          reach + WALL_LIFT + 1.5,
          true,
          this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
          filter,
          undefined,
          body,
        );
        floor = hit ? hit.timeOfImpact - WALL_LIFT - t.wheelRadius : reach + 1.5;
      }
      const hanging = grounded[i] === false;
      if (lookForWalls)
        for (const sample of this.wallSamples) {
          // Along the rolling direction (sx, sz), across it along the axle (sz, -sx).
          rotate(
            q,
            contactX + sx * sample.along + sz * sample.across,
            w.y + WALL_LIFT,
            w.z + sz * sample.along - sx * sample.across,
            this.ray.origin,
          );
          this.ray.origin.x += p.x;
          this.ray.origin.y += p.y;
          this.ray.origin.z += p.z;
          const hit = this.physics.world.castRay(
            this.ray,
            reach + WALL_LIFT,
            true,
            this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
            filter,
            undefined,
            body,
          );
          if (!hit) continue;
          const ground = hit.timeOfImpact - WALL_LIFT - t.wheelRadius;
          this.wallRise[i] = Math.max(this.wallRise[i], wallFrom - ground);
          this.wallFloor[i] = Math.max(this.wallFloor[i], floor - ground);
          const wall = hanging
            ? wallFrom - ground > wallStep && floor - ground > WALL_FLOOR_STEP * t.wheelRadius
            : wallFrom - ground > wallStep;
          if (wall) this.walls[i] |= sample.side;
        }
      // Walls beside the tyre count only with one ahead of or behind it: the tyre is down in
      // a pothole, not running past a boulder that the bump stops already keep it off.
      if (!(this.walls[i] & (WallSide.Ahead | WallSide.Behind))) this.walls[i] = 0;
      // The profile rise keeps suspension length measured at the hub rather than the sample.
      this.local.x = contactX + sx * offset;
      this.local.y = w.y + rise;
      this.local.z = w.z + sz * offset;
      controller.setWheelChassisConnectionPointCs(i, this.local);
    }
  }
}
