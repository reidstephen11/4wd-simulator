import type * as THREE from 'three';
import type { PosedBody } from '../sim/bodyPose';
import { slerp, type Quat } from '../sim/vehicle/math';

const tmpQ: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Put `target` where the body is between physics steps: `alpha` 0 is the pose before the
 * last step, 1 the pose after it (the loop renders at acc / PHYSICS_DT).
 */
export function followBody(target: THREE.Object3D, o: PosedBody, alpha: number): void {
  const p0 = o.prevPosition;
  const p1 = o.body.translation();
  target.position.set(
    p0.x + (p1.x - p0.x) * alpha,
    p0.y + (p1.y - p0.y) * alpha,
    p0.z + (p1.z - p0.z) * alpha,
  );
  const q = slerp(o.prevRotation, o.body.rotation(), alpha, tmpQ);
  target.quaternion.set(q.x, q.y, q.z, q.w);
}
