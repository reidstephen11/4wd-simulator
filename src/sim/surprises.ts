import type RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceId } from '../data/surfaces';
import { Groups, groups, type Physics, type Rapier } from './physics';
import type { Vehicle } from './vehicle/vehicle';
import type { TrackInfo } from './world/features';
import { convexHull } from './world/convexHull';
import type { FallenTreeDef } from './world/mapTypes';
import { poseOf, snapshotPose, type PosedBody } from './bodyPose';
import {
  distanceShort,
  piecePose,
  planDuration,
  surpriseTuning,
  type RockPiece,
  type SurpriseKind,
  type SurprisePiece,
  type SurprisePlan,
  type TrunkPiece,
} from './world/surprisePlan';

/** Branch stubs on a fallen trunk: [position along the trunk (−1..1), offset x, offset z]. */
export const FALLEN_TREE_STUBS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.4, 0.45, 0.2],
  [0.1, -0.4, 0.35],
  [0.55, 0.3, -0.4],
];

/** A movable world object: a fallen tree (the map's or a surprise's), a fallen rock, later planks. */
export interface DynamicObject extends PosedBody {
  id: string;
  kind: 'fallenTree' | 'rock' | 'plank';
  body: RAPIER.RigidBody;
  def?: FallenTreeDef;
  /** A rock's faceted shape (its collider is the hull of these vertices). */
  shape?: { vertices: Float32Array; indices: Uint32Array };
  /** Radius a winch strap wraps round (rocks). */
  radius?: number;
}

/** Add a trunk's capsule and branch stubs to a body (the map's fallen tree and the surprises' alike). */
export function addTrunkColliders(
  R: Rapier,
  physics: Physics,
  body: RAPIER.RigidBody,
  length: number,
  radius: number,
  mass: number,
  /** Torn-out root plate at the foot (kg): it holds that end, so a pull on the crown swings it round. */
  rootPlate = 0,
): RAPIER.Collider[] {
  const member = groups(Groups.DYNAMIC, 0xffff);
  const half = length / 2 - radius;
  const trunk = physics.world.createCollider(
    R.ColliderDesc.capsule(half, radius)
      .setMass(mass * 0.85)
      .setFriction(0.8)
      .setCollisionGroups(member),
    body,
  );
  physics.colliderSurface.set(trunk.handle, SurfaceId.Wood);
  const out = [trunk];
  // Broken branch stubs stop it rolling like a pipe.
  for (const [ay, ox, oz] of FALLEN_TREE_STUBS) {
    const stub = physics.world.createCollider(
      R.ColliderDesc.capsule(0.35, 0.09)
        .setTranslation(ox, ay * half, oz)
        .setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) })
        .setMass((mass * 0.15) / 3)
        .setFriction(0.9)
        .setCollisionGroups(member),
      body,
    );
    physics.colliderSurface.set(stub.handle, SurfaceId.Wood);
    out.push(stub);
  }
  if (rootPlate > 0) {
    // A slab of roots and clay across the foot, as drawn; its flat faces stop it rolling.
    const w = radius + 0.15;
    const plate = physics.world.createCollider(
      R.ColliderDesc.cuboid(w, 0.3, w)
        .setTranslation(0, -(half + radius - 0.3), 0)
        .setMass(rootPlate)
        .setFriction(1.0)
        .setCollisionGroups(member),
      body,
    );
    physics.colliderSurface.set(plate.handle, SurfaceId.Dirt);
    out.push(plate);
  }
  return out;
}

type Phase = 'waiting' | 'falling' | 'down';

interface Piece {
  def: SurprisePiece;
  obj: DynamicObject;
  colliders: RAPIER.Collider[];
  /** Solid to the car (false while it falls, and until the car is clear of where it landed). */
  solid: boolean;
  dynamic: boolean;
}

interface Live {
  plan: SurprisePlan;
  track: TrackInfo;
  phase: Phase;
  /** Seconds since it started. */
  t: number;
  pieces: Piece[];
}

/** Something happened: an event started (it is coming down) or everything in it is down. */
export interface SurpriseEvent {
  id: string;
  kind: SurpriseKind;
  phase: 'started' | 'down';
  x: number;
  z: number;
}

const SOLID = groups(Groups.DYNAMIC, 0xffff);
// While it falls it passes through everything: the motion is scripted, and it must never
// land on the car.
const GHOST = groups(Groups.DYNAMIC, 0);

