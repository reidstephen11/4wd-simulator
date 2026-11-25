import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from './physics';
import type { Vec3 } from './vehicle/math';

/** Lift from displaced water and drag relative to the current, applied at the wet part. */
export function waterForce(
  physics: Physics,
  body: RAPIER.RigidBody,
  point: Vec3,
  halfHeight: number,
  volume: number,
  area: number,
  levelOffset: number,
  dt: number,
): number {
  const water = physics.ground.waterSurfaceAt(point.x, point.z);
  if (water === null) return 0;
  const under = Math.max(0, Math.min(1, (water + levelOffset - point.y + halfHeight) / (2 * halfHeight)));
  if (under === 0) return 0;
  const flow = physics.ground.waterFlowAt?.(point.x, point.z, { x: 0, z: 0 }) ?? { x: 0, z: 0 };
  const velocity = body.velocityAtPoint(point);
  const dx = velocity.x - flow.x;
  const dz = velocity.z - flow.z;
  // Cap the per-step drag impulse so a short, fast impact cannot reverse the body.
  const drag = Math.min(body.mass() / (4 * dt), area * under * (120 + 180 * Math.hypot(dx, dz)));
  const lift = volume * under * 9810;
  body.applyImpulseAtPoint(
    { x: -dx * drag * dt, y: (lift - velocity.y * drag) * dt, z: -dz * drag * dt },
    point,
    true,
  );
  return lift;
}
