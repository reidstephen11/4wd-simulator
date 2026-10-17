import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshBuilder } from './lowpoly';

/** Dirt zones stay independent of the material on each part. */
export const BodyZone = { Front: 0, Sides: 1, Rear: 2, Roof: 3, Trim: 4, Glass: 5 } as const;
export const VehicleMaterial = {
  Paint: 0,
  Metal: 1,
  Glass: 2,
  Rubber: 3,
  Lamp: 4,
  Red: 5,
  Amber: 6,
  Fabric: 7,
} as const;
export type VehicleMaterialId = (typeof VehicleMaterial)[keyof typeof VehicleMaterial];

/** Vehicle-only builder: material batching and smooth normals on curved manufactured parts. */
export class VehicleBuilder extends MeshBuilder {
  slot: VehicleMaterialId = VehicleMaterial.Paint;
  private readonly slots: number[] = [];
  private readonly smoothNormals = new Map<number, THREE.Vector3>();

  constructor() {
    super(40);
    this.vary = false;
  }

  override tri(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, color: THREE.Color): this {
    this.slots.push(this.slot, this.slot, this.slot);
    return super.tri(a, b, c, color);
  }

  /** Consume a Three.js primitive, keeping its authored normals through the transform. */
  geometry(geometry: THREE.BufferGeometry, color: THREE.Color): this {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = source.getAttribute('position');
    const normals = source.getAttribute('normal');
    const colors = source.getAttribute('color');
    const slots = source.getAttribute('materialSlot');
    const previousSlot = this.slot;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.matrix);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      const start = this.vertexCount;
      if (slots) this.slot = slots.getX(i) as VehicleMaterialId;
      this.tri(
        a.fromBufferAttribute(positions, i),
        b.fromBufferAttribute(positions, i + 1),
        c.fromBufferAttribute(positions, i + 2),
        color,
      );
      if (colors)
        for (let k = 0; k < 3; k++) {
          const offset = (start + k) * 3;
          this.colors[offset] = colors.getX(i + k);
          this.colors[offset + 1] = colors.getY(i + k);
          this.colors[offset + 2] = colors.getZ(i + k);
        }
      if (normals)
        for (let k = 0; k < 3; k++) {
          this.smoothNormals.set(
            start + k,
            new THREE.Vector3().fromBufferAttribute(normals, i + k).applyNormalMatrix(normalMatrix),
          );
        }
    }
    this.slot = previousSlot;
    if (source !== geometry) source.dispose();
    geometry.dispose();
    return this;
  }

  block(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: THREE.Color,
    slot: VehicleMaterialId = VehicleMaterial.Paint,
    zone: number = BodyZone.Sides,
    radius = 0,
  ): this {
    this.slot = slot;
    this.tag = zone;
    this.push().translate(x, y, z);
    if (radius > 0)
      this.geometry(new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 2, h / 2, d / 2)), color);
    else this.box(w, h, d, color);
    this.pop();
    return this;
  }

  rod(
    from: THREE.Vector3Like,
    to: THREE.Vector3Like,
    radius: number,
    color: THREE.Color,
    slot: VehicleMaterialId = VehicleMaterial.Metal,
    zone: number = BodyZone.Trim,
  ): this {
    const a = new THREE.Vector3().copy(from),
      b = new THREE.Vector3().copy(to);
    const delta = b.clone().sub(a);
    const transform = new THREE.Matrix4().compose(
      a.add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()),
      new THREE.Vector3(1, 1, 1),
    );
    this.slot = slot;
    this.tag = zone;
    this.push(transform);
    this.geometry(new THREE.CylinderGeometry(radius, radius, delta.length(), 10), color);
    this.pop();
    return this;
  }

  ring(
    x: number,
    y: number,
    z: number,
    radius: number,
    tube: number,
    color: THREE.Color,
    slot: VehicleMaterialId = VehicleMaterial.Metal,
    axis: 'x' | 'y' | 'z' = 'z',
    zone: number = BodyZone.Trim,
  ): this {
    this.slot = slot;
    this.tag = zone;
    this.push()
      .translate(x, y, z)
      .rotate(axis === 'y' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0, 0);
    this.geometry(new THREE.TorusGeometry(radius, tube, 6, 32), color);
    this.pop();
    return this;
  }

  override build(withTags = true): THREE.BufferGeometry {
    const geometry = super.build(withTags);
    const normals = geometry.getAttribute('normal');
    for (const [i, n] of this.smoothNormals) normals.setXYZ(i, n.x, n.y, n.z);
    geometry.setAttribute('materialSlot', new THREE.Float32BufferAttribute(this.slots, 1));
    return geometry;
  }
}

/** One draw group per material; preserve vertex order for dirt and dent deformation. */
export function groupVehicleMaterials(geometry: THREE.BufferGeometry): void {
  const slots = geometry.getAttribute('materialSlot');
  const indices: number[] = [];
  geometry.clearGroups();
  for (let slot = 0; slot < Object.keys(VehicleMaterial).length; slot++) {
    const start = indices.length;
    for (let i = 0; i < slots.count; i += 3) if (slots.getX(i) === slot) indices.push(i, i + 1, i + 2);
    if (indices.length > start) geometry.addGroup(start, indices.length - start, slot);
  }
  geometry.setIndex(indices);
}
