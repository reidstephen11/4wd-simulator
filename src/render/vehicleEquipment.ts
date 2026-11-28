import { jerryCan, numberPlate } from './bodyKit';
import { ROUND_BEND, continuousTube, cleanGeometry } from './bodyRefinement';
import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { FJ40_BODY_LIFT } from '../data/vehicles';
import { pal } from './colors';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { HW, NOSE, ROOF, TAIL } from './vehicleBody';
import { mountSpare, spareSidewall } from './spares';

/** The rack was laid out on a roof at 1.64 m; it rides on the lower hardtop by this much. */
const rackDrop = () => ROOF - 1.64;

/**
 * The Blender FJ40's roof is 0.12 m under the code body's, once its hubs sit on the game's
 * axles. The rack, the roof spare and the recovery boards drop by this much on that car only.
 */
export const FJ40_GEAR_DROP = -0.12 + FJ40_BODY_LIFT;

/** Round driving lamps on the bull bar, in the game frame. They come on with high beam. */
export const fj40DrivingLamps: { x: number; y: number; z: number }[] = [-0.55, 0.55].map((x) => ({
  x,
  y: 0.78,
  z: -1.9,
}));

const trim = new THREE.Color('#343D37'),
  steel = new THREE.Color('#959B94'),
  bar = new THREE.Color('#2E3430');
const black = new THREE.Color('#232926'),
  canvas = new THREE.Color('#77735A');
const red = new THREE.Color('#B84A32');

type V = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V => ({ x, y, z });

function plate(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.push()
    .translate(x, y, z)
    .rotate(0, facing < 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.36, 0.12, 0.015, black, M.Rubber, Z.Trim, 0.009);
  b.block(0, 0, 0.01, 0.33, 0.095, 0.008, pal('vehicleRoof'), M.Paint, Z.Trim, 0.005);
  const line = (ax: number, ay: number, bx: number, by: number) =>
    b.rod({ x: ax, y: ay, z: 0.017 }, { x: bx, y: by, z: 0.017 }, 0.003, black, M.Rubber);
  line(-0.12, -0.028, -0.12, 0.028);
  line(-0.12, 0.028, -0.08, 0.028);
  line(-0.12, 0, -0.09, 0);
  line(-0.05, 0.028, -0.01, 0.028);
  line(-0.02, 0.028, -0.02, -0.02);
  line(-0.02, -0.02, -0.04, -0.028);
  line(-0.04, -0.028, -0.055, -0.015);
  line(0.01, 0, 0.03, 0);
  line(0.06, 0.028, 0.045, 0);
  line(0.045, 0, 0.085, 0);
  line(0.08, -0.028, 0.08, 0.028);
  for (const x0 of [0.11, 0.145]) line(x0, -0.028, x0, 0.028);
  line(0.11, -0.028, 0.145, -0.028);
  line(0.11, 0.028, 0.145, 0.028);
  b.pop();
}

/** A bent steel tube through the points, with a ball at each bend so the joints close. */
function tubePath(b: VehicleBuilder, pts: V[], r: number, color: THREE.Color): void {
  continuousTube(
    b,
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    r,
    color,
    Z.Front,
    M.Metal,
    ROUND_BEND,
  );
}

/** Red bow shackle on a recovery point. */
function shackle(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.block(x, y + 0.03, z, 0.07, 0.1, 0.04, steel, M.Metal, Z.Trim);
  b.ring(x, y - 0.03, z + facing * 0.03, 0.045, 0.011, red, M.Paint, 'x', Z.Trim);
  b.rod(v(x - 0.05, y, z + facing * 0.03), v(x + 0.05, y, z + facing * 0.03), 0.011, steel);
}

