import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { ghostPoseAt, type GhostPose, type GhostTrace } from '../sim/ghost';
import { patchFog } from './fog';
import { VehicleModel } from './vehicleModel';

/**
 * The best run's car (src/sim/ghost.ts), drawn as a pale see-through copy that follows its
 * recorded path. It has no physics: nothing can hit it and it can't get in the way.
 */
export class GhostView {
  readonly model: VehicleModel;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly pose: GhostPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, suspension: 0 };

  constructor(
    private readonly trace: GhostTrace,
    private readonly tuning: VehicleTuning,
  ) {
    this.model = new VehicleModel(tuning);
    this.model.root.name = 'ghost';
    this.material = patchFog(
      // Lit, so its shape shows; a faint glow keeps it in sight at dusk and at night.
      new THREE.MeshLambertMaterial({
        color: '#CFE4F2',
        emissive: '#34485A',
        transparent: true,
        opacity: 0.42,
      }),
      'ghost',
    );
    // One pale material for every part; the depth pass keeps only the outer skin showing.
    const own = new Set<THREE.Material>();
    this.model.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) own.add(m);
      o.material = this.material;
      o.castShadow = false;
      o.receiveShadow = false;
    });
    for (const m of own) m.dispose();
  }

  /** Put the ghost where it was `t` seconds into its run. */
  update(t: number): void {
    const p = ghostPoseAt(this.trace, t, this.pose);
    this.model.root.position.set(p.x, p.y, p.z);
    this.model.root.quaternion.set(p.qx, p.qy, p.qz, p.qw);
    const w = this.tuning.wheels;
    this.model.poseWheels(w.map((wheel) => wheel.y - p.suspension));
  }

  set visible(on: boolean) {
    this.model.root.visible = on;
  }

  dispose(): void {
    this.model.dispose();
  }
}
