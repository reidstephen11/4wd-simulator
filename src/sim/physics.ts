import RAPIER from '@dimforge/rapier3d-compat';
import { rockShape } from './world/rockShape';
import { PHYSICS_DT } from '../core/config';
import { SurfaceId } from '../data/surfaces';
import type { StaticBox, StaticRock } from './world/features';
import type { Terrain } from './world/terrain';
import { DETAIL_SUB, patchStride, patchTriangles } from './world/detail';

export type Rapier = typeof RAPIER;

let loading: Promise<Rapier> | null = null;

/** Load the Rapier WASM module once (works in browsers and in Node for tests). */
export function loadRapier(): Promise<Rapier> {
  loading ??= RAPIER.init().then(() => RAPIER);
  return loading;
}

/** Collision group bits. */
export const Groups = {
  TERRAIN: 0x0001,
  STATIC: 0x0002,
  VEHICLE: 0x0004,
  DYNAMIC: 0x0008,
  WALL: 0x0010,
} as const;

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

/** What the ground is made of and whether there's water, for any point. */
export interface GroundQuery {
  surfaceAt(x: number, z: number): SurfaceId;
  waterSurfaceAt(x: number, z: number): number | null;
  heightAt?(x: number, z: number): number;
}

export const flatDirt: GroundQuery = {
  surfaceAt: () => SurfaceId.Dirt,
  waterSurfaceAt: () => null,
};

/** Rapier world plus helpers for the static scene. */
export class Physics {
  readonly world: RAPIER.World;
  terrainCollider: RAPIER.Collider | null = null;
  /** Surface type for non-terrain colliders, keyed by collider handle. */
  readonly colliderSurface = new Map<number, SurfaceId>();

  constructor(
    readonly R: Rapier,
    readonly ground: GroundQuery = flatDirt,
  ) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = PHYSICS_DT;
  }

  /** 1 m heightfield collider matching Terrain exactly. */
  addTerrain(terrain: Terrain): RAPIER.Collider {
    const res = terrain.res;
    const n = terrain.size;
    // Rapier stores heights x-major (column-major rows = z); Terrain is z-major.
    const h = new Float32Array(res * res);
    for (let iz = 0; iz < res; iz++)
      for (let ix = 0; ix < res; ix++) h[ix * res + iz] = terrain.solidSample(ix, iz);
    const desc = this.R.ColliderDesc.heightfield(
      n,
      n,
      h,
      { x: n, y: 1, z: n },
      this.R.HeightFieldFlags.FIX_INTERNAL_EDGES,
    )
      .setFriction(0.8)
      .setCollisionGroups(groups(Groups.TERRAIN, 0xffff));
    this.terrainCollider = this.world.createCollider(desc);
    // Fine ruts and humps sit just above the pushed-down 1 m cells they replace, and
    // report the terrain's surface type like the heightfield does.
    for (const patch of terrain.detail) {
      const w = patchStride(patch);
      const vertices = new Float32Array(patch.heights.length * 3);
      patch.heights.forEach((y, k) =>
        vertices.set(
          [
            patch.ix0 - terrain.half + (k % w) / DETAIL_SUB,
            y,
            patch.iz0 - terrain.half + Math.floor(k / w) / DETAIL_SUB,
          ],
          k * 3,
        ),
      );
      const indices: number[] = [];
      patchTriangles(patch, (i, j) => indices.push(j * w + i));
      this.world.createCollider(
        this.R.ColliderDesc.trimesh(
          vertices,
          new Uint32Array(indices),
          this.R.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
          .setFriction(0.8)
          .setCollisionGroups(groups(Groups.TERRAIN, 0xffff)),
      );
    }
    return this.terrainCollider;
  }

  /** Invisible walls at ±halfExtent (SPEC §5 fallback). */
  addWalls(halfExtent: number, height = 2000): void {
    const t = 5;
    const L = halfExtent + t;
    const walls = [
      [halfExtent + t, 0, 0, t, height, L],
      [-halfExtent - t, 0, 0, t, height, L],
      [0, 0, halfExtent + t, L, height, t],
      [0, 0, -halfExtent - t, L, height, t],
    ];
    for (const [x, y, z, hx, hy, hz] of walls) {
      this.world.createCollider(
        this.R.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(x, y, z)
          .setFriction(0.1)
          .setCollisionGroups(groups(Groups.WALL, Groups.VEHICLE | Groups.DYNAMIC)),
      );
    }
  }

  addStaticBox(box: StaticBox, surface: SurfaceId, friction = 0.9): RAPIER.Collider {
    const q = boxQuat(box.yaw, box.roll ?? 0);
    const shape = box.bevel
      ? this.R.ColliderDesc.convexHull(rockShape(box.hx, box.hy, box.hz, box.bevel).vertices)!
      : this.R.ColliderDesc.cuboid(box.hx, box.hy, box.hz);
    const c = this.world.createCollider(
      shape
        .setTranslation(box.x, box.y, box.z)
        .setRotation(q)
        .setFriction(friction)
        .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
    );
    this.colliderSurface.set(c.handle, surface);
    return c;
  }

  /** A convex hull of exactly the drawn vertices: trail granite, or bridge timber. */
  addStaticRock(rock: StaticRock, friction = 0.9, surface: SurfaceId = SurfaceId.Rock): RAPIER.Collider {
    const c = this.world.createCollider(
      this.R.ColliderDesc.convexHull(rock.vertices)!
        .setTranslation(rock.x, rock.y, rock.z)
        .setFriction(friction)
        .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
    );
    this.colliderSurface.set(c.handle, surface);
    return c;
  }

  surfaceOfCollider(c: RAPIER.Collider | null, x: number, z: number): SurfaceId {
    if (!c) return this.ground.surfaceAt(x, z);
    if (this.terrainCollider && c.handle === this.terrainCollider.handle) return this.ground.surfaceAt(x, z);
    return this.colliderSurface.get(c.handle) ?? this.ground.surfaceAt(x, z);
  }

  step(eventQueue?: RAPIER.EventQueue): void {
    this.world.step(eventQueue);
  }

  free(): void {
    this.world.free();
  }
}

export function yawQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Yaw about +y, then roll about the rotated local z. */
export function boxQuat(yaw: number, roll: number): { x: number; y: number; z: number; w: number } {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  // q = qy * qz
  return { w: cy * cr, x: sy * sr, y: sy * cr, z: cy * sr };
}
