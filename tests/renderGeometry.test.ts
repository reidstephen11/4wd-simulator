import { describe, expect, it } from 'vitest';
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';
import { Terrain, GroundTint, NO_WATER } from '../src/sim/world/terrain';
import { TerrainMesh } from '../src/render/terrainMesh';
import { VehicleModel } from '../src/render/vehicleModel';
import { vehicleTuning } from '../src/data/vehicle';
import { createCondition } from '../src/sim/vehicle/condition';
import { makeScene } from './helpers/scenes';

function fixture(): Terrain {
  const size = 256,
    res = size + 1;
  const heights = new Float32Array(res * res);
  const tint = new Uint8Array(res * res);
  for (let z = 0; z < res; z++)
    for (let x = 0; x < res; x++) {
      heights[z * res + x] = Math.sin(x * 0.08) * 4 + Math.cos(z * 0.06) * 3;
      tint[z * res + x] = x < 128 ? GroundTint.DirtTrack : GroundTint.GrassDry;
    }
  return new Terrain(
    size,
    heights,
    new Uint8Array(res * res),
    tint,
    new Float32Array(res * res).fill(NO_WATER),
  );
}

function samples(geometry: BufferGeometry, x: number, z: number): number[][] {
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const c = geometry.getAttribute('color');
  const result: number[][] = [];
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) === x && p.getZ(i) === z) {
      result.push([p.getY(i), n.getX(i), n.getY(i), n.getZ(i), c.getX(i), c.getY(i), c.getZ(i)]);
    }
  }
  return result;
}

describe('graphics geometry regression', () => {
  it('keeps terrain shading continuous across chunk edges and LOD changes', () => {
    const terrain = fixture();
    const mesh = new TerrainMesh(terrain, 1);
    const fine = mesh.buildGeometry(120, 120, 8, 1);
    const coarse = mesh.buildGeometry(128, 120, 8, 2);
    const a = samples(fine, 0, -4)[0];
    const b = samples(coarse, 0, -4)[0];
    expect(a).toEqual(b);
    expect(a[0]).toBeCloseTo(terrain.heightAt(0, -4), 5);
    expect(Math.hypot(a[1], a[2], a[3])).toBeCloseTo(1, 5);
    // Every duplicate at a shared sample has the same normal and colour.
    for (const sample of samples(fine, 0, -4)) expect(sample.slice(1)).toEqual(a.slice(1));
    fine.dispose();
    coarse.dispose();
    mesh.dispose();
  });

  it('preserves the exact driving triangles under the smoother terrain shading', () => {
    const terrain = fixture();
    const mesh = new TerrainMesh(terrain, 1);
    const geometry = mesh.buildGeometry(120, 120, 8, 1);
    const p = geometry.getAttribute('position');
    // Surface triangles precede the skirts. Their barycentres must meet physics exactly.
    for (let i = 0; i < 8 * 8 * 6; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      expect(y).toBeCloseTo(terrain.heightAt(x, z), 5);
    }
    geometry.dispose();
    mesh.dispose();
  });

  it('keeps dirt and dents working after separating paint, trim and glass', () => {
    const model = new VehicleModel(vehicleTuning);
    const geometry = model.body.geometry;
    const index = geometry.getIndex()!;
    expect(geometry.groups.reduce((count, group) => count + group.count, 0)).toBe(index.count);
    expect(new Set(index.array).size).toBe(geometry.getAttribute('position').count);
    const colors = Float32Array.from(geometry.getAttribute('color').array);
    const positions = Float32Array.from(geometry.getAttribute('position').array);
    const condition = createCondition();
    condition.dirt = { front: 1, sides: 1, rear: 1, wheels: 1 };
    condition.dents.push({ x: 0.82, y: 0.3, z: 0, nx: -1, ny: 0, nz: 0, radius: 0.8, depth: 0.08 });
    model.applyCondition(condition);
    expect(geometry.getAttribute('color').array).not.toEqual(colors);
    expect(geometry.getAttribute('position').array).not.toEqual(positions);
    expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
  });

  it('leaves real clearance through each wheel opening and the inboard floor', () => {
    const model = new VehicleModel(vehicleTuning);
    const shell = new Mesh(model.body.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.updateMatrixWorld();
    for (const wheel of vehicleTuning.wheels) {
      const side = Math.sign(wheel.x);
      const ray = new Raycaster(new Vector3(side * 0.6, 0.25, wheel.z), new Vector3(side, 0, 0), 0, 0.36);
      expect(ray.intersectObject(shell)).toHaveLength(0);
    }
  });

  it('articulates the solid axles and hides only the boards that have been placed', () => {
    const model = new VehicleModel(vehicleTuning);
    model.suspension.update([0.11, -0.08, -0.04, 0.03]);
    expect(model.suspension.axles[0].position.y).toBeCloseTo(0.015);
    expect(model.suspension.axles[0].rotation.z).toBeLessThan(0);
    expect(model.suspension.axles[1].position.y).toBeCloseTo(-0.005);
    expect(model.suspension.axles[1].rotation.z).toBeGreaterThan(0);
    expect(model.suspension.axles.map((axle) => axle.position.z)).toEqual([-1.15, 1.15]);
    model.setPlanksOnRack(1);
    expect(model.rackPlanks.children.filter((plank) => plank.visible)).toHaveLength(1);
    model.setPlanksOnRack(0);
    expect(model.rackPlanks.visible).toBe(false);
    model.setPlanksOnRack(2);
    expect(model.rackPlanks.visible).toBe(true);
    expect(model.rackPlanks.children.filter((plank) => plank.visible)).toHaveLength(2);
  });

  it('updates the detailed model from real suspension, steering and brake input', async () => {
    const scene = await makeScene({ speed: 5 });
    const model = new VehicleModel(vehicleTuning);
    const lenses = model.body.material as MeshStandardMaterial[];
    model.update(scene.vehicle, 1, 1 / 60);
    const running = lenses[5].emissiveIntensity;
    scene.run(0.15, { brake: 1, steer: 0.5 });
    model.update(scene.vehicle, 1, 1 / 60);
    expect(lenses[5].emissiveIntensity).toBeGreaterThan(running);
    expect(Math.abs(model.wheels[0].pivot.rotation.y)).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) {
      expect(model.wheels[i].pivot.position.y).toBeCloseTo(
        vehicleTuning.wheels[i].y - scene.vehicle.wheels[i].suspension,
      );
    }
    const position = scene.vehicle.body.translation();
    expect(model.root.position.toArray()).toEqual([position.x, position.y, position.z]);
    expect(model.suspension.axles.every((axle) => axle.position.toArray().every(Number.isFinite))).toBe(true);
    scene.physics.world.free();
  });
});
