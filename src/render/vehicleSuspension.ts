import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone, VehicleBuilder, VehicleMaterial as M, groupVehicleMaterials } from './vehicleGeometry';

/** Visible solid axles and telescoping dampers follow the four simulated wheel hubs. */
export class VehicleSuspension {
  readonly group = new THREE.Group();
  readonly axles: THREE.Mesh[] = [];
  private readonly layouts: { left: number; right: number; z: number }[] = [];
  private readonly shocks: THREE.Mesh[] = [];
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly tuning: VehicleTuning,
    materials: THREE.Material[],
  ) {
    const steel = new THREE.Color('#6D756D'),
      dark = new THREE.Color('#343C36');
    const axle = new VehicleBuilder();
    axle.rod({ x: -0.73, y: 0, z: 0 }, { x: 0.73, y: 0, z: 0 }, 0.052, dark);
    axle.slot = M.Metal;
    axle.tag = BodyZone.Trim;
    axle.push().translate(0.08, 0, 0).scale(1, 0.8, 1);
    axle.geometry(new THREE.SphereGeometry(0.13, 16, 10), dark);
    axle.pop();
    axle.ring(0.08, 0, 0.09, 0.092, 0.008, steel);
    for (const side of [-1, 1]) {
      for (let leaf = 0; leaf < 4; leaf++) {
        const length = 0.92 - leaf * 0.13;
        for (let k = 0; k < 7; k++) {
          const za = (k / 7 - 0.5) * length,
            zb = ((k + 1) / 7 - 0.5) * length;
          const ya = 0.035 + za * za * 0.35 - leaf * 0.012,
            yb = 0.035 + zb * zb * 0.35 - leaf * 0.012;
          axle.block(
            side * 0.48,
            (ya + yb) / 2,
            (za + zb) / 2,
            0.065,
            0.009,
            length / 7 + 0.004,
            dark,
            M.Metal,
            BodyZone.Trim,
          );
        }
      }
      for (const dz of [-0.075, 0.075])
        axle.rod(
          { x: side * 0.48 - 0.045, y: 0.09, z: dz },
          { x: side * 0.48 - 0.045, y: -0.065, z: dz },
          0.007,
          steel,
        );
    }
    const axleGeometry = axle.build();
    groupVehicleMaterials(axleGeometry);
    for (const front of [true, false]) {
      const indices = tuning.wheels.map((w, i) => ({ w, i })).filter(({ w }) => w.front === front);
      const left = indices.find(({ w }) => w.x < 0)!,
        right = indices.find(({ w }) => w.x > 0)!;
      this.layouts.push({ left: left.i, right: right.i, z: left.w.z });
      const mesh = new THREE.Mesh(axleGeometry, materials);
      mesh.name = front ? 'front-solid-axle' : 'rear-solid-axle';
      mesh.castShadow = true;
      this.axles.push(mesh);
      this.group.add(mesh);
    }
    const damper = new VehicleBuilder();
    damper.rod({ x: 0, y: -0.5, z: 0 }, { x: 0, y: 0.16, z: 0 }, 0.012, steel);
    damper.rod({ x: 0, y: -0.05, z: 0 }, { x: 0, y: 0.5, z: 0 }, 0.026, new THREE.Color('#B59B4D'), M.Paint);
    const geometry = damper.build();
    groupVehicleMaterials(geometry);
    for (let i = 0; i < tuning.wheels.length; i++) {
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = `damper-${i}`;
      this.shocks.push(mesh);
      this.group.add(mesh);
    }
  }

  update(wheelHeights: readonly number[]): void {
    for (let i = 0; i < this.layouts.length; i++) {
      const layout = this.layouts[i];
      const left = wheelHeights[layout.left],
        right = wheelHeights[layout.right];
      const span = this.tuning.wheels[layout.right].x - this.tuning.wheels[layout.left].x;
      this.axles[i].position.set(0, (left + right) / 2, layout.z);
      this.axles[i].rotation.z = Math.atan2(right - left, span);
    }
    for (let i = 0; i < this.shocks.length; i++) {
      const wheel = this.tuning.wheels[i],
        side = Math.sign(wheel.x);
      this.from.set(side * 0.54, 0.34, wheel.z + 0.23);
      this.to.set(side * 0.63, wheelHeights[i] + 0.045, wheel.z + 0.05);
      this.delta.copy(this.to).sub(this.from);
      const mesh = this.shocks[i];
      mesh.position.copy(this.from).add(this.to).multiplyScalar(0.5);
      mesh.scale.set(1, this.delta.length(), 1);
      mesh.quaternion.setFromUnitVectors(this.up, this.delta.normalize());
    }
  }
}
