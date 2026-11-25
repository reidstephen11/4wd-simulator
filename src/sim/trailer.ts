import type RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceId, surfaceGrip, surfaces } from '../data/surfaces';
import { DRUM, drumLoad, drumSpots, hitchPoint, trailerTuning, type TrailerTuning } from '../data/trailers';
import type { DamageMode } from '../data/damage';
import { waterForce } from './trailerWater';
import { Groups, groups, type Physics } from './physics';
import { type Quat, type Vec3, rotate, v3 } from './vehicle/math';
import type { Vehicle, VehicleEnv } from './vehicle/vehicle';

export interface TrailerWheel {
  contact: boolean;
  surface: SurfaceId;
  /** Suspension length: spring mount to wheel centre (m). */
  suspension: number;
  /** Accumulated spin (rad). */
  rotation: number;
  /** Normal load (N). */
  load: number;
  contactPoint: Vec3;
  /** How fast the spring is compressing (m/s, negative extending). */
  compression: number;
}

/** Something that happened to a trailer this step. */
export type TrailerEvent =
  | { type: 'jackknifed'; angleDeg: number }
  | { type: 'tipped' }
  | { type: 'righted' }
  | { type: 'loadWarning' }
  | { type: 'drumLoose' }
  | { type: 'tyreCut'; wheel: number };

/** Its rays find the ground, rocks, logs and planks, never the vehicle towing it. */
const WHEEL_FILTER = groups(Groups.DYNAMIC, Groups.TERRAIN | Groups.STATIC | Groups.DYNAMIC);
const SOLID = groups(Groups.DYNAMIC, 0xffff);

/**
 * A trailer (docs/NEXT.md): a dynamic body on two ray-cast wheels that neither drive nor
 * steer, joined to the towing vehicle's hitch by a ball joint. Unhitched, it stands on its
 * jockey wheel with its wheels chocked. A load adds its mass and moves the centre of mass.
 */
export class Trailer {
  readonly body: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly wheels: TrailerWheel[];
  /** The vehicle towing it, or null when it stands on its jockey wheel. */
  hitchedTo: Vehicle | null = null;
  /** The load on board (kg) and where its centre sits (local). */
  readonly load = { mass: 0, com: v3(), half: v3() };
  /** 200 L drums of diesel standing in it (part of `load`). */
  drums = 0;
  /** Load lashings working loose (0 secure, 1 a drum comes out). */
  strain = 0;
  readonly tyres = [1, 1];
  private spillCooldown = 0;
  private loadWarned = false;
  /** The hardest a wheel hit something this step (spring compression speed, m/s), 0 if none. */
  bump = 0;
  private bumpCooldown = 0;
  /** Over on its side. */
  tipped = false;
  /** The drawbar has come round against the back of the towing vehicle. */
  jackknifed = false;
  readonly prevPosition = v3();
  readonly prevRotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private joint: RAPIER.ImpulseJoint | null = null;
  private readonly jockey: RAPIER.Collider;
  private readonly rawRotation: number[];
  private readonly tmp = v3();
  private readonly tmpB = v3();
  /** Yaw inertia about the coupling, load and all (kg·m²). */
  private yawInertia = 0;

  constructor(
    readonly id: string,
    readonly physics: Physics,
    readonly tuning: TrailerTuning,
    pose: { x: number; y: number; z: number; rotation: Quat },
    readonly env: VehicleEnv = { wetness: 0, waterLevelOffset: 0 },
  ) {
    const R = physics.R;
    const t = tuning;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, pose.y, pose.z)
        .setRotation(pose.rotation)
        .setAdditionalMassProperties(t.mass, t.com, t.inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setLinearDamping(0.02)
        .setAngularDamping(0.15)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    for (const b of t.boxes) {
      const c = physics.world.createCollider(
        R.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
          .setTranslation(b.cx, b.cy, b.cz)
          .setDensity(0)
          .setFriction(0.5)
          .setRestitution(0.05)
          .setCollisionGroups(SOLID),
        this.body,
      );
      physics.colliderSurface.set(c.handle, SurfaceId.Rock);
    }
    const j = t.jockey;
    this.jockey = physics.world.createCollider(
      R.ColliderDesc.ball(j.r)
        .setTranslation(j.x, j.y, j.z)
        .setDensity(0)
        .setFriction(0.9)
        .setCollisionGroups(groups(Groups.DYNAMIC, Groups.TERRAIN | Groups.STATIC)),
      this.body,
    );
    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    for (const w of t.wheels)
      this.controller.addWheel(
        w,
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        t.suspensionRestLength,
        t.wheelRadius,
      );
    for (let i = 0; i < t.wheels.length; i++) {
      this.controller.setWheelMaxSuspensionTravel(i, t.suspensionTravel);
      this.controller.setWheelSuspensionCompression(i, t.damperCompression);
      this.controller.setWheelSuspensionRelaxation(i, t.damperRelaxation);
      this.controller.setWheelMaxSuspensionForce(i, 60000);
      this.controller.setWheelSideFrictionStiffness(i, 1);
    }
    this.rawRotation = t.wheels.map(() => 0);
    this.wheels = t.wheels.map(() => ({
      contact: false,
      surface: SurfaceId.Dirt,
      suspension: t.suspensionRestLength,
      rotation: 0,
      load: 0,
      contactPoint: v3(),
      compression: 0,
    }));
    this.applyMass();
    this.snapshot();
  }

