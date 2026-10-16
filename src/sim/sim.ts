import type RAPIER from '@dimforge/rapier3d-compat';
import type { EnvironmentConfig } from '../data/environment';
import { SurfaceId } from '../data/surfaces';
import { vehicleTuning } from '../data/vehicle';
import { Emitter } from '../core/events';
import { Groups, groups, Physics, type GroundQuery, type Rapier } from './physics';
import type { VehicleInput } from './input/vehicleInput';
import { Vehicle, type SpawnPose } from './vehicle/vehicle';
import type { World } from './world/world';
import { placedPropShapes } from './world/props';
import { StaticMeshBatcher } from './world/staticMesh';
import type { FallenTreeDef } from './world/mapTypes';
import { scatterTuning } from '../data/vegetation';

/** Branch stubs on the Fallen Tree: [position along the trunk (−1..1), offset x, offset z]. */
export const FALLEN_TREE_STUBS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.4, 0.45, 0.2],
  [0.1, -0.4, 0.35],
  [0.55, 0.3, -0.4],
];

/** Rotation that lays a +y capsule flat (90° about x) and then turns it `yaw` about y. */
export function quatYawX(yaw: number): { x: number; y: number; z: number; w: number } {
  const c = Math.cos(Math.PI / 4);
  const sx = Math.sin(Math.PI / 4);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  // q = qy * qx
  return { w: cy * c, x: cy * sx, y: sy * c, z: -sy * sx };
}

/** A movable world object (the Fallen Tree; later, planks). */
export interface DynamicObject {
  id: string;
  kind: 'fallenTree' | 'plank';
  body: RAPIER.RigidBody;
  def?: FallenTreeDef;
}

export interface SimEvents extends Record<string, unknown> {
  vehicleSpawned: { id: string };
  rangeChanged: { id: string; range: 'high' | 'low' };
}

/** Plain-data snapshot of the simulation (SPEC §11: sim state must be serialisable). */
export interface SimState {
  time: number;
  vehicles: Array<{
    id: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    linvel: { x: number; y: number; z: number };
    angvel: { x: number; y: number; z: number };
    range: 'high' | 'low';
    gear: number;
    engineRunning: boolean;
  }>;
}

/**
 * The game simulation: physics world, terrain collider and vehicle entities. No
 * rendering, UI or audio here; those layers read this state every frame.
 */
export class Simulation {
  readonly physics: Physics;
  readonly vehicles = new Map<string, Vehicle>();
  readonly events = new Emitter<SimEvents>();
  readonly ground: GroundQuery;
  readonly dynamics = new Map<string, DynamicObject>();
  time = 0;

  constructor(
    readonly R: Rapier,
    readonly world: World,
    readonly env: EnvironmentConfig,
  ) {
    const terrain = world.terrain;
    this.ground = {
      surfaceAt: (x, z) => terrain.surfaceAt(x, z),
      waterSurfaceAt: (x, z) => terrain.waterSurfaceAt(x, z),
      heightAt: (x, z) => terrain.heightAt(x, z),
    };
    this.physics = new Physics(R, this.ground);
    this.physics.addTerrain(terrain);
    this.physics.addWalls(world.map.wallHalfExtent);
    for (const b of world.features.boxes)
      this.physics.addStaticBox(b, b.kind === 'ledge' ? SurfaceId.Rock : SurfaceId.Dirt);
    this.addScatterColliders();
    for (const f of world.map.fallenTrees) this.addFallenTree(f);
  }

