import * as THREE from 'three';
import { DRUM, drumSpots, type TrailerTuning } from '../data/trailers';
import type { VehicleTuning } from '../data/vehicle';
import type { Trailer } from '../sim/trailer';
import { followBody } from './followBody';
import { patchFog } from './fog';
import { perentieColors } from './perentiePaint';
import {
  BodyZone as Z,
  groupVehicleMaterials,
  VehicleBuilder,
  VehicleMaterial as M,
} from './vehicleGeometry';
import { buildVehicleWheel } from './vehicleWheel';

const galv = new THREE.Color('#A3A8A4');
const dark = new THREE.Color('#3A3D3B');
const red = new THREE.Color('#A3261B');
const drumBlue = new THREE.Color('#2F4F7A');
const amber = new THREE.Color('#E39B37');
const army = perentieColors.paint;

/**
 * A trailer (src/sim/trailer.ts) drawn in code like the vehicles: the galvanised 6×4 box
 * trailer with its A-frame drawbar, ball coupling and jockey wheel, or the Army's No. 5 in
 * flat green with its single-tube drawbar, lunette ring, prop leg and spare wheel. The jockey
 * wheel or prop leg is up while it's hitched. Drums stand in the box when it carries them.
 */
export class TrailerView {
  readonly root = new THREE.Group();
  private readonly materials: THREE.Material[];
  private readonly wheels: { pivot: THREE.Group; spin: THREE.Group }[] = [];
  /** The jockey wheel, or the No. 5's prop leg, on a pivot where it meets the drawbar. */
  private readonly jockey = new THREE.Group();
  private readonly drums = new THREE.Group();
  private drumCount = -1;

