import * as THREE from 'three';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/**
 * The inner side of a wheel. The wheel builders draw a wheel alike on both faces: rim, nuts and
 * hub cap outside and the same again inside. A real wheel shows its nuts and hub cap only on the
 * outer face (to +x in the wheel's own frame); from inside you see the tyre's inner sidewall, the
 * rim's barrel with its well, the back of the centre disc and, on a wheel on its axle, the brake
 * drum and its backing plate. `wheelBack` makes any builder's wheel like that; `withBrake` adds
 * the brake for a road wheel (a spare has none).
 */

/** Where a wheel's parts are, measured from its geometry (wheel frame, axle along x). */
export interface WheelFit {
  /** Radius where the tyre meets the rim (its bead seat). */
  bead: number;
  /** x of the tyre's inner and outer beads. */
  beadIn: number;
  beadOut: number;
  /** Half the tyre's width, sidewall bulge included. */
  halfWidth: number;
  /** x of the back of the outer face's centre disc. */
  discBack: number;
  /** The rim's colour and material. */
  rim: THREE.Color;
  rimSlot: number;
}

const radius = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
  Math.hypot(p.getY(i), p.getZ(i));

/**
 * The bead: the smallest radius at which rubber goes all the way round. Black parts that are not
 * tyre (a steel wheel's painted vent plugs, say) sit at a few points round, not all the way.
 */
function measureBead(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  const slot = g.getAttribute('materialSlot');
  const rubber: { r: number; a: number }[] = [];
  for (let i = 0; i < p.count; i++)
    if (slot.getX(i) === M.Rubber) rubber.push({ r: radius(p, i), a: Math.atan2(p.getZ(i), p.getY(i)) });
  rubber.sort((u, v) => u.r - v.r);
  // All the way round: no gap between neighbouring angles wider than 0.25 rad (a tyre's lathe
  // has 48 or so steps round, 0.13 rad; a ring of ten plugs leaves gaps of 0.37 rad).
  for (let start = 0; start < rubber.length; start++) {
    const r0 = rubber[start].r;
    const angles: number[] = [];
    for (let j = start; j < rubber.length && rubber[j].r < r0 + 0.004; j++) angles.push(rubber[j].a);
    angles.sort((u, v) => u - v);
    let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
    for (let j = 1; j < angles.length; j++) gap = Math.max(gap, angles[j] - angles[j - 1]);
    if (gap < 0.25) return r0;
  }
  throw new Error('wheelBack: no tyre found');
}

/** Measure a wheel as its builder drew it, or after `wheelBack`. */
export function measureWheel(g: THREE.BufferGeometry): WheelFit {
  const p = g.getAttribute('position');
  const slot = g.getAttribute('materialSlot');
  const col = g.getAttribute('color');
  const bead = measureBead(g);
  let beadIn = 0,
    beadOut = 0,
    halfWidth = 0;
  for (let i = 0; i < p.count; i++) {
    if (slot.getX(i) !== M.Rubber) continue;
    const x = p.getX(i);
    halfWidth = Math.max(halfWidth, Math.abs(x));
    const r = radius(p, i);
    if (r >= bead && r < bead + 0.004) {
      beadIn = Math.min(beadIn, x);
      beadOut = Math.max(beadOut, x);
    }
  }
  // The outer face's disc: the parts between the hub and the rim on the outer half.
  const rim = new THREE.Color(0, 0, 0);
  const slots = new Map<number, number>();
  let n = 0,
    discBack = Infinity;
  for (let i = 0; i < p.count; i++) {
    if (slot.getX(i) === M.Rubber) continue;
    const x = p.getX(i),
      r = radius(p, i);
    if (x <= 0.005 || r < 0.35 * bead || r > 0.9 * bead) continue;
    discBack = Math.min(discBack, x);
    rim.r += col.getX(i);
    rim.g += col.getY(i);
    rim.b += col.getZ(i);
    slots.set(slot.getX(i), (slots.get(slot.getX(i)) ?? 0) + 1);
    n++;
  }
  if (n === 0) throw new Error('wheelBack: no rim found');
  rim.multiplyScalar(1 / n);
  const rimSlot = [...slots].sort((u, v) => v[1] - u[1])[0][0];
  return { bead, beadIn, beadOut, halfWidth, discBack, rim, rimSlot };
}

/** A new geometry with only the triangles `keep` accepts (by first vertex index). */
function filterTriangles(g: THREE.BufferGeometry, keep: (i: number) => boolean): THREE.BufferGeometry {
  const source = g.index ? g.toNonIndexed() : g;
  const p = source.getAttribute('position');
  const kept: number[] = [];
  for (let i = 0; i < p.count; i += 3) if (keep(i)) kept.push(i, i + 1, i + 2);
  const result = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    const data = new Float32Array(kept.length * attr.itemSize);
    kept.forEach((old, j) => {
      for (let k = 0; k < attr.itemSize; k++) data[j * attr.itemSize + k] = attr.getComponent(old, k);
    });
    result.setAttribute(name, new THREE.BufferAttribute(data, attr.itemSize));
  }
  result.userData = { ...g.userData };
  return result;
}

/** Join extra parts drawn with a VehicleBuilder onto a wheel, keeping the wheel's attributes. */
function join(g: THREE.BufferGeometry, extra: THREE.BufferGeometry): THREE.BufferGeometry {
  const parts = [g, extra];
  const result = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const size = g.getAttribute(name).itemSize;
    const total = parts.reduce((s, part) => s + part.getAttribute('position').count, 0);
    const data = new Float32Array(total * size);
    let offset = 0;
    for (const part of parts) {
      const attr = part.getAttribute(name);
      const count = part.getAttribute('position').count;
      if (attr)
        for (let i = 0; i < count; i++)
          for (let k = 0; k < size; k++) data[(offset + i) * size + k] = attr.getComponent(i, k);
      offset += count;
    }
    result.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  result.userData = { ...g.userData };
  result.computeBoundingBox();
  return result;
}

