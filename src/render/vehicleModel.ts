import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { slerp } from '../sim/vehicle/math';
import type { VehicleCondition } from '../sim/vehicle/condition';
import { hash2 } from '../sim/world/rng';
import { pal } from './colors';
import { patchFog } from './fog';
import { BodyZone, groupVehicleMaterials } from './vehicleGeometry';
import { vehicleLooks } from './vehicleLooks';
import { vehicles } from '../data/vehicles';
import { VehicleSuspension } from './vehicleSuspension';
import { VehicleInstruments } from './vehicleInstruments';
import { HeadlightBeams } from './headlights';
import { headlightTuning } from '../data/headlights';
export { BodyZone } from './vehicleGeometry';

/** A detailed vehicle (its look picked by the tuning's id), driven by the simulation. */
export class VehicleModel {
  readonly root = new THREE.Group();
  readonly bodyGroup = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly rackPlanks = new THREE.Group();
  readonly wheels: { pivot: THREE.Group; spin: THREE.Group }[] = [];
  readonly bodyMaterial: THREE.MeshPhysicalMaterial;
  readonly suspension: VehicleSuspension;
  readonly instruments: VehicleInstruments;
  private readonly rearLampMaterial: THREE.MeshStandardMaterial;
  private readonly headLampMaterial: THREE.MeshStandardMaterial;
  /** Needles, plates and small lenses: they light up with the headlights. */
  private readonly panelMaterial: THREE.MeshStandardMaterial;
  private readonly roofLampMaterial: THREE.MeshStandardMaterial;
  /** The lamps' light on the ground, at dusk and night only. */
  readonly beams: HeadlightBeams | null;
  private readonly glass: THREE.MeshPhysicalMaterial;
  private readonly tmpQ = { x: 0, y: 0, z: 0, w: 1 };
  private readonly wheelGeo: THREE.BufferGeometry;
  private readonly basePos: Float32Array;
  private readonly baseCol: Float32Array;
  private readonly baseNormals: Float32Array;
  private readonly wheelBaseCol: Float32Array;
  private readonly dirtWeight: Float32Array;
  private lastDirtKey = '';
  private lastDentKey = '';
  private readonly spinExtra = [0, 0, 0, 0];