  constructor(readonly trailer: Trailer) {
    const t = trailer.tuning;
    this.root.name = t.name;
    const metal = () =>
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }));
    const matte = () => patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    // One material per vehicle material slot, as the vehicle bodies use.
    // The galvanised box trailer shines; the Army's flat green doesn't.
    const flat = () =>
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 }));
    this.materials = Object.values(M).map((slot) =>
      slot === M.Metal ? metal() : slot === M.Paint ? (t.id === 'no5' ? flat() : metal()) : matte(),
    );
    const body = new THREE.Mesh(t.id === 'no5' ? buildNo5(t) : build(t), this.materials);
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    const wheelGeo = buildVehicleWheel(
      { wheelRadius: t.wheelRadius, wheelWidth: t.wheelWidth } as VehicleTuning,
      // Army green rims on the No. 5; white steel ones on the box trailer.
      t.id === 'no5' ? army.clone() : new THREE.Color('#D9D8D0'),
    );
    groupVehicleMaterials(wheelGeo);
    for (const w of t.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.y - t.suspensionRestLength, w.z);
      const spin = new THREE.Group();
      const mesh = new THREE.Mesh(wheelGeo, this.materials);
      mesh.castShadow = true;
      spin.add(mesh);
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ pivot, spin });
    }
    if (t.spare) {
      // Standing on the drawbar, facing the way it goes.
      const spare = new THREE.Mesh(wheelGeo, this.materials);
      spare.position.set(t.spare.x, t.spare.y, t.spare.z);
      spare.rotation.y = Math.PI / 2;
      spare.castShadow = true;
      this.root.add(spare);
    }
    const jb = new VehicleBuilder();
    const j = t.jockey;
    if (t.id === 'no5') {
      // The prop leg: a tube down from the drawbar to a foot plate.
      jb.rod({ x: j.x, y: j.y, z: j.z }, { x: j.x, y: t.coupling.y + 0.1, z: j.z }, 0.022, army);
      jb.block(j.x, j.y - j.r + 0.01, j.z, 0.14, 0.02, 0.14, dark, M.Metal, Z.Trim);
    } else {
      jb.rod({ x: j.x, y: j.y + j.r, z: j.z }, { x: j.x, y: t.coupling.y + 0.12, z: j.z }, 0.03, galv);
      jb.slot = M.Rubber;
      jb.tag = Z.Trim;
      jb.push()
        .translate(j.x, j.y, j.z)
        .rotate(0, 0, Math.PI / 2);
      jb.geometry(new THREE.CylinderGeometry(j.r, j.r, 0.05, 16), dark);
      jb.pop();
    }
    const jockeyGeo = jb.build();
    groupVehicleMaterials(jockeyGeo);
    const jockeyMesh = new THREE.Mesh(jockeyGeo, this.materials);
    jockeyMesh.castShadow = true;
    const pivotY = t.coupling.y + 0.1;
    this.jockey.position.set(j.x, pivotY, j.z);
    jockeyMesh.position.set(-j.x, -pivotY, -j.z);
    this.jockey.add(jockeyMesh);
    this.root.add(this.jockey);
    this.root.add(this.drums);
    this.update(1);
  }

  /** Stand `count` drums in the box (none, or up to six). */
  setDrums(count: number): void {
    if (count === this.drumCount) return;
    this.drumCount = count;
    for (const c of [...this.drums.children]) {
      this.drums.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    if (count <= 0) return;
    const b = new VehicleBuilder();
    const bed = this.trailer.tuning.bed;
    for (const [x, z] of drumSpots(count, bed)) {
      b.slot = M.Paint;
      b.tag = Z.Sides;
      b.push().translate(x, bed.y + DRUM.height / 2, z);
      b.geometry(new THREE.CylinderGeometry(DRUM.radius, DRUM.radius, DRUM.height, 20), drumBlue);
      b.pop();
      // Rolling hoops and the bung on the lid.
      for (const y of [0.3, 0.58])
        b.ring(x, bed.y + y, z, DRUM.radius + 0.008, 0.012, drumBlue, M.Paint, 'y');
      b.block(x + 0.15, bed.y + DRUM.height + 0.01, z, 0.06, 0.02, 0.06, dark, M.Metal, Z.Trim);
    }
    const geo = b.build();
    groupVehicleMaterials(geo);
    const mesh = new THREE.Mesh(geo, this.materials);
    mesh.castShadow = true;
    this.drums.add(mesh);
  }

  /** Follow the trailer between physics steps (`alpha` 0 = the last step, 1 = now). */
  update(alpha: number): void {
    const tr = this.trailer;
    this.setDrums(tr.drums);
    followBody(this.root, tr, alpha);
    const t = tr.tuning;
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].pivot.position.y = t.wheels[i].y - tr.wheels[i].suspension;
      this.wheels[i].spin.rotation.x = -tr.wheels[i].rotation;
      this.wheels[i].pivot.scale.y = tr.tyres[i] > 0 ? 1 : 0.65;
    }
    // Wound up off the ground while it's on the ball; the No. 5's prop leg swings up forwards
    // along the drawbar.
    const up = tr.hitchedTo !== null;
    if (t.id === 'no5') this.jockey.rotation.x = up ? Math.PI / 2 : 0;
    else this.jockey.position.y = t.coupling.y + 0.1 + (up ? 0.22 : 0);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