/**
 * A period steel bull bar ahead of the grille panel: a deep pan carrying the winch, a centre
 * hoop framing the grille and side loops that run above the headlamps out to the guards.
 */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning, lowWinch = false): void {
  const face = tuning.winchMount.z; // the pan's front face carries the fairlead
  const back = NOSE - 0.12;
  const zc = (face + back) / 2;
  // A single folded pan with swept ends. Brackets reach the narrowed frame rails.
  const outline = new THREE.Shape();
  outline.moveTo(-0.69, -face);
  outline.lineTo(0.69, -face);
  outline.lineTo(0.89, -(face + 0.1));
  outline.lineTo(0.89, -back);
  outline.lineTo(-0.89, -back);
  outline.lineTo(-0.89, -(face + 0.1));
  outline.closePath();
  const pan = new THREE.ExtrudeGeometry(outline, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
  });
  pan.rotateX(-Math.PI / 2);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push().translate(0, 0.17, 0);
  b.geometry(pan, bar);
  b.pop();
  for (const x of [-0.31, 0.31]) b.block(x, 0.17, NOSE - 0.06, 0.08, 0.22, 0.14, bar, M.Metal, Z.Trim, 0.008);
  const zt = NOSE - 0.075;
  const topY = 0.8,
    sideY = 0.69;
  tubePath(b, [v(-0.25, 0.39, zc), v(-0.25, topY, zt), v(0.25, topY, zt), v(0.25, 0.39, zc)], 0.03, bar);
  const joinZ = zc + ((zt - zc) * (sideY - 0.39)) / (topY - 0.39);
  for (const side of [-1, 1]) {
    tubePath(
      b,
      [
        v(side * 0.85, 0.39, zc + 0.025),
        v(side * 0.82, sideY - 0.02, zt - 0.01),
        v(side * 0.7, sideY, joinZ),
        v(side * 0.25, sideY, joinZ),
      ],
      0.026,
      bar,
    );
    b.block(side * 0.85, 0.39, zc + 0.025, 0.075, 0.045, 0.11, bar, M.Metal, Z.Front, 0.005);
    b.block(side * 0.25, 0.39, zc, 0.075, 0.045, 0.11, bar, M.Metal, Z.Front, 0.005);
  }
  // Winch on a cradle behind the pan; only its top and the roller fairlead show. The low
  // mount (the Blender FJ40) sinks the drum into the pan, level with the fairlead, with the
  // motor inside the bar: stood on top, the motor was in front of that car's left headlamp.
  const wy = lowWinch ? 0.35 : 0.44;
  b.rod(v(-0.2, wy, back - 0.05), v(0.2, wy, back - 0.05), 0.075, trim);
  for (let i = 0; i < 13; i++)
    b.ring(-0.15 + i * 0.025, wy, back - 0.05, 0.074, 0.005, steel, M.Metal, 'x', Z.Front);
  for (const x of [-0.22, 0.22])
    b.block(x, wy, back - 0.05, 0.03, 0.17, 0.17, black, M.Rubber, Z.Front, 0.012);
  if (!lowWinch) b.rod(v(-0.38, wy, back - 0.05), v(-0.24, wy, back - 0.05), 0.06, trim);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.005, 0.38, 0.14, 0.02, steel, M.Metal, Z.Front, 0.006);
  b.block(m.x, m.y, face - 0.012, 0.22, 0.06, 0.015, black, M.Rubber, Z.Front);
  for (const y of [m.y - 0.035, m.y + 0.035])
    b.rod(v(m.x - 0.11, y, face - 0.03), v(m.x + 0.11, y, face - 0.03), 0.016, steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.12, m.x + 0.12])
    b.rod(v(x, m.y - 0.05, face - 0.03), v(x, m.y + 0.05, face - 0.03), 0.016, steel, M.Metal, Z.Front);
  b.ring(m.x, m.y - 0.02, face - 0.05, 0.026, 0.008, red, M.Paint, 'z', Z.Front);
  for (const side of [-1, 1]) shackle(b, side * 0.66, 0.2, face - 0.02, -1);
  b.block(-0.43, 0.28, face - 0.023, 0.38, 0.14, 0.025, bar, M.Metal, Z.Front, 0.004);
  plate(b, -0.43, 0.28, face - 0.042, -1);
}

function rearBumper(b: VehicleBuilder, tuning: VehicleTuning): void {
  const z = TAIL + 0.09;
  b.block(0, 0.21, z, 1.7, 0.15, 0.15, bar, M.Metal, Z.Rear, 0.014);
  for (const x of [-0.47, 0.47]) b.block(x, 0.17, TAIL + 0.02, 0.08, 0.1, 0.14, bar, M.Metal, Z.Trim);
  for (const side of [-1, 1]) shackle(b, side * 0.62, 0.16, z + 0.075, 1);
  // Towbar tongue and ball at the tow point.
  const t = tuning.towPoint;
  b.block(t.x, t.y + 0.02, t.z + 0.07, 0.1, 0.06, 0.18, bar, M.Metal, Z.Rear);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(t.x, t.y + 0.1, t.z + 0.13);
  b.geometry(new THREE.SphereGeometry(0.03, 12, 8), steel);
  b.pop();
  b.rod(v(t.x, t.y + 0.05, t.z + 0.13), v(t.x, t.y + 0.08, t.z + 0.13), 0.012, steel);
  // The plate sits on the left of the bumper, under the spare, as the photographs have it.
  plate(b, -0.3, 0.215, z + 0.08, 1);
}

