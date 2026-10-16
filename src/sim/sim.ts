import type RAPIER from '@dimforge/rapier3d-compat';
import type { EnvironmentConfig } from '../data/environment';
import { SurfaceId } from '../data/surfaces';
import { vehicleTuning } from '../data/vehicle';
import { Emitter } from '../core/events';
import { Groups, groups, Physics, type GroundQuery, type Rapier } from './physics';
import type { VehicleInput } from './input/vehicleInput';
import { Vehicle, type SpawnPose } from './vehicle/vehicle';
import type { World } from './world/world';

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
