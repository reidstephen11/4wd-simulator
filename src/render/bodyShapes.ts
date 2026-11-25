import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/** Shared shape helpers for the vehicle bodies: rounded outlines, extrusions and flat panes. */
const well = new THREE.Color('#25282A');

export type Vtx = [number, number, number?];

/** Closed outline through the vertices, each corner rounded off over `r` along its edges. */
export function rounded(verts: Vtx[], seg = 6): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = verts[i];
    if (!r) {
      out.push(new THREE.Vector2(x, y));
      continue;
    }
    const [px, py] = verts[(i + n - 1) % n],
      [nx, ny] = verts[(i + 1) % n];
    const l0 = Math.hypot(px - x, py - y),
      l1 = Math.hypot(nx - x, ny - y);
    const d0 = Math.min(r, l0 / 2),
      d1 = Math.min(r, l1 / 2);
    const ax = x + ((px - x) * d0) / l0,
      ay = y + ((py - y) * d0) / l0,
      cx = x + ((nx - x) * d1) / l1,
      cy = y + ((ny - y) * d1) / l1;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg,
        u = 1 - t;
      out.push(
        new THREE.Vector2(u * u * ax + 2 * u * t * x + t * t * cx, u * u * ay + 2 * u * t * y + t * t * cy),
      );
    }
  }
  return out;
}

/**
 * A lens or housing wrapped round a front corner rounded by extrudeX's bevel: part of an
 * elliptic cylinder round the corner's centre (cx, cz) with half-axes rx across and rz
 * along the car, from `from` (0, facing forward) to `to` (1, facing the side).
 */
export function cornerWrap(
  b: VehicleBuilder,
  side: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  y: number,
  h: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  from = 0,
  to = 1,
): void {
  const len = ((to - from) * Math.PI) / 2;
  const start = side > 0 ? Math.PI - (to * Math.PI) / 2 : Math.PI + (from * Math.PI) / 2;
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push().translate(cx, y, cz).scale(rx, 1, rz);
  b.geometry(new THREE.CylinderGeometry(1, 1, h, 10, 1, true, start, len), color);
  b.pop();
}

/** Same outline pushed in (d > 0) or out by d, for a convex polygon. */
export function inset(verts: Vtx[], d: number): Vtx[] {
  const n = verts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = verts[i],
      [x1, y1] = verts[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  const s = area > 0 ? 1 : -1;
  const lines = verts.map(([x0, y0], i) => {
    const [x1, y1] = verts[(i + 1) % n];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const nx = (-(y1 - y0) / l) * s,
      ny = ((x1 - x0) / l) * s;
    return { x: x0 + nx * d, y: y0 + ny * d, dx: x1 - x0, dy: y1 - y0 };
  });
  return verts.map((v, i) => {
    const a = lines[(i + n - 1) % n],
      b = lines[i];
    const den = a.dx * b.dy - a.dy * b.dx;
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / den;
    return [a.x + a.dx * t, a.y + a.dy * t, Math.max(0, (v[2] ?? 0) - d * 0.6)];
  });
}

/** A side-view shape: outline and holes given as (z, y) vertices. */
export function sideShape(outline: Vtx[], holes: Vtx[][] = []): THREE.Shape {
  const flip = (p: THREE.Vector2) => new THREE.Vector2(-p.x, p.y);
  const s = new THREE.Shape(rounded(outline).map(flip));
  for (const h of holes) s.holes.push(new THREE.Path(rounded(h).map(flip)));
  return s;
}

/**
 * Creased normals for an extrusion, with its flat end caps kept flat: creasing alone lets
 * the bevel bend the normals at a cap's edge, which shades a flat panel unevenly.
 */
function capNormals(raw: THREE.ExtrudeGeometry): THREE.BufferGeometry {
  const g = toCreasedNormals(raw, Math.PI / 5);
  const caps = new Map<string, number>();
  const rp = raw.getAttribute('position'),
    rn = raw.getAttribute('normal');
  const key = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((n) => n.toFixed(6)).join(',');
  for (let i = 0; i < rp.count; i++)
    if (Math.abs(rn.getZ(i)) > 0.9999) caps.set(key(rp, i), Math.sign(rn.getZ(i)));
  const gp = g.getAttribute('position'),
    gn = g.getAttribute('normal');
  for (let i = 0; i < gp.count; i++) {
    const sign = caps.get(key(gp, i));
    if (sign && gn.getZ(i) * sign > 0.5) gn.setXYZ(i, 0, 0, sign);
  }
  raw.dispose();
  return g;
}

/**
 * Extrude a side-view shape across the car from x0 to x1 with rounded edges that keep the
 * outline: each edge rounds over `bevel` across the car and `bevel * ratio` within the
 * outline. Walls facing a wheel opening (centres in `wells`, as z, y) are painted dark.
 * `reshape`, if given, reshapes the panel once it faces across the car, before it is moved
 * out to x0 (so its x runs from −bevel to x1 − x0 − bevel).
 */
export function extrudeX(
  b: VehicleBuilder,
  shape: THREE.Shape,
  x0: number,
  x1: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  bevel: number,
  wells: [number, number][] = [],
  segments = 3,
  ratio = 0.8,
  reshape?: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
): void {
  const size = bevel * ratio;
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, x1 - x0 - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: size,
    bevelOffset: -size,
    bevelSegments: segments,
    curveSegments: 12,
  });
  let g = capNormals(raw);
  if (wells.length) {
    const pos = g.getAttribute('position'),
      nrm = g.getAttribute('normal');
    const colors = new Float32Array(pos.count * 3),
      slots = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 3) {
      let cu = 0,
        cv = 0,
        nu = 0,
        nv = 0,
        nw = 0;
      for (let k = 0; k < 3; k++) {
        cu += pos.getX(i + k) / 3;
        cv += pos.getY(i + k) / 3;
        nu += nrm.getX(i + k);
        nv += nrm.getY(i + k);
        nw += nrm.getZ(i + k);
      }
      const nl = Math.hypot(nu, nv, nw) || 1;
      let inWell = false;
      for (const [wz, wy] of wells) {
        const du = -wz - cu,
          dv = wy - cv,
          d = Math.hypot(du, dv);
        if (d < 0.7 && Math.abs(nw / nl) < 0.6 && (nu * du + nv * dv) / (nl * d) > 0.4) inWell = true;
      }
      const col = inWell ? well : color;
      for (let k = 0; k < 3; k++) {
        colors.set([col.r, col.g, col.b], (i + k) * 3);
        slots[i + k] = inWell ? M.Rubber : slot;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('materialSlot', new THREE.BufferAttribute(slots, 1));
  }
  g.rotateY(Math.PI / 2);
  if (reshape) g = reshape(g);
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push().translate(x0 + bevel, 0, 0);
  b.geometry(g, color);
  b.pop();
}

