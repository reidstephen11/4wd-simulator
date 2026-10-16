import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../vehicle/math';

/** Winch anchor types. "vehicle" is accepted now so co-op can add vehicle-to-vehicle recovery. */
export type AnchorKind = 'tree' | 'rock' | 'object' | 'vehicle';

export interface Anchor {
  kind: AnchorKind;
  id: string;
  /** World point (fixed anchors) — for bodies this is refreshed from `body` + `local`. */
  point: Vec3;
  /** Radius of what the strap wraps round (m). */
  radius: number;
  body?: RAPIER.RigidBody;
  local?: Vec3;
  label: string;
}

/** Current world point of an anchor. */
export function anchorPoint(a: Anchor, out: Vec3): Vec3 {
  if (a.body && a.local) {
    const p = a.body.translation();
    const q = a.body.rotation();
    // rotate local by q
    const { x, y, z } = a.local;
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    out.x = p.x + ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
    out.y = p.y + iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
    out.z = p.z + iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
    return out;
  }
  out.x = a.point.x;
  out.y = a.point.y;
  out.z = a.point.z;
  return out;
}