function chassis(b: VehicleBuilder): void {
  // Chassis, crossmembers, transmission pan and exhaust visible from side and underneath.
  for (const side of [-1, 1]) {
    b.block(side * 0.3, 0.02, -1.19, 0.09, 0.16, 0.84, trim, M.Metal, Z.Trim);
    b.rod(v(side * 0.3, 0.02, -0.77), v(side * 0.43, 0.02, -0.57), 0.045, trim, M.Metal, Z.Trim);
    b.block(side * 0.43, 0.02, 0.54, 0.09, 0.16, 2.22, trim, M.Metal, Z.Trim);
  }
  for (const z of [-1.51, -0.55, 0.44, 1.5])
    b.block(0, 0.02, z, z < -0.7 ? 0.6 : 0.86, 0.09, 0.09, trim, M.Metal, Z.Trim);
  b.block(0, 0.015, -0.23, 0.38, 0.15, 0.65, steel.clone().multiplyScalar(0.5), M.Metal, Z.Trim, 0.025);
  b.rod({ x: 0.31, y: -0.04, z: -0.66 }, { x: 0.4, y: -0.03, z: 1.13 }, 0.025, steel);
  b.rod({ x: 0.4, y: -0.03, z: 1.13 }, { x: 0.64, y: -0.06, z: 1.74 }, 0.025, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.37, -0.02, 0.56)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.08, 0.08, 0.48, 12), steel.clone().multiplyScalar(0.6));
  b.pop();
}

interface RackLayout {
  /** Front and rear rails (z). */
  z0: number;
  z1: number;
  /** Where the three pairs of legs stand. */
  legs: number[];
  /** The clamp at the end of each leg's outrigger: its centre, out from the centreline and up. */
  clampX: number;
  clampY: number;
  /**
   * Where each leg's outrigger turns down: it cannot run straight from the post to the clamp
   * without passing through the roof's edge.
   */
  elbow: { x: number; y: number };
  /** How far the posts under the deck rail reach down past 0.15 m (negative: shorter). */
  postReach?: number;
  /** Stations of the uprights between the deck rail and the top rail. */
  posts: number[];
  /** First cross slat and how many, 0.2 m apart. */
  slat0: number;
  slats: number;
}

/**
 * The rack both 40 Series carry: 2.5 m long, for the 2.4 m recovery boards, with 28 mm
 * between each board end and the rail (on the 2.02 m rack the code-built car had until v2.27
 * they stuck out 0.2 m at both ends, through the end rails). It overhangs the windscreen and
 * the tail.
 */
const rackDeck = {
  z0: -0.53,
  z1: 1.97,
  posts: [-0.53, -0.03, 0.47, 0.97, 1.47, 1.97],
  slat0: -0.43,
  slats: 12,
};

/**
 * On the code-built 40 Series. Its hardtop cap is 0.815 m out with the gutter strip at its
 * lower edge (x 0.82, y 1.458, z -0.30 to 1.66). The posts are stubs under the deck rail that
 * stop 16 mm above the roof; each outrigger goes out over the roof's edge and down outside
 * the cap to a clamp over the gutter. Until v2.27 the posts stood 3 cm into the roof skin and
 * the outriggers ran straight to the clamps, through the cap's corner, so the three clamps a
 * side sat on the gutter with nothing reaching them. Heights are before rackDrop().
 */
const standardRack: RackLayout = {
  ...rackDeck,
  legs: [-0.2, 0.68, 1.56],
  clampX: 0.835,
  clampY: 1.545,
  elbow: { x: 0.85, y: 1.67 },
  postReach: -0.05,
};

/**
 * The Blender FJ40's rack. Its hardtop is narrower, so the clamps come in to grip the gutter
 * (x 0.763, 1.815 m above the ground). The front legs stand 0.24 m behind the snorkel's head
 * (its rear end is at z -0.255); at z -0.17 until v2.27 the clamp was 35 mm behind the head
 * and level with it, and the two read as touching. Heights are before FJ40_GEAR_DROP and
 * rackDrop().
 */
const fj40Rack: RackLayout = {
  ...rackDeck,
  legs: [-0.02, 0.76, 1.55],
  clampX: 0.778,
  clampY: 1.512,
  elbow: { x: 0.8, y: 1.7 },
  postReach: 0.03,
};

