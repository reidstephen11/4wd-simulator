import type RAPIER from '@dimforge/rapier3d-compat';
import { v3, type Quat, type Vec3 } from './vehicle/math';

/**
 * A physics body whose pose before the last step is kept, so the renderer can draw it part
 * way between steps (as it does the car), instead of jumping a whole step at a time against
 * the gliding camera.
 */
export interface PosedBody {
  readonly body: RAPIER.RigidBody;
  readonly prevPosition: Vec3;
  readonly prevRotation: Quat;
}

/** The previous-pose fields for a body, starting where it is now. */
export function poseOf(body: RAPIER.RigidBody): { prevPosition: Vec3; prevRotation: Quat } {
  const o = { body, prevPosition: v3(), prevRotation: { x: 0, y: 0, z: 0, w: 1 } };
  snapshotPose(o);
  return { prevPosition: o.prevPosition, prevRotation: o.prevRotation };
}

/** Remember the pose: before a physics step, and after a teleport (so nothing is drawn on the way). */
export function snapshotPose(o: PosedBody): void {
  const p = o.body.translation();
  const q = o.body.rotation();
  o.prevPosition.x = p.x;
  o.prevPosition.y = p.y;
  o.prevPosition.z = p.z;
  o.prevRotation.x = q.x;
  o.prevRotation.y = q.y;
  o.prevRotation.z = q.z;
  o.prevRotation.w = q.w;
}
