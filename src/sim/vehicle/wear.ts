import { SurfaceId, surfaces } from '../../data/surfaces';
import { wearTuning as W } from '../../data/tools';
import type { Vehicle } from './vehicle';
import { unrotate } from './math';

/** Visual body extents used to place dents (local space). */
const BODY = { cx: 0, cy: 0.7, cz: 0.02, hx: 0.82, hy: 0.78, hz: 1.9 };

/**
 * Light damage (SPEC §6.4): dirt builds up per zone on dirt and mud and is partly
 * washed off by water; hard impacts push small dents into the body. Visual only —
 * stored in VehicleCondition for the renderer to read.
 */
export function updateWear(v: Vehicle, dt: number): boolean {
  const c = v.condition;
  const dirt = c.dirt;
  const speedF = Math.min(1.5, Math.abs(v.speed) / W.dirtSpeedRef);
  let rate = 0;
  let mud = 0;
  let water = 0;
  let contacts = 0;
  for (const w of v.wheels) {
    water = Math.max(water, w.water);
    if (!w.contact) continue;
    contacts++;
    const s = surfaces[w.surface];
    // Spinning wheels throw dirt and mud even when the car isn't going anywhere.
    if (s.dirtRate > 0) rate += s.dirtRate * Math.max(speedF, w.spin * 2.5);
    if (w.surface === SurfaceId.Mud) mud++;
  }
  if (contacts > 0) rate /= contacts;
  const forward = v.speed >= 0;
  const add = (zone: keyof typeof dirt, k: number) => (dirt[zone] = Math.min(1, dirt[zone] + rate * k * dt));
  if (rate > 0) {
    add('wheels', 2.2);
    add('sides', 1.0);
    add('rear', forward ? 1.3 : 0.5);
    add('front', forward ? 0.45 : 1.2);
  }
  if (mud > 0) c.mudShare = Math.min(1, c.mudShare + dt * 0.6);
  else if (rate > 0) c.mudShare = Math.max(0, c.mudShare - dt * 0.03);
  // Water washes off some of it.
  if (water > 0.05) {
    const k = W.washRate * Math.min(1, water) * dt;
    for (const zone of ['front', 'sides', 'rear'] as const) {
      const floor = Math.min(dirt[zone], W.washFloor);
      dirt[zone] = Math.max(floor, dirt[zone] - k);
    }
    dirt.wheels = Math.max(0, dirt.wheels - k * 2);
  }

  // Dents from hard knocks.
  if (v.lastImpact > W.dentThreshold) {
    const q = v.body.rotation();
    // The side that was hit is opposite the velocity change.
    const d = unrotate(q, -v.lastImpactDir.x, -v.lastImpactDir.y, -v.lastImpactDir.z);
    const tx = Math.abs(d.x) > 1e-4 ? BODY.hx / Math.abs(d.x) : Infinity;
    const ty = Math.abs(d.y) > 1e-4 ? BODY.hy / Math.abs(d.y) : Infinity;
    const tz = Math.abs(d.z) > 1e-4 ? BODY.hz / Math.abs(d.z) : Infinity;
    const t = Math.min(tx, ty, tz);
    const px = BODY.cx + d.x * t;
    const py = BODY.cy + d.y * t;
    const pz = BODY.cz + d.z * t;
    // Inward normal of the face that was hit.
    const nx = t === tx ? -Math.sign(d.x) : 0;
    const ny = t === ty ? -Math.sign(d.y) : 0;
    const nz = t === tz ? -Math.sign(d.z) : 0;
    const depth = Math.min(W.dentMaxDepth, (v.lastImpact - W.dentThreshold + 1) * W.dentPerMs);
    const near = c.dents.find((dent) => Math.hypot(dent.x - px, dent.y - py, dent.z - pz) < 0.35);
    if (near) near.depth = Math.min(W.dentMaxDepth, near.depth + depth * 0.5);
    else {
      c.dents.push({
        x: px,
        y: py,
        z: pz,
        nx,
        ny,
        nz,
        depth,
        radius: 0.3 + Math.min(0.25, v.lastImpact * 0.03),
      });
      if (c.dents.length > W.maxDents) c.dents.shift();
    }
    return true;
  }
  return false;
}