/**
 * The run's surprises in the simulation: each waits as a dead tree standing at the roadside
 * or rocks loose on a bank, starts once (when the car comes along the track towards it),
 * comes down on a scripted path, and is then an ordinary movable object to winch or push
 * aside. A restart from camp puts back those that hadn't happened by then.
 */
export class Surprises {
  private readonly live: Live[];
  /** Started by `trigger`, told on the next step. */
  private readonly pending: SurpriseEvent[] = [];

  constructor(
    private readonly R: Rapier,
    private readonly physics: Physics,
    private readonly heightAt: (x: number, z: number) => number,
    plans: readonly SurprisePlan[],
    tracks: readonly TrackInfo[],
    happened: Iterable<string> = [],
  ) {
    this.live = plans.map((plan) => {
      const track = tracks.find((t) => t.def.id === plan.track);
      if (!track) throw new Error(`Surprise ${plan.id}: no track ${plan.track}`);
      const pieces = plan.pieces.map((def, k) => this.makePiece(plan, def, k));
      return { plan, track, phase: 'waiting' as Phase, t: 0, pieces };
    });
    this.reset(happened);
  }

  /** The movable objects, for the winch and the renderer. */
  objects(): DynamicObject[] {
    return this.live.flatMap((l) => l.pieces.map((p) => p.obj));
  }

  get plans(): SurprisePlan[] {
    return this.live.map((l) => l.plan);
  }

  /** Ids of the events that have started (kept in camp checkpoints). */
  happened(): string[] {
    return this.live.filter((l) => l.phase !== 'waiting').map((l) => l.plan.id);
  }

  phaseOf(id: string): Phase | undefined {
    return this.live.find((l) => l.plan.id === id)?.phase;
  }

  /**
   * As at a camp: events that had happened by then stay as they are (or, building the run
   * from a save, are put down where they landed); the rest wait again where they began.
   */
  reset(happened: Iterable<string>): void {
    const done = new Set(happened);
    for (const l of this.live) {
      if (done.has(l.plan.id)) {
        if (l.phase !== 'down') {
          l.phase = 'down';
          l.t = planDuration(l.plan);
          for (const p of l.pieces) this.place(p, l.t, true);
        }
        continue;
      }
      l.phase = 'waiting';
      l.t = 0;
      for (const p of l.pieces) this.place(p, 0, false);
    }
    // Put back where they were: nothing is drawn on the way.
    for (const l of this.live) for (const p of l.pieces) snapshotPose(p.obj);
  }

  /** Start an event now, wherever the car is (tests and the debug tools). */
  trigger(id: string): void {
    const l = this.live.find((q) => q.plan.id === id);
    if (!l || l.phase !== 'waiting') return;
    this.start(l);
    this.pending.push(this.event(l, 'started'));
  }

  /**
   * One step, before physics: start an event when the car comes towards it along its track
   * (sooner at speed, so there's room to stop), move what's falling, and make what's down
   * solid once the car is clear of it.
   */
  update(car: Vehicle | undefined, dt: number): SurpriseEvent[] {
    const events = this.pending.splice(0);
    const p = car?.body.translation();
    for (const l of this.live) {
      if (l.phase === 'waiting') {
        if (!car || !p) continue;
        const short = distanceShort(l.plan, l.track, p.x, p.z);
        if (short === null) continue;
        const speed = Math.max(0, car.speed);
        const reach = Math.max(
          l.plan.triggerAhead,
          speed * (planDuration(l.plan) + surpriseTuning.triggerLead) + surpriseTuning.triggerMargin,
        );
        if (short > reach) continue;
        this.start(l);
        events.push(this.event(l, 'started'));
        continue;
      }
      if (l.phase === 'falling') {
        l.t += dt;
        const end = l.t >= planDuration(l.plan);
        for (const piece of l.pieces) {
          const down = l.t >= piece.def.delay + piece.def.duration;
          if (!piece.dynamic) {
            const pose = piecePose(piece.def, l.t, this.heightAt);
            piece.obj.body.setNextKinematicTranslation({ x: pose.x, y: pose.y, z: pose.z });
            piece.obj.body.setNextKinematicRotation(pose.q);
          }
          if (down && !piece.dynamic && (!p || this.clearOf(piece, p))) this.release(piece);
        }
        if (end && l.pieces.every((q) => q.dynamic)) {
          l.phase = 'down';
          events.push(this.event(l, 'down'));
        }
      }
    }
    return events;
  }

