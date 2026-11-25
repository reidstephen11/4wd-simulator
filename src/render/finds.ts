import * as THREE from 'three';
import type { World } from '../sim/world/world';
import type { FindDef } from '../sim/world/mapTypes';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';

/** A jerry can: a red steel can with its three-bar handle, standing upright. */
function jerryCan(b: MeshBuilder): void {
  const red = new THREE.Color('#9E2B22');
  b.push().translate(0, 0.24, 0);
  b.box(0.17, 0.46, 0.35, red);
  b.pop();
  for (const z of [-0.08, 0, 0.08]) {
    b.push().translate(0, 0.5, z);
    b.box(0.04, 0.06, 0.03, red.clone().multiplyScalar(0.8));
    b.pop();
  }
  b.push().translate(0, 0.5, -0.13);
  b.cylinder(0.025, 0.025, 0.06, 6, pal('vehicleTrim'));
  b.pop();
}

/** A tin of tyre plugs: a small yellow-lidded box. */
function plugTin(b: MeshBuilder): void {
  b.push().translate(0, 0.05, 0);
  b.box(0.22, 0.1, 0.14, new THREE.Color('#3E4A55'));
  b.pop();
  b.push().translate(0, 0.11, 0);
  b.box(0.23, 0.02, 0.15, new THREE.Color('#D2A62A'));
  b.pop();
}

/** A spare wheel and tyre lying flat. */
function spareWheel(b: MeshBuilder): void {
  b.push().translate(0, 0.12, 0);
  b.cylinder(0.38, 0.38, 0.24, 14, new THREE.Color('#1F1F1F'));
  b.pop();
  b.push().translate(0, 0.125, 0);
  b.cylinder(0.22, 0.22, 0.245, 10, new THREE.Color('#B9B9B4'));
  b.pop();
}

/**
 * What's waiting at each find: a timber crate by the track with the jerry can or tin on
 * it, so it can be seen as you pull up. The crate stays; the load goes when it's taken.
 */
export class FindMarkers {
  readonly group = new THREE.Group();
  private readonly loads = new Map<string, THREE.Mesh>();

  constructor(world: World) {
    this.group.name = 'finds';
    const material = patchFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const crates = new MeshBuilder(77);
    for (const f of world.map.finds ?? []) {
      const y = world.terrain.heightAt(f.x, f.z);
      crates.push().translate(f.x, y + 0.3, f.z);
      crates.box(0.8, 0.6, 0.6, pal('barkOchre').clone().multiplyScalar(0.75));
      crates.pop();
      const b = new MeshBuilder(78);
      b.push().translate(f.x, y + 0.6, f.z);
      (f.gives.jerryCans ? jerryCan : f.gives.spares ? spareWheel : plugTin)(b);
      b.pop();
      const mesh = new THREE.Mesh(b.build(), material);
      mesh.castShadow = true;
      this.loads.set(f.id, mesh);
      this.group.add(mesh);
    }
    const crateMesh = new THREE.Mesh(crates.build(), material);
    crateMesh.castShadow = crateMesh.receiveShadow = true;
    this.group.add(crateMesh);
  }

  /** Hide the loads that have been taken. */
  show(defs: readonly FindDef[], taken: ReadonlySet<string>): void {
    for (const f of defs) {
      const m = this.loads.get(f.id);
      if (m) m.visible = !taken.has(f.id);
    }
  }
}