function roofGear(b: VehicleBuilder, r: RackLayout): void {
  b.push().translate(0, rackDrop(), 0);
  // Feet, basket deck, perimeter rails, uprights and tie-down rings.
  for (const x of [-0.68, 0.68]) {
    const side = Math.sign(x);
    for (const z of r.legs) {
      const reach = r.postReach ?? 0;
      b.block(x, 1.695 - reach / 2, z, 0.08, 0.15 + reach, 0.1, trim, M.Metal, Z.Roof, 0.008);
      // Out over the roof's edge, then straight down to the clamp on the gutter.
      const knee = v(side * r.elbow.x, r.elbow.y, z);
      b.rod(v(x, 1.72, z), knee, 0.013, trim, M.Metal, Z.Roof);
      b.rod(knee, v(side * (r.clampX + 0.012), r.clampY, z), 0.013, trim, M.Metal, Z.Roof);
      b.slot = M.Metal;
      b.tag = Z.Roof;
      b.push().translate(knee.x, knee.y, knee.z);
      b.geometry(new THREE.SphereGeometry(0.013, 8, 6), trim);
      b.pop();
      b.block(side * r.clampX, r.clampY, z, 0.032, 0.06, 0.1, trim, M.Metal, Z.Roof, 0.006);
    }
    b.rod({ x, y: 1.77, z: r.z0 }, { x, y: 1.77, z: r.z1 }, 0.022, trim, M.Metal, Z.Roof);
    b.rod({ x, y: 1.94, z: r.z0 }, { x, y: 1.94, z: r.z1 }, 0.018, trim, M.Metal, Z.Roof);
    for (const z of r.posts) b.rod({ x, y: 1.77, z }, { x, y: 1.94, z }, 0.012, trim, M.Metal, Z.Roof);
  }
  for (const z of [r.z0, r.z1]) {
    b.rod({ x: -0.68, y: 1.77, z }, { x: 0.68, y: 1.77, z }, 0.022, trim, M.Metal, Z.Roof);
    b.rod({ x: -0.68, y: 1.94, z }, { x: 0.68, y: 1.94, z }, 0.018, trim, M.Metal, Z.Roof);
  }
  for (let i = 0; i < r.slats; i++)
    b.block(0, 1.77, r.slat0 + i * 0.2, 1.35, 0.025, 0.028, trim, M.Metal, Z.Roof);
  // Strapped canvas luggage and a small latched toolbox leave room for both recovery planks.
  b.block(0.4, 1.91, 1.01, 0.38, 0.25, 0.71, canvas, M.Fabric, Z.Roof, 0.045);
  for (const z of [0.9, 1.3]) {
    const strap = new THREE.Shape();
    strap.moveTo(0.195, 1.75);
    strap.lineTo(0.605, 1.75);
    strap.lineTo(0.605, 1.99);
    strap.quadraticCurveTo(0.605, 2.047, 0.55, 2.047);
    strap.lineTo(0.25, 2.047);
    strap.quadraticCurveTo(0.195, 2.047, 0.195, 1.99);
    strap.closePath();
    const hole = new THREE.Path();
    hole.moveTo(0.207, 1.762);
    hole.lineTo(0.207, 1.99);
    hole.quadraticCurveTo(0.207, 2.035, 0.25, 2.035);
    hole.lineTo(0.55, 2.035);
    hole.quadraticCurveTo(0.593, 2.035, 0.593, 1.99);
    hole.lineTo(0.593, 1.762);
    hole.closePath();
    strap.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(strap, {
      depth: 0.04,
      bevelEnabled: false,
    });
    b.slot = M.Rubber;
    b.tag = Z.Roof;
    b.push().translate(0, 0, z - 0.02);
    b.geometry(g, black);
    b.pop();
    b.block(0.612, 1.93, z, 0.016, 0.055, 0.047, steel, M.Metal, Z.Roof, 0.003);
  }
  b.block(0.4, 1.87, 0.12, 0.38, 0.17, 0.57, trim, M.Metal, Z.Roof, 0.015);
  b.block(0.4, 1.963, 0.12, 0.39, 0.022, 0.59, trim, M.Metal, Z.Roof, 0.008);
  for (const z of [-0.05, 0.29]) b.block(0.6, 1.9, z, 0.012, 0.07, 0.04, steel, M.Metal, Z.Roof);
  b.rod({ x: 0.35, y: 1.995, z: 0.12 }, { x: 0.45, y: 1.995, z: 0.12 }, 0.008, steel, M.Metal, Z.Roof);
  for (const x of [0.35, 0.45]) b.block(x, 1.981, 0.12, 0.018, 0.028, 0.024, steel, M.Metal, Z.Roof, 0.003);
  b.pop();
}