/** The box, guards, drawbar, coupling, axle and lamps (local, as the physics). */
function build(t: TrailerTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const bed = t.bed;
  const len = bed.hz * 2 + 0.06;
  const wid = bed.hx * 2 + 0.06;
  const front = bed.cz - bed.hz - 0.03;
  const back = bed.cz + bed.hz + 0.03;
  // Floor, the four sides and the rolled top rail round them.
  b.block(0, bed.y - 0.02, bed.cz, wid, 0.04, len, galv, M.Metal, Z.Sides);
  for (const side of [-1, 1]) {
    b.block(
      side * (bed.hx + 0.015),
      bed.y + bed.sides / 2 - 0.02,
      bed.cz,
      0.03,
      bed.sides,
      len,
      galv,
      M.Metal,
    );
    b.rod(
      { x: side * (bed.hx + 0.015), y: bed.y + bed.sides - 0.02, z: front },
      { x: side * (bed.hx + 0.015), y: bed.y + bed.sides - 0.02, z: back },
      0.025,
      galv,
    );
    // Two swages pressed along each side, and the corner posts.
    for (const y of [0.33, 0.66])
      b.block(
        side * (bed.hx + 0.033),
        bed.y + bed.sides * y,
        bed.cz,
        0.012,
        0.025,
        len - 0.08,
        galv,
        M.Metal,
      );
    for (const z of [front, back])
      b.block(side * (bed.hx + 0.02), bed.y + bed.sides / 2 - 0.02, z, 0.05, bed.sides, 0.05, galv, M.Metal);
  }
  for (const z of [front, back]) {
    b.block(
      0,
      bed.y + bed.sides / 2 - 0.02,
      z,
      wid,
      bed.sides,
      0.03,
      galv,
      M.Metal,
      z === back ? Z.Rear : Z.Front,
    );
    b.rod(
      { x: -bed.hx, y: bed.y + bed.sides - 0.02, z },
      { x: bed.hx, y: bed.y + bed.sides - 0.02, z },
      0.025,
      galv,
    );
  }
  // Chassis rails under the floor, out to the drawbar.
  for (const side of [-1, 1])
    b.block(side * 0.45, bed.y - 0.08, bed.cz, 0.06, 0.08, len, dark, M.Metal, Z.Trim);
  // Mudguards outside the box: a flat top over the tyre and an angled plate down in front
  // of and behind it, red and white reflective tape on the back edge.
  const hubY = t.wheels[0].y - t.suspensionRestLength + 0.03;
  const gw = t.wheelWidth + 0.1;
  const top = hubY + t.wheelRadius + 0.07;
  for (const w of t.wheels) {
    const x = w.x;
    b.block(x, top, w.z, gw, 0.02, 0.42, galv, M.Metal, Z.Sides);
    for (const dz of [-1, 1]) {
      const a = { x, y: top, z: w.z + dz * 0.21 };
      const e = { x, y: hubY - 0.02, z: w.z + dz * 0.42 };
      b.push()
        .translate((a.x + e.x) / 2, (a.y + e.y) / 2, (a.z + e.z) / 2)
        .rotate(Math.atan2(e.z - a.z, e.y - a.y), 0, 0);
      b.slot = M.Metal;
      b.tag = Z.Sides;
      b.box(gw, Math.hypot(a.y - e.y, a.z - e.z), 0.02, galv);
      // The skirt turned down along its outer edge.
      b.translate(Math.sign(x) * (gw / 2), 0, 0.05 * dz);
      b.box(0.012, Math.hypot(a.y - e.y, a.z - e.z), 0.1, galv);
      b.pop();
    }
    b.block(x + Math.sign(x) * (gw / 2), top - 0.05, w.z, 0.012, 0.1, 0.42, galv, M.Metal, Z.Sides);
    b.block(x, hubY + 0.02, w.z + 0.4, gw + 0.005, 0.06, 0.012, red, M.Red, Z.Rear);
    // An amber reflector at the front of the guard, a red one at the back.
    b.block(x + Math.sign(x) * (gw / 2 + 0.005), top - 0.05, w.z - 0.18, 0.01, 0.05, 0.05, amber, M.Paint);
  }
  // Leaf springs and the axle.
  for (const w of t.wheels) b.block(w.x * 0.88, hubY + 0.06, w.z, 0.05, 0.03, 0.9, dark, M.Metal, Z.Trim);
  b.rod({ x: t.wheels[0].x, y: hubY, z: 0 }, { x: t.wheels[1].x, y: hubY, z: 0 }, 0.03, dark);
  // The A-frame drawbar from the front corners to the coupling.
  const c = t.coupling;
  for (const side of [-1, 1])
    b.rod({ x: side * 0.45, y: bed.y - 0.08, z: front + 0.3 }, { x: 0, y: c.y, z: c.z + 0.16 }, 0.035, dark);
  b.block(0, c.y + 0.04, c.z + 0.08, 0.1, 0.09, 0.26, dark, M.Metal, Z.Front, 0.02);
  b.block(0, c.y + 0.1, c.z + 0.12, 0.04, 0.03, 0.12, galv, M.Metal, Z.Front);
  // Safety chains hang from the drawbar.
  for (const side of [-1, 1])
    b.rod(
      { x: side * 0.05, y: c.y, z: c.z + 0.2 },
      { x: side * 0.08, y: c.y - 0.12, z: c.z + 0.05 },
      0.008,
      dark,
    );
  // The tailgate drops on hinges along the floor and latches at the top corners; red and
  // white tape across it.
  b.rod(
    { x: -bed.hx, y: bed.y - 0.01, z: back + 0.02 },
    { x: bed.hx, y: bed.y - 0.01, z: back + 0.02 },
    0.015,
    galv,
  );
  for (const side of [-1, 1]) {
    b.block(
      side * (bed.hx - 0.04),
      bed.y + bed.sides - 0.08,
      back + 0.025,
      0.06,
      0.05,
      0.02,
      dark,
      M.Metal,
      Z.Rear,
    );
    for (let k = 0; k < 3; k++)
      b.block(
        side * (0.12 + k * 0.2),
        bed.y + 0.08,
        back + 0.02,
        0.1,
        0.05,
        0.008,
        k % 2 ? red : new THREE.Color('#EDEDE6'),
        k % 2 ? M.Red : M.Paint,
        Z.Rear,
      );
  }
  // Tail lamps on the crossmember under the box, the number plate on a bracket between them.
  b.block(0, bed.y - 0.1, back - 0.02, wid - 0.06, 0.05, 0.05, galv, M.Metal, Z.Rear);
  for (const side of [-1, 1])
    b.block(side * (bed.hx - 0.08), bed.y - 0.1, back + 0.015, 0.16, 0.07, 0.03, red, M.Red, Z.Rear);
  b.block(0, bed.y - 0.17, back + 0.015, 0.37, 0.13, 0.01, new THREE.Color('#E8E2C8'), M.Paint, Z.Rear);
  const geo = b.build();
  groupVehicleMaterials(geo);
  return geo;
}