  /** Total mass with the load (kg). */
  get mass(): number {
    return this.tuning.mass + this.load.mass;
  }

  /**
   * Put a load on board: its mass (kg), its centre (local) and its half extents, as a solid
   * block. A load of 0 empties it.
   */
  setLoad(mass: number, com: Vec3, half: Vec3): void {
    this.load.mass = mass;
    Object.assign(this.load.com, com);
    Object.assign(this.load.half, half);
    this.applyMass();
  }

  /** Stand `count` full drums of diesel in it (0 empties it). */
  loadDrums(count: number): void {
    const l = drumLoad(count, this.tuning.bed);
    this.setLoad(count > 0 ? l.mass : 0, l.com, l.half);
    this.drums = count;
  }

  /** Mass properties of the trailer and its load together, and springs to suit. */
  private applyMass(): void {
    const t = this.tuning;
    const l = this.load;
    const m = t.mass + l.mass;
    const c = {
      x: (t.mass * t.com.x + l.mass * l.com.x) / m,
      y: (t.mass * t.com.y + l.mass * l.com.y) / m,
      z: (t.mass * t.com.z + l.mass * l.com.z) / m,
    };
    // Each part's own inertia, moved to the shared centre (parallel axes).
    const part = (mass: number, at: Vec3, own: Vec3) => ({
      x: own.x + mass * ((at.y - c.y) ** 2 + (at.z - c.z) ** 2),
      y: own.y + mass * ((at.x - c.x) ** 2 + (at.z - c.z) ** 2),
      z: own.z + mass * ((at.x - c.x) ** 2 + (at.y - c.y) ** 2),
    });
    const h = l.half;
    const box = {
      x: (l.mass * ((2 * h.y) ** 2 + (2 * h.z) ** 2)) / 12,
      y: (l.mass * ((2 * h.x) ** 2 + (2 * h.z) ** 2)) / 12,
      z: (l.mass * ((2 * h.x) ** 2 + (2 * h.y) ** 2)) / 12,
    };
    const a = part(t.mass, t.com, t.inertia);
    const b = part(l.mass, l.com, box);
    const reach = Math.hypot(t.coupling.x - c.x, t.coupling.z - c.z);
    this.yawInertia = a.y + b.y + m * reach * reach;
    this.body.setAdditionalMassProperties(
      m,
      c,
      { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    // Rapier's spring stiffness is per kilogram of the body it holds up.
    for (let i = 0; i < t.wheels.length; i++)
      this.controller.setWheelSuspensionStiffness(i, t.springRate / m);
  }

  /** World position of a local point. */
  localToWorld(x: number, y: number, z: number, out: Vec3 = v3()): Vec3 {
    const p = this.body.translation();
    rotate(this.body.rotation(), x, y, z, out);
    out.x += p.x;
    out.y += p.y;
    out.z += p.z;
    return out;
  }

  /** Where the coupling is now (world). */
  couplingWorld(out: Vec3 = v3()): Vec3 {
    const c = this.tuning.coupling;
    return this.localToWorld(c.x, c.y, c.z, out);
  }

  /** How far the coupling is from a vehicle's hitch (m), or Infinity if it's hitched to another. */
  distanceToHitch(v: Vehicle): number {
    if (this.hitchedTo && this.hitchedTo !== v) return Infinity;
    const h = hitchPoint(v.tuning);
    const ball = v.localToWorld(h.x, h.y, h.z, this.tmpB);
    const cp = this.couplingWorld(this.tmp);
    return Math.hypot(ball.x - cp.x, ball.y - cp.y, ball.z - cp.z);
  }

  /**
   * Drop the coupling onto a vehicle's hitch: the trailer is wheeled the last bit by hand
   * (moved so the coupling meets the ball) and joined there, and the jockey wheel wound up.
   */
  hitch(v: Vehicle): void {
    if (this.hitchedTo) this.unhitch();
    const h = hitchPoint(v.tuning);
    const ball = v.localToWorld(h.x, h.y, h.z, this.tmpB);
    const cp = this.couplingWorld(this.tmp);
    const p = this.body.translation();
    this.body.setTranslation(
      { x: p.x + ball.x - cp.x, y: p.y + ball.y - cp.y, z: p.z + ball.z - cp.z },
      true,
    );
    this.body.setLinvel(v.body.linvel(), true);
    const R = this.physics.R;
    this.joint = this.physics.world.createImpulseJoint(
      R.JointData.spherical(h, this.tuning.coupling),
      v.body,
      this.body,
      true,
    );
    // The drawbar can still come round against the back of the car.
    this.joint.setContactsEnabled(true);
    this.jockey.setEnabled(false);
    this.hitchedTo = v;
    this.jackknifed = false;
  }

  /** Lift the coupling off the ball and stand it on the jockey wheel. */
  unhitch(): void {
    if (this.joint) this.physics.world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    this.hitchedTo = null;
    this.jockey.setEnabled(true);
    this.jackknifed = false;
  }

  /**
   * Angle between the towing vehicle's heading and the trailer's, seen from above
   * (degrees, + = the trailer swung to the vehicle's right); 0 unhitched.
   */
  hitchAngleDeg(): number {
    const v = this.hitchedTo;
    if (!v) return 0;
    const a = v.forward(this.tmp);
    const b = rotate(this.body.rotation(), 0, 0, -1, this.tmpB);
    const cross = a.x * b.z - a.z * b.x;
    const dotp = a.x * b.x + a.z * b.z;
    // The trailer's nose swings left as its tail swings right.
    return (-Math.atan2(cross, dotp) * 180) / Math.PI;
  }

  /** Angle between its up axis and world up (degrees). */
  tiltDeg(): number {
    const u = rotate(this.body.rotation(), 0, 1, 0, this.tmp);
    return (Math.acos(Math.max(-1, Math.min(1, u.y))) * 180) / Math.PI;
  }

  /** Remember the pose before a physics step (for render interpolation). */
  snapshot(): void {
    const p = this.body.translation();
    const q = this.body.rotation();
    Object.assign(this.prevPosition, { x: p.x, y: p.y, z: p.z });
    Object.assign(this.prevRotation, { x: q.x, y: q.y, z: q.z, w: q.w });
  }

  /** Grip, rolling resistance and chocks for this step. Call before the physics world steps. */
  step(dt: number): void {
    this.snapshot();
    this.limitFold();
    const c = this.controller;
    const chocked = !this.hitchedTo;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      c.setWheelFrictionSlip(i, this.tuning.lateralGrip * surfaceGrip(w.surface, this.env.wetness));
      c.setWheelRadius(i, this.tuning.wheelRadius * (this.tyres[i] > 0 ? 1 : 0.65));
      const rolling = w.contact ? surfaces[w.surface].rollingResistance * w.load : 0;
      c.setWheelBrake(
        i,
        (chocked ? trailerTuning.chockForce : rolling + (1 - this.tyres[i]) * w.load * 0.1) * dt,
      );
    }
    c.updateVehicle(dt, this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS, WHEEL_FILTER);
    this.addRollTorque();
    this.water(dt);
  }

  /** Open steel box: little trapped air; sealed tyres and drums provide most of the lift. */
  private water(dt: number): void {
    const t = this.tuning;
    const p = this.localToWorld(0, t.bed.y + 0.1, t.bed.cz);
    waterForce(this.physics, this.body, p, 0.2, 0.035, 1.2, this.env.waterLevelOffset, dt);
    for (let i = 0; i < t.wheels.length; i++) {
      const w = t.wheels[i];
      waterForce(
        this.physics,
        this.body,
        this.localToWorld(w.x, w.y - this.wheels[i].suspension, w.z),
        t.wheelRadius,
        Math.PI * t.wheelRadius ** 2 * t.wheelWidth * (this.tyres[i] > 0 ? 1 : 0.1),
        0.15,
        this.env.waterLevelOffset,
        dt,
      );
    }
    const up = rotate(this.body.rotation(), 0, 1, 0);
    const half = (Math.abs(up.y) * DRUM.height) / 2 + Math.hypot(up.x, up.z) * DRUM.radius;
    for (const [x, z] of drumSpots(this.drums, t.bed))
      waterForce(
        this.physics,
        this.body,
        this.localToWorld(x, t.bed.y + DRUM.height / 2, z),
        half,
        Math.PI * DRUM.radius ** 2 * DRUM.height,
        0.45,
        this.env.waterLevelOffset,
        dt,
      );
  }

  /**
   * Folded round to `foldLimitDeg`, the A-frame meets the towbar's tongue: stop it folding
   * further, whatever the back of the vehicle is shaped like. Equal and opposite twists
   * on the trailer and the vehicle take out the folding speed, plus a little to ease it
   * back if it has gone past.
   */
  private limitFold(): void {
    const v = this.hitchedTo;
    if (!v) return;
    const angle = this.hitchAngleDeg();
    const over = Math.abs(angle) - trailerTuning.foldLimitDeg;
    if (over <= 0) return;
    const side = Math.sign(angle);
    // The hitch angle grows with the trailer's yaw rate less the vehicle's (about +y).
    const folding = side * (this.body.angvel().y - v.body.angvel().y) + (over * Math.PI) / 180;
    if (folding <= 0) return;
    const inertia = 1 / (1 / this.yawInertia + 1 / v.tuning.inertia.y);
    const j = side * folding * inertia;
    this.body.applyTorqueImpulse({ x: 0, y: -j, z: 0 }, true);
    v.body.applyTorqueImpulse({ x: 0, y: j, z: 0 }, true);
  }

  /**
   * Rapier applies only a tenth of the roll that the tyres' side forces put on the body; add
   * the rest, as the vehicles do (Vehicle.addRollTorque), so a loaded trailer leans and can tip.
   */
  private addRollTorque(): void {
    const c = this.controller;
    const q = this.body.rotation();
    const up = rotate(q, 0, 1, 0, this.tmp);
    const com = this.body.worldCom();
    let tx = 0;
    let ty = 0;
    let tz = 0;
    for (let i = 0; i < this.wheels.length; i++) {
      if (!c.wheelIsInContact(i)) continue;
      const j = c.wheelSideImpulse(i) ?? 0;
      const cp = c.wheelContactPoint(i);
      const n = c.wheelContactNormal(i);
      if (j === 0 || !cp || !n) continue;
      const axle = rotate(q, 1, 0, 0, this.tmpB);
      const proj = axle.x * n.x + axle.y * n.y + axle.z * n.z;
      let ax = axle.x - n.x * proj;
      let ay = axle.y - n.y * proj;
      let az = axle.z - n.z * proj;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const k = 0.9 * (up.x * (cp.x - com.x) + up.y * (cp.y - com.y) + up.z * (cp.z - com.z)) * j;
      tx += (up.y * az - up.z * ay) * k;
      ty += (up.z * ax - up.x * az) * k;
      tz += (up.x * ay - up.y * ax) * k;
    }
    this.body.applyTorqueImpulse({ x: tx, y: ty, z: tz }, true);
  }

  /** Read back the wheels and see what happened. Call after the physics world steps. */
  postStep(dt: number, damage: DamageMode = 'off'): TrailerEvent[] {
    const c = this.controller;
    this.bump = 0;
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.contact = c.wheelIsInContact(i);
      const susp = c.wheelSuspensionLength(i) ?? w.suspension;
      w.compression = (w.suspension - susp) / dt;
      w.suspension = susp;
      if (w.contact && w.compression > trailerTuning.bumpSpeed && this.bumpCooldown === 0)
        this.bump = Math.max(this.bump, w.compression);
      w.load = w.contact ? (c.wheelSuspensionForce(i) ?? 0) : 0;
      const cp = c.wheelContactPoint(i);
      if (cp) Object.assign(w.contactPoint, { x: cp.x, y: cp.y, z: cp.z });
      if (w.contact)
        w.surface = this.physics.surfaceOfCollider(c.wheelGroundObject(i), cp?.x ?? 0, cp?.z ?? 0);
      const r = c.wheelRotation(i) ?? this.rawRotation[i];
      w.rotation += r - this.rawRotation[i];
      this.rawRotation[i] = r;
    }
    if (this.bump > 0) this.bumpCooldown = 0.12;
    const events: TrailerEvent[] = [];
    const velocity = this.body.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);
    if (damage === 'realistic' && speed > 6) {
      for (let i = 0; i < this.wheels.length; i++) {
        const w = this.wheels[i];
        const hole = this.physics.ground.holeAt?.(w.contactPoint.x, w.contactPoint.z) ?? 0;
        if (
          this.tyres[i] > 0 &&
          w.contact &&
          w.compression > 4.5 &&
          (w.surface === SurfaceId.Rock || hole > 0.12)
        ) {
          this.tyres[i] = 0;
          events.push({ type: 'tyreCut', wheel: i });
        }
      }
    }
    const tilt = this.tiltDeg();
    if (!this.tipped && tilt > trailerTuning.tippedDeg) {
      this.tipped = true;
      events.push({ type: 'tipped' });
    } else if (this.tipped && tilt < 20) {
      this.tipped = false;
      events.push({ type: 'righted' });
    }
    const angle = Math.abs(this.hitchAngleDeg());
    if (this.hitchedTo && !this.jackknifed && angle > trailerTuning.jackknifeDeg) {
      this.jackknifed = true;
      events.push({ type: 'jackknifed', angleDeg: angle });
    } else if (this.jackknifed && angle < trailerTuning.jackknifeDeg - 20) this.jackknifed = false;
    this.spillCooldown = Math.max(0, this.spillCooldown - dt);
    if (this.drums > 0) {
      // Repeated hard hits at speed loosen lashings; ordinary crawling does not.
      if (this.bump > 3.5 && speed > 5)
        this.strain = Math.min(1, this.strain + (this.bump - 3.5) * (speed - 4) * 0.003);
      if (this.strain >= 0.55 && !this.loadWarned) {
        this.loadWarned = true;
        events.push({ type: 'loadWarning' });
      }
      if ((tilt > 70 || this.strain >= 1) && this.spillCooldown === 0) {
        // Simulation creates a loose body before reducing the cargo count.
        events.push({ type: 'drumLoose' });
        this.spillCooldown = 0.8;
      }
    }
    return events;
  }

  secureLoad(): void {
    this.strain = 0;
    this.loadWarned = false;
  }

  /** Move it (and stop it) where it stands now: a camp, a restart, a teleport. */
  teleport(x: number, y: number, z: number, rotation: Quat): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(rotation, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.tipped = false;
    this.jackknifed = false;
    this.snapshot();
  }

  /** Remove it from the world. */
  remove(): void {
    this.unhitch();
    this.physics.world.removeVehicleController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}