/**
 * The first spare on the left-hand rear door, where the factory carrier is in
 * rear-34-left.jpg and rear-34-orange-1977.jpg, and a jerry can on the right door, clear of
 * the lamps and the bumper.
 */
function rearDoorGear(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  const sx = -0.27,
    sy = 0.86,
    sz = TAIL + 0.23;
  // Wheel carrier: a plate on the door with three studs.
  b.block(sx, sy, TAIL + 0.03, 0.26, 0.26, 0.04, bar, M.Metal, Z.Rear, 0.01);
  b.rod(v(sx, sy, TAIL + 0.03), v(sx, sy, sz - 0.13), 0.045, bar, M.Metal, Z.Rear);
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: sx, y: sy, z: sz }, 'back', black);
  // Jerry can on the right door: between the handle (to x 0.145) and the door's hinges (from
  // x 0.50), its tray 9 cm above the rear bumper's top (y 0.285) and its cap under the window
  // (from y 1.0). Until v2.27 it stood end-on in a cradle whose floor was 2 cm inside the
  // bumper's top, so the can stood on the bumper and the door could not have opened past it.
  doorCan(b, TAIL, 0.33, 0.64, 0.065);
}

/**
 * The second spare lying flat on the roof rack, held by the same centre clamp it had on
 * the bonnet. The basket is already full: recovery boards down the left and centre, a
 * toolbox and a canvas roll on the right. The plate sits on the boards, left of the roll
 * and behind the driver's eye, so the lower hub is inside the plate rather than in the
 * boards. A spine in the slot between the boards carries it from the deck, which is what
 * shows once the boards are put down on a crossing. The door spare is unchanged.
 */
function roofSpare(
  b: VehicleBuilder,
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
  /**
   * Where the clamp bar bears on the wheel: how far above the hub its underside is, and how
   * long it is. Left out, the bar sits over the code wheel's hub cap.
   */
  clamp?: { above: number; length: number; plate: number },
): void {
  const width = tuning.drawnWheels?.width ?? tuning.wheelWidth;
  const drop = rackDrop();
  const x = -0.24;
  const z = 1.02;
  const plankTop = 1.81 + drop + 0.0275;
  const deck = 1.77 + drop + 0.0125;
  const plateH = 0.058;
  const plateBottom = plankTop + 0.006;
  const base = plateBottom + plateH;
  // The tyre's sidewall rests on the plate, 4 mm clear; the hub caps sink into its middle.
  const hubY = base + spareSidewall(wheel) + 0.004;
  const top = clamp ? hubY + clamp.above : hubY + width / 2 + 0.044;
  // The slot between the boards is only 60 mm, centred at x -0.28.
  const spineTop = plateBottom + 0.012;
  const spineH = spineTop - deck;
  b.block(-0.28, deck + spineH / 2, z, 0.036, spineH, 0.32, bar, M.Metal, Z.Roof, 0.004);
  const plate = clamp?.plate ?? 0.4;
  b.block(x, plateBottom + plateH / 2, z, plate, plateH, plate, bar, M.Metal, Z.Roof, 0.008);
  b.tag = Z.Roof;
  mountSpare(b, wheel, { x, y: hubY, z }, 'up', black);
  b.rod(v(x, base, z), v(x, top + 0.04, z), 0.014, steel, M.Metal, Z.Roof);
  b.block(x, top + 0.01, z, clamp?.length ?? 0.24, 0.02, 0.06, bar, M.Metal, Z.Roof, 0.006);
  b.rod(v(x - 0.06, top + 0.04, z), v(x + 0.06, top + 0.04, z), 0.01, steel, M.Metal, Z.Roof);
}

export function addVehicleEquipment(
  b: VehicleBuilder,
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
  /** Which front guard carries the aerial: -1 left, +1 right. */
  aerialSide: -1 | 1 = -1,
): void {
  bullBar(b, tuning);
  rearBumper(b, tuning);
  chassis(b);
  roofGear(b, standardRack);
  rearDoorGear(b, wheel);
  roofSpare(b, tuning, wheel);
  // Flexible whip aerial on the guard.
  const ax = aerialSide * (HW - 0.08);
  b.block(ax, 0.655, -0.95, 0.06, 0.04, 0.06, black, M.Rubber, Z.Front);
  b.rod({ x: ax, y: 0.67, z: -0.95 }, { x: ax + aerialSide * 0.02, y: 1.5, z: -0.91 }, 0.005, trim);
}