/** Extrude a front-view (x, y) shape along the car from z0 to z1 with rounded edges. */
export function extrudeZ(
  b: VehicleBuilder,
  shape: THREE.Shape,
  z0: number,
  z1: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  bevel: number,
  reshape?: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
): void {
  const size = bevel * 0.8;
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, z1 - z0 - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: size,
    bevelOffset: -size,
    bevelSegments: 3,
    curveSegments: 12,
  });
  const flat = capNormals(raw);
  const g = reshape ? reshape(flat) : flat;
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push().translate(0, 0, z0 + bevel);
  b.geometry(g, color);
  b.pop();
}

/** A flat pane in a side-view outline, facing outwards on the given side, at x. */
export function sidePane(
  b: VehicleBuilder,
  verts: Vtx[],
  side: number,
  x: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  hole?: Vtx[],
): void {
  const map = (p: THREE.Vector2) => new THREE.Vector2(-side * p.x, p.y);
  const s = new THREE.Shape(rounded(verts).map(map));
  if (hole) s.holes.push(new THREE.Path(rounded(hole).map(map)));
  const g = new THREE.ShapeGeometry(s);
  g.rotateY((side * Math.PI) / 2);
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push().translate(x, 0, 0);
  b.geometry(g, color);
  b.pop();
}

/** A flat pane in a front-view outline at z, facing backwards (facing > 0) or forwards. */
export function frontPane(
  b: VehicleBuilder,
  verts: Vtx[],
  z: number,
  facing: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  hole?: Vtx[],
): void {
  const s = new THREE.Shape(rounded(verts));
  if (hole) s.holes.push(new THREE.Path(rounded(hole)));
  const g = new THREE.ShapeGeometry(s);
  if (facing < 0) g.rotateY(Math.PI);
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push().translate(0, 0, z);
  b.geometry(g, color);
  b.pop();
}

/**
 * A round sealed-beam headlamp facing forwards from (x, y, z): a chrome rim, a dark seat
 * and a domed lens with its moulded flutes. `r` is the lens radius (0.089 for a 7 inch lamp).
 */
export function roundHeadlamp(
  b: VehicleBuilder,
  x: number,
  y: number,
  z: number,
  r: number,
  lens: THREE.Color,
  chrome: THREE.Color,
  dark: THREE.Color,
): void {
  b.ring(x, y, z - 0.012, r + 0.008, 0.012, chrome, M.Metal, 'z', Z.Front);
  b.slot = M.Rubber;
  b.tag = Z.Front;
  b.push()
    .translate(x, y, z - 0.004)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.012, 20), dark);
  b.pop();
  b.slot = M.Headlamp;
  b.push()
    .translate(x, y, z - 0.012)
    .scale(1, 1, 0.28);
  b.geometry(new THREE.SphereGeometry(r, 20, 8), lens);
  b.pop();
  const flute = lens.clone().multiplyScalar(0.86);
  const zf = z - 0.012 - r * 0.28 - 0.001;
  for (let i = -4; i <= 4; i++) {
    const h = Math.sqrt(Math.max(0, (r * 0.92) ** 2 - (i * r * 0.2) ** 2)) * 2;
    b.block(x + i * r * 0.2, y, zf + 0.004, 0.0025, h * 0.9, 0.003, flute, M.Headlamp, Z.Front);
  }
  for (const k of [-0.45, 0, 0.45]) {
    const w = Math.sqrt(Math.max(0, (r * 0.92) ** 2 - (k * r) ** 2)) * 2;
    b.block(x, y + k * r, zf + 0.004, w * 0.9, 0.0025, 0.003, flute, M.Headlamp, Z.Front);
  }
}