/**
 * The Army's No. 5 (reference/vehicles/army-no5-trailer): a deep steel box in flat green with
 * a rolled lip round the top, pressed ribs and rope hooks on the sides, the wheels tucked under
 * its edges with the arches inside, reflectors and lamps on the back, and a single-tube drawbar
 * to a lunette ring.
 */
function buildNo5(t: TrailerTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const bed = t.bed;
  const half = bed.hx + 0.03;
  const len = bed.hz * 2 + 0.06;
  const front = bed.cz - bed.hz - 0.03;
  const back = bed.cz + bed.hz + 0.03;
  const bottom = bed.y - 0.08;
  const top = bed.y + bed.sides + 0.03;
  const h = top - bottom;
  const midY = (top + bottom) / 2;
  const rib = army.clone().multiplyScalar(0.9);
  // Floor, sides, front and back.
  b.block(0, bed.y - 0.02, bed.cz, half * 2, 0.04, len, army, M.Paint, Z.Sides);
  for (const side of [-1, 1]) {
    b.block(side * (half - 0.015), midY, bed.cz, 0.03, h, len, army, M.Paint, Z.Sides);
    // Pressed ribs, the channel along the bottom and the rope hooks under the lip.
    for (const dz of [-0.62, 0, 0.62])
      b.block(side * (half + 0.012), midY, bed.cz + dz, 0.025, h - 0.08, 0.07, rib, M.Paint, Z.Sides);
    b.block(side * (half + 0.02), bottom + 0.04, bed.cz, 0.04, 0.08, len, rib, M.Paint, Z.Sides);
    for (const dz of [-0.82, -0.3, 0.3, 0.82])
      b.ring(side * (half + 0.03), top - 0.1, bed.cz + dz, 0.025, 0.006, dark, M.Metal, 'z', Z.Trim);
  }
  for (const [z, zone] of [
    [front, Z.Front],
    [back, Z.Rear],
  ] as const) {
    b.block(0, midY, z, half * 2, h, 0.03, army, M.Paint, zone);
    const out = z === back ? 1 : -1;
    for (const x of [-0.22, 0.22])
      b.block(x, midY, z + out * 0.015, 0.08, h - 0.08, 0.025, rib, M.Paint, zone);
    b.block(0, bottom + 0.16, z + out * 0.02, half * 2 - 0.04, 0.05, 0.03, rib, M.Paint, zone);
  }
  // The rolled lip round the top: it stands out past the ribs to the published 1.55 m
  // overall width (SOURCES.md), 85 mm beyond the box's sides.
  const lip = 0.085;
  for (const side of [-1, 1]) {
    b.block(
      side * (half + lip / 2),
      top,
      bed.cz,
      lip + 0.005,
      0.03,
      len + 0.06,
      army,
      M.Paint,
      Z.Sides,
      0.01,
    );
    b.block(
      0,
      top,
      side < 0 ? front - 0.015 : back + 0.015,
      half * 2 + lip * 2,
      0.03,
      0.06,
      army,
      M.Paint,
      Z.Sides,
      0.01,
    );
  }
  // Wheel arches inside the box.
  const a = t.arch;
  if (a)
    for (const side of [-1, 1])
      b.block(side * a.x, a.y, a.z, a.hx * 2, a.hy * 2, a.hz * 2, army, M.Paint, Z.Sides, 0.03);
  // Underneath: the spine from the drawbar, the springs and the axle.
  const hubY = t.wheels[0].y - t.suspensionRestLength + 0.03;
  b.rod({ x: 0, y: bottom - 0.04, z: front }, { x: 0, y: bottom - 0.04, z: 0.2 }, 0.04, army, M.Paint);
  for (const w of t.wheels) b.block(w.x * 0.82, hubY + 0.07, w.z, 0.06, 0.04, 0.9, dark, M.Metal, Z.Trim);
  b.rod({ x: t.wheels[0].x, y: hubY, z: 0 }, { x: t.wheels[1].x, y: hubY, z: 0 }, 0.035, dark);
  // The drawbar: one tube from under the front to the ring.
  const c = t.coupling;
  b.rod(
    { x: 0, y: bottom - 0.04, z: front + 0.1 },
    { x: 0, y: c.y, z: c.z + 0.1 },
    0.045,
    army,
    M.Paint,
    Z.Front,
  );
  b.block(0, c.y, c.z + 0.07, 0.06, 0.04, 0.08, dark, M.Metal, Z.Front);
  b.ring(c.x, c.y, c.z, 0.05, 0.016, dark, M.Metal, 'y', Z.Front);
  // A bracket for the spare on the drawbar.
  if (t.spare) b.block(0, c.y + 0.12, t.spare.z, 0.14, 0.08, 0.3, dark, M.Metal, Z.Trim);
  // Safety chains and the lamp lead.
  for (const side of [-1, 1])
    b.rod(
      { x: side * 0.05, y: c.y, z: c.z + 0.3 },
      { x: side * 0.08, y: c.y - 0.1, z: c.z + 0.1 },
      0.008,
      dark,
    );
  b.rod({ x: 0.06, y: c.y + 0.03, z: c.z + 0.5 }, { x: 0.1, y: c.y - 0.04, z: c.z + 0.15 }, 0.01, dark);
  // The back: two round red reflectors, lamps in the bottom corners and the plate between them.
  for (const side of [-1, 1]) {
    b.ring(side * 0.5, midY + 0.05, back + 0.02, 0.035, 0.025, red, M.Red, 'z', Z.Rear);
    b.block(side * 0.58, bottom + 0.02, back + 0.03, 0.08, 0.07, 0.03, red, M.Red, Z.Rear);
    b.block(side * 0.47, bottom + 0.02, back + 0.03, 0.06, 0.06, 0.03, amber, M.Paint, Z.Rear);
  }
  b.block(0, bottom - 0.02, back + 0.035, 0.37, 0.11, 0.01, new THREE.Color('#E8E2C8'), M.Paint, Z.Rear);
  const geo = b.build();
  groupVehicleMaterials(geo);
  return geo;
}