/**
 * Safari snorkel on the left (passenger) side. Its body is a flat box on the cowl side, over
 * the vent louvres just ahead of the door, where the air goes in to the engine bay. The tube
 * leaves the top of the box and runs up the windscreen pillar, leaning back with the screen,
 * to a ram head facing forward beside the roof. Two clamps hold the tube to the pillar.
 * Until v1.85 the box sat on the wing over the tyre and the tube crossed 1.2 m of air.
 */
function fj40Snorkel(b: VehicleBuilder): void {
  // 0.825 m out: inboard of the left mirror's head (from 0.885 m) with a gap that shows from
  // the front, and clear of the gutter (0.763 m) and the rack's clamps.
  const x = -0.825;
  const rubber = new THREE.Color('#202325');
  // Cowl side skin is at x -0.775, z -0.66..-0.30; the louvres are at z -0.50..-0.40.
  b.block(-0.825, 0.535, -0.48, 0.1, 0.27, 0.16, rubber, M.Rubber, Z.Front, 0.02);
  // The screen's face leans from z -0.33 at the belt to -0.26 at the gutter; the tube stays
  // 55 mm ahead of it and outboard of the frame.
  tubePath(b, [v(x, 0.62, -0.465), v(x, 0.76, -0.41), v(x, 0.84, -0.385), v(x, 1.36, -0.315)], 0.042, rubber);
  b.slot = M.Rubber;
  b.tag = Z.Front;
  b.push()
    .translate(x, 1.395, -0.375)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.046, 0.058, 0.17, 12), rubber);
  b.pop();
  // The head's mouth: a grey mesh disc set in its front face.
  b.slot = M.Metal;
  b.push()
    .translate(x, 1.395, -0.462)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 12), steel.clone().multiplyScalar(0.55));
  b.pop();
  // Each clamp is a band round the tube and a strap back to the pillar's front corner.
  for (const y of [0.95, 1.24]) {
    const tz = -0.385 + ((y - 0.84) / 0.52) * 0.07;
    b.ring(x, y, tz, 0.045, 0.008, steel, M.Metal, 'y', Z.Front);
    b.rod(v(x + 0.03, y, tz + 0.02), v(-0.745, y, tz + 0.085), 0.012, steel, M.Metal, Z.Front);
  }
}

/** Two round lamps on stalks off the bull bar's hoop, lenses facing forward. */
function fj40Spots(b: VehicleBuilder): void {
  // Clear glass: a cream lens was the body's colour and read as an empty ring.
  const lens = new THREE.Color('#E6ECEE');
  for (const lamp of fj40DrivingLamps) {
    // From the centre of the bar's side rail (y 0.69, z -1.794), so no end shows under it.
    b.rod(v(lamp.x, 0.69, -1.794), v(lamp.x, lamp.y, lamp.z + 0.02), 0.014, bar, M.Metal, Z.Front);
    b.slot = M.Metal;
    b.tag = Z.Front;
    b.push()
      .translate(lamp.x, lamp.y, lamp.z + 0.03)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.05, 0.055, 0.07, 12), bar);
    b.pop();
    // A round lens just proud of the housing's rim (a square one lay in the rim's plane).
    b.slot = M.DrivingLamp;
    b.push()
      .translate(lamp.x, lamp.y, lamp.z - 0.009)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.047, 0.047, 0.008, 16), lens);
    b.pop();
  }
}

/** A rubber flap hung just behind a tyre, its top tucked into the sill. */
function fj40Flap(b: VehicleBuilder, x: number, z: number): void {
  b.block(x, -0.06, z, 0.18, 0.34, 0.012, black, M.Rubber, Z.Trim);
}

/**
 * Jerry can on the right barn door, its broad side flat against the door skin (on the Blender
 * FJ40 it stood end-on until v1.85 and was the rearmost point of the car). It stands in a tray
 * that two flat bars behind the can bolt to the door, with a stay under each side and a strap
 * round it. The whole holder is on the door and swings with it. `door` is the door skin's z,
 * (x, y) the can's centre, and `stay` how far below the tray each stay meets the door.
 */