/**
 * Where a trailer stands hitched straight behind a vehicle: the coupling on the hitch,
 * heading the same way, its wheels on the ground at `groundAt` (leaning with the ground
 * across the axle, and pitched to meet the ball).
 */
export function poseBehind(
  v: Vehicle,
  t: TrailerTuning,
  groundAt: (x: number, z: number) => number,
): { x: number; y: number; z: number; rotation: Quat } {
  const h = hitchPoint(v.tuning);
  const ball = v.localToWorld(h.x, h.y, h.z);
  const f = v.forward();
  const heading = Math.atan2(f.x, -f.z);
  const reach = t.coupling.z;
  // Ride height of the springs' mounts over the ground with the trailer standing empty.
  const ride = t.suspensionRestLength - (t.mass * 9.81) / (t.wheels.length * t.springRate) + t.wheelRadius;
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const ax = ball.x + fx * reach;
  const az = ball.z + fz * reach;
  // Right is (-fz, fx) seen from above.
  const half = t.wheels[1].x;
  const left = groundAt(ax + fz * half, az - fx * half);
  const right = groundAt(ax - fz * half, az + fx * half);
  const axleY = (left + right) / 2 + ride;
  const roll = Math.atan2(right - left, 2 * half);
  const pitch = Math.atan2(ball.y - (axleY + t.coupling.y), -reach);
  // Yaw about y, then pitch about the trailer's own x, then roll about its own z.
  const rotation = mul(mul(axis(0, 1, 0, -heading), axis(1, 0, 0, pitch)), axis(0, 0, 1, roll));
  const k = rotate(rotation, t.coupling.x, t.coupling.y, t.coupling.z);
  return { x: ball.x - k.x, y: ball.y - k.y, z: ball.z - k.z, rotation };
}

function axis(x: number, y: number, z: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(angle / 2) };
}

function mul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
