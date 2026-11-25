import * as THREE from 'three';
import { MeshBuilder } from './lowpoly';
import { sweptTube } from './sweptTube';

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
  /** Headlamp and side-lamp lenses: they glow when the headlights are on. */
  Headlamp: 8,
  /** Driving lamps that come on with high beam (the Camel Trophy roof lamps). */
  DrivingLamp: 9,
  /** Dial markings: lit in their own colours with the headlights, like dash lights. */
  DialMarks: 10,
  /** Rear-facing mirror glazing; live reflections are attached only to the player's car. */
  Mirror: 11,
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
    const r = Math.min(radius, w / 2, h / 2, d / 2);
    // Rounding too small to see, or a part too small to show it, is a plain box (12 triangles).
    if (r >= 0.004 && Math.min(w, h, d) >= 0.02) this.geometry(chamferBox(w, h, d, r), color);
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
    this.geometry(new THREE.CylinderGeometry(radius, radius, delta.length(), rodSides(radius)), color);
    this.pop();
    return this;
  }

  /**
   * One smooth tube through the points, for a rib or a hoop that was a chain of rods:
   * `sides` quads a step, with no seams or end caps between the steps.
   */
  chain(
    points: THREE.Vector3Like[],
    radius: number,
    color: THREE.Color,
    slot: VehicleMaterialId = VehicleMaterial.Metal,
    zone: number = BodyZone.Trim,
  ): this {
    this.slot = slot;
    this.tag = zone;
    const path = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    this.geometry(sweptTube(path, radius, rodSides(radius)), color);
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
    // Sides by size: a thin ring is four-sided, a small one has 12 steps round, a wheel rim 32.
    const round = THREE.MathUtils.clamp(Math.round((2 * Math.PI * radius) / 0.035), 12, 32);
    this.geometry(new THREE.TorusGeometry(radius, tube, tube < 0.008 ? 4 : 6, round), color);
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

/**
 * A box with its edges rounded over `r`, drawn as chamfers shaded like fillets: 44 triangles
 * (6 faces, 12 edge strips, 8 corner triangles) where RoundedBoxGeometry at one segment
 * needs 108. Each vertex keeps its face's normal, so the shading grades round the edge.
 */
export function chamferBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const c = r * 0.75;
  const positions: number[] = [],
    normals: number[] = [];
  // Vertex `axis` of corner (sx, sy, sz): on that axis's face, pulled in by c on the other two.
  const vertex = (s: number[], axis: number): [number[], number[]] => {
    const p = s.map((sign, k) => sign * (k === axis ? half[k] : half[k] - c));
    const n = [0, 0, 0];
    n[axis] = s[axis];
    return [p, n];
  };
  const tri = (a: [number[], number[]], b: [number[], number[]], cc: [number[], number[]]) => {
    // Wind each triangle outwards: its geometric normal must follow its vertex normals.
    const u = b[0].map((x, k) => x - a[0][k]),
      v = cc[0].map((x, k) => x - a[0][k]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const sum = a[1].map((x, k) => x + b[1][k] + cc[1][k]);
    const order = cross[0] * sum[0] + cross[1] * sum[1] + cross[2] * sum[2] < 0 ? [a, cc, b] : [a, b, cc];
    for (const [p, n] of order) {
      positions.push(...p);
      normals.push(...n);
    }
  };
  const quad = (
    a: [number[], number[]],
    b: [number[], number[]],
    cc: [number[], number[]],
    dd: [number[], number[]],
  ) => {
    tri(a, b, cc);
    tri(a, cc, dd);
  };
  const signs = [-1, 1];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      vv = (axis + 2) % 3;
    for (const sa of signs) {
      // The face: its four corners' vertices on this axis.
      const corner = (su: number, sv: number) => {
        const s = [0, 0, 0];
        s[axis] = sa;
        s[u] = su;
        s[vv] = sv;
        return s;
      };
      quad(
        vertex(corner(-1, -1), axis),
        vertex(corner(1, -1), axis),
        vertex(corner(1, 1), axis),
        vertex(corner(-1, 1), axis),
      );
      // The edge strips between this face and the two faces on axis `u` (one per sign).
      for (const su of signs)
        quad(
          vertex(corner(su, -1), axis),
          vertex(corner(su, 1), axis),
          vertex(corner(su, 1), u),
          vertex(corner(su, -1), u),
        );
    }
  }
  for (const sx of signs)
    for (const sy of signs)
      for (const sz of signs) {
        const s = [sx, sy, sz];
        tri(vertex(s, 0), vertex(s, 1), vertex(s, 2));
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

/** Sides for a rod or chain of the given radius: six up to 8 mm, eight up to 20 mm, ten above. */
function rodSides(radius: number): number {
  return radius <= 0.008 ? 6 : radius <= 0.02 ? 8 : 10;
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