function doorCan(b: VehicleBuilder, door: number, x: number, y: number, stay: number): void {
  const z = door + 0.03 + 0.08;
  b.block(x, y - 0.25, door + 0.1, 0.34, 0.03, 0.2, bar, M.Metal, Z.Rear, 0.004);
  for (const dx of [-0.12, 0.12]) {
    b.block(x + dx, y, door + 0.015, 0.035, 0.5, 0.03, bar, M.Metal, Z.Rear);
    // A stay under the tray, from its outer edge back to the door.
    b.rod(
      v(x + dx, y - 0.265, door + 0.19),
      v(x + dx, y - 0.265 - stay, door + 0.012),
      0.009,
      bar,
      M.Metal,
      Z.Rear,
    );
  }
  b.push()
    .translate(x, y, z)
    .rotate(0, -Math.PI / 2, 0);
  jerryCan(b, 0, 0, 0, { colour: new THREE.Color('#667258'), zone: Z.Rear, width: 0.16, ribX: 0.08 });
  b.pop();
  // Strap: across the back of the can and down both sides to the bars.
  b.block(x, y + 0.03, z + 0.085, 0.36, 0.03, 0.01, black, M.Rubber, Z.Rear);
  for (const dx of [-0.175, 0.175])
    b.block(x + dx, y + 0.03, door + 0.1, 0.01, 0.03, 0.2, black, M.Rubber, Z.Rear);
}

/**
 * What holds the door spare: a swing-away carrier, as rear-34-left.jpg has. It is a frame
 * hinged at two brackets on the fixed left corner of the body: a lower arm along the rear sill,
 * under the doors and the tail lamps, to a catch on the rear bar, and an upper arm between the
 * left door's two hinges. A post stands on the lower arm, between the door skin and the tyre
 * (a 40 mm gap), up to a plate and boss behind the wheel's centre. A stud from the boss comes
 * out through the wheel's centre, where a bar across the rim and a tee handle clamp the wheel
 * on, as on the roof spare. Nothing is fixed to a door: the carrier swings clear of both before
 * they open, so the spare may stand across their seam. Until v2.27 there was no upper arm and
 * no clamp, and everything above the sill was hidden behind the tyre: from behind, the wheel
 * showed a post under its tread and nothing else. Heights are at the body's stock height (the
 * caller lifts them with the body).
 */
function fj40SpareCarrier(b: VehicleBuilder): void {
  const y = 0.1,
    z = 1.925,
    x = -0.365,
    hub = 0.738;
  // The spare's hub plane (the Blender wheel, moved by SPARE_SHIFT in fj40Glb.ts).
  const hubZ = 2.05;
  // The body's rear corner is round (0.2 m): at x -0.69 its skin is at z 1.85.
  b.block(-0.69, y, 1.895, 0.07, 0.1, 0.1, bar, M.Metal, Z.Rear, 0.004);
  // Arm and post are 50 mm box section; the post is 30 mm deep to pass between door and tyre.
  b.block((-0.69 + 0.12) / 2, y, z, 0.81, 0.05, 0.035, bar, M.Metal, Z.Rear, 0.004);
  // The catch stands on the front of the rear bar, which is the chassis's.
  b.block(0.12, y, 1.94, 0.05, 0.05, 0.04, bar, M.Metal, Z.Rear, 0.004);
  b.block(x, (y + hub) / 2 + 0.01, 1.908, 0.06, hub - y + 0.02, 0.03, bar, M.Metal, Z.Rear, 0.004);
  // A gusset from the arm up to the post on each side.
  for (const dx of [-0.16, 0.16]) b.rod(v(x + dx, y, z), v(x, y + 0.2, 1.908), 0.012, bar, M.Metal, Z.Rear);
  // The upper hinge bracket and arm, in the clear band between the door's hinges (which
  // stand at y 0.34 to 0.46 and 0.66 to 0.78 here).
  const upper = 0.56;
  b.block(-0.69, upper, 1.895, 0.07, 0.08, 0.1, bar, M.Metal, Z.Rear, 0.004);
  b.block((-0.69 + x) / 2, upper, 1.908, x + 0.69, 0.04, 0.03, bar, M.Metal, Z.Rear, 0.004);
  b.block(x, hub, 1.918, 0.15, 0.15, 0.02, bar, M.Metal, Z.Rear, 0.004);
  b.rod(v(x, hub, 1.92), v(x, hub, 2.03), 0.05, bar, M.Metal, Z.Rear);
  // The clamp on the wheel's face. The rim's flange is 0.21 m out and 96 mm behind the hub's
  // plane; the bar spans it, 2 mm clear, held by the stud's tee handle.
  const face = hubZ + 0.098;
  b.rod(v(x, hub, 2.03), v(x, hub, face + 0.05), 0.014, steel, M.Metal, Z.Rear);
  b.block(x, hub, face + 0.01, 0.44, 0.06, 0.02, bar, M.Metal, Z.Rear, 0.006);
  b.rod(v(x - 0.06, hub, face + 0.04), v(x + 0.06, hub, face + 0.04), 0.01, steel, M.Metal, Z.Rear);
}