  /** `beams`: it's dark enough for the headlights to light the ground (dusk and night). */
  constructor(
    private readonly tuning: VehicleTuning,
    beams = false,
  ) {
    const look = vehicleLooks[tuning.id];
    this.root.name = look.name;
    this.bodyMaterial = patchFog(new THREE.MeshPhysicalMaterial({ vertexColors: true, ...look.paint }));
    const glass = patchFog(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.09,
        metalness: 0.16,
        clearcoat: 1,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    glass.forceSinglePass = true;
    this.glass = glass;
    this.rearLampMaterial = patchFog(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.25,
        emissive: '#AB291A',
        emissiveIntensity: 0.13,
      }),
    );
    const lampLens = () =>
      patchFog(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.2,
          metalness: 0.08,
          emissive: '#D9CE9F',
          emissiveIntensity: headlightTuning.lensGlow.off,
        }),
      );
    this.headLampMaterial = lampLens();
    this.roofLampMaterial = lampLens();
    this.panelMaterial = lampLens();
    const materials: THREE.Material[] = [
      this.bodyMaterial,
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.72 })),
      glass,
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 })),
      this.panelMaterial,
      this.rearLampMaterial,
      patchFog(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.28,
          emissive: '#B76E19',
          emissiveIntensity: 0.1,
        }),
      ),
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })),
      this.headLampMaterial,
      this.roofLampMaterial,
    ];
    this.wheelGeo = look.wheel(tuning);
    const geometry = look.body(tuning, this.wheelGeo);
    groupVehicleMaterials(geometry);
    this.body = new THREE.Mesh(geometry, materials);
    this.body.name = 'body-cabin-and-equipment';
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.bodyGroup.add(this.body);
    this.root.add(this.bodyGroup);
    geometry.computeBoundingBox();
    this.beams = beams ? new HeadlightBeams(look.lamps, geometry.boundingBox!.min.z) : null;
    if (this.beams) this.bodyGroup.add(this.beams.group);
    this.basePos = Float32Array.from(geometry.getAttribute('position').array);
    this.baseCol = Float32Array.from(geometry.getAttribute('color').array);
    this.baseNormals = Float32Array.from(geometry.getAttribute('normal').array);
    this.dirtWeight = new Float32Array(this.basePos.length / 3);
    for (let i = 0; i < this.dirtWeight.length; i++) {
      const y = this.basePos[i * 3 + 1];
      const patch = hash2(Math.floor(this.basePos[i * 3] * 4), Math.floor(this.basePos[i * 3 + 2] * 4), 5);
      this.dirtWeight[i] = Math.min(1, Math.max(0.1, 1.15 - (y + 0.1) / 1.4) * (0.65 + 0.5 * patch));
    }
    for (let i = 0; i < 2; i++) {
      const plank = look.plank(i);
      groupVehicleMaterials(plank);
      const mesh = new THREE.Mesh(plank, materials);
      mesh.castShadow = true;
      this.rackPlanks.add(mesh);
    }
    this.bodyGroup.add(this.rackPlanks);
    this.instruments = new VehicleInstruments(tuning, vehicles[tuning.id].cabin, materials);
    this.bodyGroup.add(this.instruments.group);
    groupVehicleMaterials(this.wheelGeo);
    this.wheelBaseCol = Float32Array.from(this.wheelGeo.getAttribute('color').array);
    for (const wheel of tuning.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(wheel.x, 0, wheel.z);
      const spin = new THREE.Group();
      const mesh = new THREE.Mesh(this.wheelGeo, materials);
      mesh.castShadow = true;
      spin.add(mesh);
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ pivot, spin });
    }
    this.suspension = new VehicleSuspension(tuning, materials, look.springs);
    this.suspension.update([0, 0, 0, 0]);
    this.root.add(this.suspension.group);
  }

  /** Blend in dirt and push in dents from the vehicle's condition (cheap when unchanged). */
  applyCondition(c: VehicleCondition): void {
    const d = c.dirt;
    const dirtKey = [d.front, d.sides, d.rear, d.wheels, c.mudShare].map((x) => Math.round(x * 50)).join(',');
    if (dirtKey !== this.lastDirtKey) {
      this.lastDirtKey = dirtKey;
      const dirtCol = pal('dirtTrack').clone().lerp(pal('mud'), c.mudShare);
      const col = this.body.geometry.getAttribute('color') as THREE.BufferAttribute;
      const tags = this.body.geometry.getAttribute('tag') as THREE.BufferAttribute;
      const arr = col.array as Float32Array;
      const avg = (d.front + d.sides + d.rear) / 3;
      for (let i = 0; i < col.count; i++) {
        const tag = tags.getX(i);
        const level =
          tag === BodyZone.Front
            ? d.front
            : tag === BodyZone.Rear
              ? d.rear
              : tag === BodyZone.Roof
                ? d.sides * 0.25
                : tag === BodyZone.Glass
                  ? avg * 0.45
                  : tag === BodyZone.Trim
                    ? avg * 0.8
                    : d.sides;
        const k = Math.min(0.85, level * this.dirtWeight[i]);
        arr[i * 3] = this.baseCol[i * 3] + (dirtCol.r - this.baseCol[i * 3]) * k;
        arr[i * 3 + 1] = this.baseCol[i * 3 + 1] + (dirtCol.g - this.baseCol[i * 3 + 1]) * k;
        arr[i * 3 + 2] = this.baseCol[i * 3 + 2] + (dirtCol.b - this.baseCol[i * 3 + 2]) * k;
      }
      col.needsUpdate = true;
      const wcol = this.wheelGeo.getAttribute('color') as THREE.BufferAttribute;
      const warr = wcol.array as Float32Array;
      const kw = Math.min(0.8, d.wheels * 0.8);
      for (let i = 0; i < warr.length; i += 3) {
        warr[i] = this.wheelBaseCol[i] + (dirtCol.r - this.wheelBaseCol[i]) * kw;
        warr[i + 1] = this.wheelBaseCol[i + 1] + (dirtCol.g - this.wheelBaseCol[i + 1]) * kw;
        warr[i + 2] = this.wheelBaseCol[i + 2] + (dirtCol.b - this.wheelBaseCol[i + 2]) * kw;
      }
      wcol.needsUpdate = true;
    }
    const dentKey = c.dents.map((x) => `${x.x.toFixed(2)}${x.z.toFixed(2)}${x.depth.toFixed(3)}`).join('|');
    if (dentKey !== this.lastDentKey) {
      this.lastDentKey = dentKey;
      const pos = this.body.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      arr.set(this.basePos);
      for (const dent of c.dents) {
        const r2 = dent.radius * dent.radius;
        for (let i = 0; i < arr.length; i += 3) {
          const dx = this.basePos[i] - dent.x;
          const dy = this.basePos[i + 1] - dent.y;
          const dz = this.basePos[i + 2] - dent.z;
          const q = (dx * dx + dy * dy + dz * dz) / r2;
          if (q >= 1) continue;
          const f = dent.depth * (1 - q) * (1 - q);
          arr[i] += dent.nx * f;
          arr[i + 1] += dent.ny * f;
          arr[i + 2] += dent.nz * f;
        }
      }
      pos.needsUpdate = true;
      this.body.geometry.computeVertexNormals();
      const normals = this.body.geometry.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const j = i * 3;
        if (
          arr[j] === this.basePos[j] &&
          arr[j + 1] === this.basePos[j + 1] &&
          arr[j + 2] === this.basePos[j + 2]
        ) {
          normals.setXYZ(i, this.baseNormals[j], this.baseNormals[j + 1], this.baseNormals[j + 2]);
        }
      }
      normals.needsUpdate = true;
    }
  }

  /** Free the GPU buffers and materials (when swapping to another vehicle). */
  dispose(): void {
    const materials = new Set<THREE.Material>();
    this.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    for (const m of materials) m.dispose();
  }

  /** From the driver's seat the tinted glass would fill the view; leave the windows clear. */
  setCockpitView(on: boolean): void {
    this.glass.visible = !on;
  }

  /** Each carried board and its straps disappear when that board is placed. */
  setPlanksOnRack(count: number): void {
    this.rackPlanks.visible = count > 0;
    this.rackPlanks.children.forEach((plank, index) => {
      plank.visible = index < count;
    });
  }

  update(v: Vehicle, alpha: number, dt: number): void {
    const p0 = v.prevPosition;
    const p1 = v.body.translation();
    this.root.position.set(
      p0.x + (p1.x - p0.x) * alpha,
      p0.y + (p1.y - p0.y) * alpha,
      p0.z + (p1.z - p0.z) * alpha,
    );
    const q = slerp(v.prevRotation, v.body.rotation(), alpha, this.tmpQ);
    this.root.quaternion.set(q.x, q.y, q.z, q.w);
    const t = this.tuning;
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i];
      const ww = this.wheels[i];
      ww.pivot.position.y = t.wheels[i].y - w.suspension + w.sink * 0.0;
      ww.pivot.rotation.y = -w.steer;
      // Extra spin when the wheel is spinning beyond grip.
      this.spinExtra[i] +=
        w.spin * dt * 25 * Math.sign(v.throttle > 0 ? (v.drivetrain.gear < 0 ? -1 : 1) : 0);
      ww.spin.rotation.x = -(w.rotation + this.spinExtra[i]);
    }
    this.suspension.update(this.wheels.map((w) => w.pivot.position.y));
    this.instruments.update(v, dt);
    const H = headlightTuning;
    const lit = v.lights !== 'off';
    const braking = v.brake > 0.1;
    this.rearLampMaterial.emissiveIntensity = braking
      ? lit
        ? H.tailGlow.brakeWithLights
        : H.tailGlow.brake
      : lit
        ? H.tailGlow.on
        : H.tailGlow.off;
    this.headLampMaterial.emissiveIntensity = H.lensGlow[v.lights];
    this.panelMaterial.emissiveIntensity = lit ? H.panelGlow.on : H.panelGlow.off;
    this.roofLampMaterial.emissiveIntensity = v.lights === 'high' ? H.roofLensGlow.on : H.roofLensGlow.off;
    this.beams?.set(v.lights);
  }
}
