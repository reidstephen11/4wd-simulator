/** Tiny vector helpers for the sim (no Three.js in sim/). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** Rotate vector (x, y, z) by quaternion q. */
export function rotate(q: Quat, x: number, y: number, z: number, out: Vec3 = v3()): Vec3 {
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return out;
}

/** Inverse-rotate (world → local). */
export function unrotate(q: Quat, x: number, y: number, z: number, out: Vec3 = v3()): Vec3 {
  return rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, x, y, z, out);
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3, out: Vec3 = v3()): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

/** Quaternion for a rotation of `yaw` radians about +y. */
export function yawQuat(yaw: number): Quat {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Compass heading (degrees, 0 = north/-z, 90 = east/+x) → yaw for a model facing -z. */
export function headingToYaw(headingDeg: number): number {
  return (-headingDeg * Math.PI) / 180;
}

/** Compass heading (degrees 0..360) of a horizontal direction. */
export function headingOf(dx: number, dz: number): number {
  const h = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (h + 360) % 360;
}

export function slerp(a: Quat, b: Quat, t: number, out: Quat): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let k0: number;
  let k1: number;
  if (cos > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const s = Math.sqrt(1 - cos * cos);
    const ang = Math.atan2(s, cos);
    k0 = Math.sin((1 - t) * ang) / s;
    k1 = Math.sin(t * ang) / s;
  }
  out.x = a.x * k0 + bx * k1;
  out.y = a.y * k0 + by * k1;
  out.z = a.z * k0 + bz * k1;
  out.w = a.w * k0 + bw * k1;
  const l = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  out.x /= l;
  out.y /= l;
  out.z /= l;
  out.w /= l;
  return out;
}