/** Rear bar under the lamps, with the plate on the right (the spare takes the left) and a tow ball. */
function fj40RearBar(b: VehicleBuilder): void {
  // Under the tail lamps (their housings start at y 0.19) and clear of the door spare above.
  const y = 0.095;
  b.block(0, y, 2.0, 1.55, 0.12, 0.1, bar, M.Metal, Z.Rear, 0.012);
  for (const x of [-0.5, 0.5]) b.block(x, y, 1.92, 0.06, 0.08, 0.12, bar, M.Metal, Z.Rear);
  numberPlate(b, 0.48, y + 0.022, 2.06, 1, 'FJ-40', black);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(0, y + 0.07, 2.02);
  b.geometry(new THREE.SphereGeometry(0.028, 10, 8), steel);
  b.pop();
}

/**
 * Touring kit on the Blender FJ40: the code car's bull bar (shackles and front plate) with the
 * winch sunk into it, driving lamps, a snorkel, mud flaps, a rear bar and a jerry can. The
 * rack is this car's own layout (fj40Rack), dropped onto its lower roof. The grille's TOYOTA
 * is the model's badge; a second one stroked over it was removed in v1.85.
 */
export function addFj40GlbEquipment(
  b: VehicleBuilder,
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
): void {
  bullBar(b, tuning, true);
  fj40Spots(b);
  fj40RearBar(b);
  // Everything bolted to the body stands FJ40_BODY_LIFT higher with it; the bars are on the
  // chassis at the height the winch and the tow point need.
  b.push().translate(0, FJ40_BODY_LIFT, 0);
  fj40Snorkel(b);
  for (const x of [-0.7, 0.7]) {
    // 12 cm behind each tyre, at the rear edge of its arch.
    fj40Flap(b, x, -0.645);
    fj40Flap(b, x, 1.655);
  }
  // The right door runs from the centre seam to x 0.52 and its handle ends at x 0.15: the can
  // is clear of the handle, the door's outer edge, its window above and the spare.
  doorCan(b, 1.89, 0.35, 0.54, 0.135);
  fj40SpareCarrier(b);
  // Whip aerial on the flat top of the left wing (0.99 m above the ground at stock height,
  // x 0.50 to 0.67). Until v1.85 its base hung 0.3 m above the wing, beside the bonnet.
  b.block(-0.61, 0.49, -1.02, 0.05, 0.03, 0.05, black, M.Rubber, Z.Front);
  b.rod({ x: -0.61, y: 0.5, z: -1.02 }, { x: -0.63, y: 1.3, z: -0.98 }, 0.005, trim);
  b.pop();
  b.push().translate(0, FJ40_GEAR_DROP, 0);
  roofGear(b, fj40Rack);
  // The Blender wheel's rim flange is 0.21 m out and 93 mm above the hub's plane: the bar
  // spans it and bears on the tyre's bead on both sides.
  // The plate is 0.62 m square, out to where the sidewall is widest, so the tyre is seen to
  // rest on it; on the standard 0.4 m plate it looked held up by a block under its middle.
  roofSpare(b, tuning, wheel, { above: 0.098, length: 0.44, plate: 0.62 });
  b.pop();
}

export function buildRackPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  b.push().translate(0, rackDrop(), 0);
  const wood = pal('barkOchre');
  const x = index === 0 ? -0.46 : -0.1;
  // 2.4 m long, from z -0.48 to 1.92: inside the rack's end rails (-0.53 and 1.97).
  const mid = 0.72;
  b.block(x, 1.81, mid, 0.3, 0.055, 2.4, wood, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.12 + i * 0.075,
      1.84,
      mid,
      0.004,
      0.003,
      2.34,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  // Each strap goes round the board and the cross slat under it (slats at z -0.03 and 1.37).
  for (const z of [-0.03, 1.37]) {
    b.block(x, 1.846, z, 0.305, 0.015, 0.045, black, M.Rubber, Z.Roof);
    for (const side of [-1, 1]) b.block(x + side * 0.156, 1.8, z, 0.012, 0.1, 0.045, black, M.Rubber, Z.Roof);
    b.block(x, 1.752, z, 0.325, 0.012, 0.045, black, M.Rubber, Z.Roof);
    b.block(x + 0.13, 1.855, z, 0.035, 0.012, 0.055, steel, M.Metal, Z.Roof);
  }
  b.pop();
  return cleanGeometry(b.build());
}
