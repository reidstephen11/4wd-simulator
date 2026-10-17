import * as THREE from 'three';
import { mulberry32 } from '../sim/world/rng';
import { varyColor } from './colors';

/**
 * Builds flat-shaded, vertex-coloured, non-indexed geometry from simple shapes, with
 * the per-face colour variation from SPEC §4. Shapes are placed with a transform stack.
 */
export class MeshBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  /** Negative UVs identify solid geometry; foliage cards use the 0..1 texture square. */
  readonly uvs: number[] = [];
  /** Optional per-vertex tag (e.g. body zone for dirt). */
  readonly tags: number[] = [];
  private readonly stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private readonly rand: () => number;
  private readonly tmpC = new THREE.Color();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vc = new THREE.Vector3();
  tag = 0;
  /** Set to false to skip colour variation. */
  vary = true;

  constructor(seed = 1) {
    this.rand = mulberry32(seed);
  }

  get matrix(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  push(m?: THREE.Matrix4): this {
    const next = this.matrix.clone();
    if (m) next.multiply(m);
    this.stack.push(next);
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  translate(x: number, y: number, z: number): this {
    this.matrix.multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    return this;
  }

  rotate(x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): this {
    this.matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, order)));
    return this;
  }

  scale(x: number, y: number, z: number): this {
    this.matrix.multiply(new THREE.Matrix4().makeScale(x, y, z));
    return this;
  }

  tri(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, color: THREE.Color): this {
    const m = this.matrix;
    const pa = this.va.set(a.x, a.y, a.z).applyMatrix4(m);
    const pb = this.vb.set(b.x, b.y, b.z).applyMatrix4(m);
    const pc = this.vc.set(c.x, c.y, c.z).applyMatrix4(m);
    this.positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
    this.uvs.push(-1, -1, -1, -1, -1, -1);
    const col = this.vary ? varyColor(color, this.rand(), this.rand(), this.tmpC) : color;
    for (let k = 0; k < 3; k++) {
      this.colors.push(col.r, col.g, col.b);
      this.tags.push(this.tag);
    }
    return this;
  }

  quad(
    a: THREE.Vector3Like,
    b: THREE.Vector3Like,
    c: THREE.Vector3Like,
    d: THREE.Vector3Like,
    color: THREE.Color,
  ): this {
    this.tri(a, b, c, color);
    return this.tri(a, c, d, color);
  }

  /** A textured branch cluster, transformed like the other builder shapes. */
  foliageCard(width: number, height: number, color: THREE.Color): this {
    const start = this.uvs.length;
    this.quad(
      { x: -width / 2, y: -height / 2, z: 0 },
      { x: width / 2, y: -height / 2, z: 0 },
      { x: width / 2, y: height / 2, z: 0 },
      { x: -width / 2, y: height / 2, z: 0 },
      color,
    );
    this.uvs.splice(start, 12, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    return this;
  }

  /** Axis-aligned box centred on the current origin, optionally subdivided (for dents). */
  box(
    w: number,
    h: number,
    d: number,
    color: THREE.Color,
    segments: [number, number, number] = [1, 1, 1],
  ): this {
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const [sx, sy, sz] = segments;
    const face = (
      origin: [number, number, number],
      u: [number, number, number],
      v: [number, number, number],
      nu: number,
      nv: number,
    ) => {
      for (let i = 0; i < nu; i++)
        for (let j = 0; j < nv; j++) {
          const p = (a: number, b: number) => ({
            x: origin[0] + u[0] * (a / nu) + v[0] * (b / nv),
            y: origin[1] + u[1] * (a / nu) + v[1] * (b / nv),
            z: origin[2] + u[2] * (a / nu) + v[2] * (b / nv),
          });
          this.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), color);
        }
    };
    // +x
    face([hx, -hy, hz], [0, 0, -d], [0, h, 0], sz, sy);
    // -x
    face([-hx, -hy, -hz], [0, 0, d], [0, h, 0], sz, sy);
    // +y
    face([-hx, hy, hz], [w, 0, 0], [0, 0, -d], sx, sz);
    // -y
    face([-hx, -hy, -hz], [w, 0, 0], [0, 0, d], sx, sz);
    // +z
    face([-hx, -hy, hz], [w, 0, 0], [0, h, 0], sx, sy);
    // -z
    face([hx, -hy, -hz], [-w, 0, 0], [0, h, 0], sx, sy);
    return this;
  }

  /** Cylinder along +y (centred), `segments` sides. */
  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    segments: number,
    color: THREE.Color,
    caps = true,
    capColor?: THREE.Color,
  ): this {
    const hy = h / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const b0 = { x: Math.cos(a0) * rBottom, y: -hy, z: Math.sin(a0) * rBottom };
      const b1 = { x: Math.cos(a1) * rBottom, y: -hy, z: Math.sin(a1) * rBottom };
      const t0 = { x: Math.cos(a0) * rTop, y: hy, z: Math.sin(a0) * rTop };
      const t1 = { x: Math.cos(a1) * rTop, y: hy, z: Math.sin(a1) * rTop };
      this.quad(b0, t0, t1, b1, color);
      if (caps) {
        const cc = capColor ?? color;
        if (rTop > 0) this.tri({ x: 0, y: hy, z: 0 }, t1, t0, cc);
        if (rBottom > 0) this.tri({ x: 0, y: -hy, z: 0 }, b0, b1, cc);
      }
    }
    return this;
  }

  /** Faceted blob: an icosahedron with jittered vertices (rocks, canopy clumps). */
  blob(radius: number, color: THREE.Color, jitter = 0.25, detail = 0, squash = 1): this {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.getAttribute('position');
    // Jitter shared vertices consistently.
    const keyed = new Map<string, THREE.Vector3>();
    const v = new THREE.Vector3();
    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
      let j = keyed.get(key);
      if (!j) {
        const s = 1 + (this.rand() - 0.5) * 2 * jitter;
        j = v.clone().multiplyScalar(s);
        j.y *= squash;
        keyed.set(key, j);
      }
      verts.push(j);
    }
    for (let i = 0; i < verts.length; i += 3) this.tri(verts[i], verts[i + 1], verts[i + 2], color);
    geo.dispose();
    return this;
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  build(withTags = false): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (withTags) geo.setAttribute('tag', new THREE.Float32BufferAttribute(this.tags, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}