  private event(l: Live, phase: SurpriseEvent['phase']): SurpriseEvent {
    return { id: l.plan.id, kind: l.plan.kind, phase, x: l.plan.x, z: l.plan.z };
  }

  private start(l: Live): void {
    l.phase = 'falling';
    l.t = 0;
    for (const p of l.pieces) this.setSolid(p, false);
  }

  /** The car is far enough from where a piece came to rest for it to turn solid. */
  private clearOf(piece: Piece, car: { x: number; z: number }): boolean {
    const b = piece.obj.body.translation();
    const c = surpriseTuning.carClearance;
    if (piece.def.kind === 'rock') return Math.hypot(car.x - b.x, car.z - b.z) > c + piece.def.rx;
    const d = piece.def;
    const half = d.length / 2;
    const ax = b.x - d.fx * half * Math.cos(d.rest);
    const az = b.z - d.fz * half * Math.cos(d.rest);
    const vx = d.fx * d.length * Math.cos(d.rest);
    const vz = d.fz * d.length * Math.cos(d.rest);
    const t = Math.max(0, Math.min(1, ((car.x - ax) * vx + (car.z - az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(car.x - ax - vx * t, car.z - az - vz * t) > c + d.radius;
  }

  /** Down: from here on it's an ordinary movable object. */
  private release(piece: Piece): void {
    const b = piece.obj.body;
    b.setBodyType(this.R.RigidBodyType.Dynamic, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.dynamic = true;
    this.setSolid(piece, true);
  }

  /** Put a piece where it is `t` seconds into its event: kinematic before it lands, else movable. */
  private place(piece: Piece, t: number, landed: boolean): void {
    const b = piece.obj.body;
    const pose = piecePose(piece.def, t, this.heightAt);
    b.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
    b.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    b.setRotation(pose.q, true);
    b.setNextKinematicTranslation({ x: pose.x, y: pose.y, z: pose.z });
    b.setNextKinematicRotation(pose.q);
    piece.dynamic = false;
    if (landed) this.release(piece);
    // Waiting, the standing tree and the rocks on the bank are solid where they are.
    else this.setSolid(piece, true);
  }

  private setSolid(piece: Piece, solid: boolean): void {
    piece.solid = solid;
    for (const c of piece.colliders) c.setCollisionGroups(solid ? SOLID : GHOST);
  }

  private makePiece(plan: SurprisePlan, def: SurprisePiece, k: number): Piece {
    const id = `${plan.id}:${k}`;
    return def.kind === 'trunk' ? this.makeTrunk(id, def) : this.makeRock(id, def);
  }

  private makeTrunk(id: string, d: TrunkPiece): Piece {
    const R = this.R;
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setLinearDamping(0.4).setAngularDamping(1.2),
    );
    const colliders = addTrunkColliders(R, this.physics, body, d.length, d.radius, d.mass, d.rootPlate);
    const half = d.length / 2;
    const def: FallenTreeDef = {
      id,
      x: d.base.x + d.fx * half,
      z: d.base.z + d.fz * half,
      headingDeg: (Math.atan2(d.fx, -d.fz) * 180) / Math.PI,
      length: d.length,
      radius: d.radius,
      mass: d.mass,
    };
    return {
      def: d,
      obj: { id, kind: 'fallenTree', body, def, ...poseOf(body) },
      colliders,
      solid: true,
      dynamic: false,
    };
  }

  private makeRock(id: string, d: RockPiece): Piece {
    const R = this.R;
    const shape = convexHull(d.points);
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setLinearDamping(0.3).setAngularDamping(2.5),
    );
    const c = this.physics.world.createCollider(
      R.ColliderDesc.convexHull(shape.vertices)!
        .setDensity(surpriseTuning.rockDensity)
        .setFriction(0.9)
        .setCollisionGroups(SOLID),
      body,
    );
    this.physics.colliderSurface.set(c.handle, SurfaceId.Rock);
    return {
      def: d,
      obj: { id, kind: 'rock', body, shape, radius: Math.max(d.rx, d.rz), ...poseOf(body) },
      colliders: [c],
      solid: true,
      dynamic: false,
    };
  }
}