  /**
   * Trees, rocks, logs and props become a few triangle-mesh colliders (one per 256 m
   * cell and surface), which keeps Rapier's step cost flat however much is scattered.
   */
  private addScatterColliders(): void {
    const R = this.R;
    const batcher = new StaticMeshBatcher(256);
    const h = scatterTuning.trunkColliderHeight;
    for (const t of this.world.scatter.trees) {
      if (!t.solid) continue;
      batcher.prism(
        'wood',
        [t.x, t.y - 0.5, t.z],
        [t.x + t.leanX * h, t.y + h, t.z + t.leanZ * h],
        t.trunkRadius,
        6,
      );
    }
    for (const r of this.world.scatter.rocks) {
      // Slightly smaller than the drawn rock so wheels touch what they see.
      if (r.solid) batcher.ico('rock', r.x, r.y, r.z, r.radius * 0.9, r.squash);
    }
    for (const l of this.world.scatter.logs) {
      const ex = Math.sin(l.yaw) * l.length * 0.5;
      const ez = Math.cos(l.yaw) * l.length * 0.5;
      batcher.prism('wood', [l.x - ex, l.y, l.z - ez], [l.x + ex, l.y, l.z + ez], l.radius, 6);
    }
    for (const p of this.world.map.props) {
      for (const ps of placedPropShapes(p, this.world.terrain)) {
        const s = ps.shape;
        if (s.type === 'box') batcher.box('wood', ps.x, ps.y, ps.z, s.hx, s.hy, s.hz, ps.yaw);
        else batcher.prism('wood', [ps.x, ps.y - s.hh, ps.z], [ps.x, ps.y + s.hh, ps.z], s.r, 10);
      }
    }
    for (const [key, b] of batcher.batches) {
      const surface = key.startsWith('rock') ? SurfaceId.Rock : SurfaceId.Wood;
      const c = this.physics.world.createCollider(
        R.ColliderDesc.trimesh(
          new Float32Array(b.vertices),
          new Uint32Array(b.indices),
          R.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
          .setFriction(surface === SurfaceId.Rock ? 1.0 : 0.6)
          .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
      );
      this.physics.colliderSurface.set(c.handle, surface);
    }
  }

  /** The Fallen Tree (SPEC §5): a heavy dynamic log that can be winched or pushed aside. */
  private addFallenTree(f: FallenTreeDef): void {
    const R = this.R;
    const yaw = (-f.headingDeg * Math.PI) / 180;
    const y = this.world.terrain.heightAt(f.x, f.z) + f.radius + 0.05;
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(f.x, y, f.z)
        .setRotation(quatYawX(yaw))
        .setLinearDamping(0.4)
        .setAngularDamping(1.2),
    );
    const member = groups(Groups.DYNAMIC, 0xffff);
    const half = f.length / 2 - f.radius;
    const trunk = this.physics.world.createCollider(
      R.ColliderDesc.capsule(half, f.radius)
        .setMass(f.mass * 0.85)
        .setFriction(0.8)
        .setCollisionGroups(member),
      body,
    );
    this.physics.colliderSurface.set(trunk.handle, SurfaceId.Wood);
    // Broken branch stubs stop it rolling like a pipe.
    for (const [ay, ox, oz] of FALLEN_TREE_STUBS) {
      const stub = this.physics.world.createCollider(
        R.ColliderDesc.capsule(0.35, 0.09)
          .setTranslation(ox, ay * half, oz)
          .setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) })
          .setMass((f.mass * 0.15) / 3)
          .setFriction(0.9)
          .setCollisionGroups(member),
        body,
      );
      this.physics.colliderSurface.set(stub.handle, SurfaceId.Wood);
    }
    this.dynamics.set(f.id, { id: f.id, kind: 'fallenTree', body, def: f });
  }

  /** Spawn pose on the ground at (x, z). */
  poseAt(x: number, z: number, headingDeg: number): SpawnPose {
    return { x, y: this.world.terrain.heightAt(x, z) + vehicleTuning.wheelRadius + 0.12, z, headingDeg };
  }

  campsitePose(poiId: string): SpawnPose {
    const p = this.world.pois.find((q) => q.id === poiId);
    if (!p) throw new Error(`Unknown POI ${poiId}`);
    const r = p.reset ?? { x: p.x, z: p.z, headingDeg: 0 };
    return this.poseAt(r.x, r.z, r.headingDeg);
  }

  addVehicle(id: string, pose: SpawnPose): Vehicle {
    const env = this.env;
    const v = new Vehicle(id, this.physics, vehicleTuning, pose, {
      get wetness() {
        return env.wetness;
      },
      get waterLevelOffset() {
        return env.waterLevelOffset;
      },
    });
    this.vehicles.set(id, v);
    this.events.emit('vehicleSpawned', { id });
    return v;
  }

  step(inputs: ReadonlyMap<string, VehicleInput>, dt: number): void {
    for (const [id, v] of this.vehicles) {
      const input = inputs.get(id);
      if (!input) continue;
      const before = v.drivetrain.range;
      v.step(input, dt);
      if (v.drivetrain.range !== before) this.events.emit('rangeChanged', { id, range: v.drivetrain.range });
    }
    this.physics.step();
    for (const v of this.vehicles.values()) v.postStep(dt);
    this.time += dt;
  }

  /**
   * Distance along a ray to the first static thing (terrain, rocks, trees, props), or
   * `max` if clear. Used by the camera to avoid clipping.
   */
  castStatic(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    const R = this.R;
    const ray = new R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.physics.world.castRay(
      ray,
      max,
      true,
      undefined,
      groups(Groups.VEHICLE, Groups.TERRAIN | Groups.STATIC),
    );
    return hit ? hit.timeOfImpact : max;
  }

  serialize(): SimState {
    return {
      time: this.time,
      vehicles: [...this.vehicles.values()].map((v) => {
        const p = v.body.translation();
        const q = v.body.rotation();
        const lv = v.body.linvel();
        const av = v.body.angvel();
        return {
          id: v.id,
          position: { x: p.x, y: p.y, z: p.z },
          rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
          linvel: { x: lv.x, y: lv.y, z: lv.z },
          angvel: { x: av.x, y: av.y, z: av.z },
          range: v.drivetrain.range,
          gear: v.drivetrain.gear,
          engineRunning: v.drivetrain.engineRunning,
        };
      }),
    };
  }

  /** Collider for debug drawing (everything except the heightfield). */
  isDebugDrawable(c: RAPIER.Collider): boolean {
    return !this.physics.terrainCollider || c.handle !== this.physics.terrainCollider.handle;
  }
}
