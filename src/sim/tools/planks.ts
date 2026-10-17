import type RAPIER from '@dimforge/rapier3d-compat';
import { plankTuning as P } from '../../data/tools';
import { SurfaceId } from '../../data/surfaces';
import { Groups, groups, type Physics } from '../physics';
import type { Vehicle } from '../vehicle/vehicle';
import { rotate } from '../vehicle/math';

export interface PlankPose {
  x: number;
  y: number;
  z: number;
  /** Yaw about +y (radians) — plank long axis is local z. */
  yaw: number;
  /** Nose-up pitch (radians). */
  pitch: number;
}

export interface PlacedPlank {
  id: number;
  body: RAPIER.RigidBody;
}

/** Height of whatever is under (x, z): terrain, rocks, lips, logs. */
export type GroundProbe = (x: number, z: number, fromY: number) => number;

/**
 * Two recovery planks (SPEC §7.2): a see-through preview lined up in front of the front
 * wheels that the player nudges (distance, angle) and confirms; placed planks are heavy
 * dynamic bodies with high friction; pick up within 4 m, recall when >150 m away.
 */
export class PlankKit {
  carried = P.count;
  readonly placed: PlacedPlank[] = [];
  /** Placement preview state. */
  previewing = false;
  distance = P.defaultDistance;
  angleDeg = 0;
  private nextId = 1;

  /** Where the two planks would go right now. */
  previewPoses(v: Vehicle, probe: GroundProbe): PlankPose[] {
    const t = v.tuning;
    const q = v.body.rotation();
    const p = v.body.translation();
    const fwd = rotate(q, 0, 0, -1);
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl;
    const fz = fwd.z / fl;
    const ang = (this.angleDeg * Math.PI) / 180;
    // Plank direction: heading rotated by the chosen angle.
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const dx = fx * c - fz * s;
    const dz = fx * s + fz * c;
    const frontZ = Math.min(...t.wheels.map((w) => w.z));
    const front = { x: p.x + fx * -frontZ, z: p.z + fz * -frontZ };
    const poses: PlankPose[] = [];
    const n = Math.min(2, Math.max(1, this.carried));
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : i === 0 ? -1 : 1;
      const lat = side * Math.abs(t.wheels[0].x);
      // Right vector of the heading.
      const rx = -fz;
      const rz = fx;
      const startX = front.x + rx * lat + dx * (this.distance + t.wheelRadius * 0.6);
      const startZ = front.z + rz * lat + dz * (this.distance + t.wheelRadius * 0.6);
      const half = P.length / 2;
      const cx = startX + dx * half;
      const cz = startZ + dz * half;
      const top = p.y + 2;
      const y0 = probe(startX, startZ, top);
      const y1 = probe(startX + dx * P.length, startZ + dz * P.length, top);
      const ym = probe(cx, cz, top);
      // Rest on the higher supports; the middle only matters if it sticks up.
      const ends = Math.max(y0, y1);
      const y = Math.max((y0 + y1) / 2, ym, ends - 0.25) + P.thickness / 2 + 0.03;
      const pitch = Math.atan2(y1 - y0, P.length);
      poses.push({ x: cx, y, z: cz, yaw: Math.atan2(dx, dz), pitch });
    }
    return poses;
  }

  adjust(dDistance: number, dAngleDeg: number): void {
    this.distance = Math.max(P.minDistance, Math.min(P.maxDistance, this.distance + dDistance));
    this.angleDeg = Math.max(-P.maxAngleDeg, Math.min(P.maxAngleDeg, this.angleDeg + dAngleDeg));
  }

  /** Drop the planks at the preview poses. */
  place(v: Vehicle, physics: Physics, probe: GroundProbe): boolean {
    if (this.carried <= 0) return false;
    const poses = this.previewPoses(v, probe);
    for (const pose of poses) {
      this.placed.push({ id: this.nextId++, body: createPlankBody(physics, pose) });
      this.carried--;
    }
    this.previewing = false;
    return true;
  }

  /** Placed planks within pick-up range of the vehicle. */
  inReach(v: Vehicle): PlacedPlank[] {
    const p = v.body.translation();
    return this.placed.filter((pl) => {
      const b = pl.body.translation();
      return Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < P.pickupRange + P.length / 2;
    });
  }

  pickUp(v: Vehicle, physics: Physics): number {
    const near = this.inReach(v);
    for (const pl of near) this.remove(pl, physics);
    this.carried += near.length;
    return near.length;
  }

  /** True when every placed plank is far enough away to recall. */
  canRecall(v: Vehicle): boolean {
    if (this.placed.length === 0) return false;
    const p = v.body.translation();
    return this.placed.every((pl) => {
      const b = pl.body.translation();
      return Math.hypot(b.x - p.x, b.z - p.z) > P.recallDistance;
    });
  }

  /** Bring every plank back to the roof rack. */
  recall(physics: Physics): void {
    for (const pl of [...this.placed]) this.remove(pl, physics);
    this.carried = P.count;
    this.previewing = false;
  }

  private remove(pl: PlacedPlank, physics: Physics): void {
    const i = this.placed.indexOf(pl);
    if (i >= 0) this.placed.splice(i, 1);
    physics.world.removeRigidBody(pl.body);
  }
}

export function createPlankBody(physics: Physics, pose: PlankPose): RAPIER.RigidBody {
  const R = physics.R;
  const cy = Math.cos(pose.yaw / 2);
  const sy = Math.sin(pose.yaw / 2);
  const cp = Math.cos(-pose.pitch / 2);
  const sp = Math.sin(-pose.pitch / 2);
  // yaw about y, then pitch about local x.
  const q = { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
  const body = physics.world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y + 0.05, pose.z)
      .setRotation(q)
      .setLinearDamping(0.3)
      .setAngularDamping(0.8)
      .setCcdEnabled(true),
  );
  const c = physics.world.createCollider(
    R.ColliderDesc.cuboid(P.colliderWidth / 2, P.thickness / 2, P.length / 2)
      .setMass(P.mass)
      .setFriction(P.friction)
      .setCollisionGroups(groups(Groups.DYNAMIC, 0xffff)),
    body,
  );
  physics.colliderSurface.set(c.handle, SurfaceId.Wood);
  return body;
}