/**
 * The wheel with a real inner side. Everything its builder drew on the inner half (x below
 * 1 cm in) that reaches in from the rim towards the hub goes: the inner disc, hub, nuts and hub
 * cap, and any black studs or plugs there. The tyre and the rim's inner flange stay. In their
 * place: the rim's barrel from bead to bead, dropping into a well across the middle, which
 * closes the tyre from inside, and the back of the centre disc, in the rim's colour.
 */
export function wheelBack(wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  if (wheel.userData.wheelBack) return wheel;
  const fit = measureWheel(wheel);
  const p = wheel.getAttribute('position');
  const slot = wheel.getAttribute('materialSlot');
  const kept = filterTriangles(wheel, (i) => {
    let maxX = -Infinity,
      minR = Infinity;
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) {
      maxX = Math.max(maxX, p.getX(i + k));
      minR = Math.min(minR, radius(p, i + k));
      c.y += p.getY(i + k) / 3;
      c.z += p.getZ(i + k) / 3;
    }
    if (maxX >= -0.01) return true;
    // Inner half: keep the tyre and the flange round the bead, drop what reaches in from it.
    const reach = Math.min(minR, Math.hypot(c.y, c.z));
    if (slot.getX(i) === M.Rubber) return reach >= fit.bead - 0.005;
    return reach >= 0.9 * fit.bead;
  });
  const b = new VehicleBuilder();
  b.tag = Z.Trim;
  const steel = fit.rim.clone().multiplyScalar(0.8);
  const slotId = fit.rimSlot as (typeof M)[keyof typeof M];
  // The barrel, facing in towards the axle: bead seat, a step down into the well, back up.
  const r = fit.bead - 0.002,
    well = fit.bead * 0.9;
  const a = fit.beadIn,
    z = fit.beadOut,
    span = z - a;
  const profile = [
    [r, z],
    [r, z - span * 0.18],
    [well, z - span * 0.3],
    [well, a + span * 0.4],
    [r, a + span * 0.52],
    [r, a],
  ].map(([pr, px]) => new THREE.Vector2(pr, px));
  b.slot = slotId;
  b.push().rotate(0, 0, -Math.PI / 2);
  b.geometry(new THREE.LatheGeometry(profile, 32), steel);
  b.pop();
  // The back of the centre disc, facing in, with the dark bore the hub goes through.
  const back = Math.min(fit.discBack, z) - 0.002;
  b.slot = slotId;
  b.push()
    .translate(back, 0, 0)
    .rotate(0, -Math.PI / 2, 0);
  b.geometry(new THREE.RingGeometry(0.055, well + 0.004, 32), steel.clone().multiplyScalar(0.9));
  b.pop();
  b.slot = M.Rubber;
  b.push()
    .translate(back - 0.001, 0, 0)
    .rotate(0, -Math.PI / 2, 0);
  b.geometry(new THREE.CircleGeometry(0.055, 16), new THREE.Color('#151614'));
  b.pop();
  const result = join(kept, b.build());
  result.userData = { ...result.userData, wheelBack: true, wheelFit: fit };
  return result;
}

/**
 * A road wheel: `wheelBack` with the brake behind the disc. A cast-iron drum sits on the back of
 * the centre disc (it turns with the wheel), closed by a dark backing plate a little wider than
 * it with the axle's hub boss in its middle, set in from the wheel's inner bead.
 */
export function withBrake(wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const backed = wheelBack(wheel);
  const fit = backed.userData.wheelFit as WheelFit;
  const b = new VehicleBuilder();
  b.tag = Z.Trim;
  const front = Math.min(fit.discBack, fit.beadOut) - 0.004;
  const inner = fit.beadIn * 0.55;
  const drum = fit.bead * 0.72;
  // Matte cast iron (the metal slot's shine turned it black in shade), ribbed as cast.
  const iron = new THREE.Color('#6B655D');
  b.slot = M.Fabric;
  b.push()
    .translate((front + inner) / 2, 0, 0)
    .rotate(0, 0, -Math.PI / 2);
  b.geometry(new THREE.CylinderGeometry(drum, drum, front - inner, 24), iron);
  b.pop();
  for (const t of [0.3, 0.65])
    b.ring(inner + (front - inner) * t, 0, 0, drum, 0.005, iron.clone().multiplyScalar(0.8), M.Fabric, 'x');
  // The backing plate, and the axle's hub boss standing out of its middle.
  const plate = new THREE.Color('#2F312E');
  b.slot = M.Fabric;
  b.push()
    .translate(inner - 0.006, 0, 0)
    .rotate(0, 0, -Math.PI / 2);
  b.geometry(new THREE.CylinderGeometry(drum * 1.08, drum * 1.08, 0.012, 24), plate);
  b.pop();
  b.push()
    .translate(inner - 0.027, 0, 0)
    .rotate(0, 0, -Math.PI / 2);
  b.geometry(
    new THREE.CylinderGeometry(fit.bead * 0.3, fit.bead * 0.36, 0.03, 16),
    plate.clone().multiplyScalar(1.3),
  );
  b.pop();
  const result = join(backed, b.build());
  result.userData = { ...backed.userData, wheelBrake: true };
  return result;
}
