import * as THREE from 'three';
import { seventyCabin, type CabinLayout } from '../data/vehicles';
import { troopyColors } from './troopyPaint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The Troop Carrier's cab: two cloth seats, a flat steel dash with a padded top and the
 * instrument binnacle in front of the right-hand driver, a four-spoke wheel, the gear and
 * transfer levers on the tunnel, pendant pedals, painted steel doors with vinyl trims, and
 * behind the seats the long load space with a bench along each side (the handbrake lever
 * moves: see vehicleInstruments.ts). The LC79 shares the cab: it passes its own paint and
 * leaves out the load space (`cabOnly`).
 */
export interface SeventyCabFit {
  /** The dials, wheel and levers, where the game also draws the moving parts. */
  cabin: CabinLayout;
  /** How far the dash is lowered and moved back from the LC79's place for it. */
  dash: { down: number; back: number };
  /** How far the seats and the gear levers are lowered. */
  seatDown: number;
  /** The door trims: how far lowered, and their middle and length along the car. */
  door: { down: number; z: number; length: number };
  /** The sun visors' height and place along the car. */
  visor: { y: number; z: number };
  /** Where the wagon's flat headlining starts. */
  liningFront: number;
  /** The footwell bulkhead: its place along the car and its top. */
  bulkhead: { z: number; top: number };
}
/** The cab as the LC79 uses it, and as the Troop Carrier did until v2.08. */
const TALL_CAB: SeventyCabFit = {
  cabin: seventyCabin,
  dash: { down: 0, back: 0 },
  seatDown: 0,
  door: { down: 0, z: -0.42, length: 0.96 },
  visor: { y: 1.48, z: -0.68 },
  liningFront: -0.75,
  bulkhead: { z: -0.97, top: 0.83 },
};
export function addTroopyInterior(
  b: VehicleBuilder,
  redlineRpm: number,
  paint = troopyColors.paint,
  cabOnly = false,
  fit: SeventyCabFit = TALL_CAB,
): void {
  const cabin = fit.cabin;
  const { vinyl, chrome } = troopyColors;
  const dark = new THREE.Color('#2A2C2B'),
    mat = new THREE.Color('#1D1F1E'),
    metal = new THREE.Color('#8A8E86'),
    cloth = new THREE.Color('#5B5D5A'),
    trim = new THREE.Color('#6C6D68'),
    radio = new THREE.Color('#151716');
  const floor = 0.16;
  // Floor mat, the transmission tunnel and the footwell bulkhead.
  b.block(0, floor, -0.35, 1.7, 0.03, 1.3, mat, M.Rubber, Z.Trim);
  b.block(0, floor + 0.09, -0.48, 0.34, 0.16, 0.8, mat, M.Rubber, Z.Trim, 0.04);
  b.block(
    0,
    (0.17 + fit.bulkhead.top) / 2,
    fit.bulkhead.z,
    1.7,
    fit.bulkhead.top - 0.17,
    0.03,
    paint.clone().multiplyScalar(0.7),
    M.Paint,
    Z.Trim,
  );
  // Dash: the steel lower panel, the padded top under the screen, and the binnacle.
  b.push().translate(0, -fit.dash.down, fit.dash.back);
  b.block(0, 0.8, -0.78, 1.7, 0.2, 0.3, paint.clone().multiplyScalar(0.85), M.Paint, Z.Trim, 0.02);
  b.block(0, 0.915, -0.8, 1.72, 0.05, 0.36, vinyl, M.Rubber, Z.Trim, 0.025);
  // Wide enough for the oil gauge on its right: at 0.44 m the gauge hung off the housing's edge.
  b.block(0.42, 1.0, -0.66, 0.5, 0.2, 0.12, dark, M.Rubber, Z.Trim, 0.02);
  b.block(0.42, 1.11, -0.63, 0.52, 0.03, 0.15, vinyl, M.Rubber, Z.Trim, 0.012);
  b.pop();
  addDialFaces(b, cabin, redlineRpm);
  b.push().translate(0, -fit.dash.down, fit.dash.back);
  // Glovebox lid on the passenger side, the radio and heater slides in the middle.
  b.block(-0.45, 0.8, -0.628, 0.4, 0.14, 0.012, trim, M.Rubber, Z.Trim, 0.008);
  b.block(-0.45, 0.84, -0.62, 0.06, 0.016, 0.01, chrome, M.Metal, Z.Trim, 0.004);
  b.block(-0.02, 0.84, -0.628, 0.2, 0.05, 0.012, radio, M.Rubber, Z.Trim, 0.006);
  b.block(-0.02, 0.84, -0.62, 0.12, 0.02, 0.006, chrome, M.Metal, Z.Trim);
  b.block(-0.02, 0.75, -0.628, 0.24, 0.05, 0.012, dark, M.Rubber, Z.Trim, 0.006);
  for (const x of [-0.08, 0.0, 0.08])
    b.block(x - 0.02, 0.755, -0.62, 0.014, 0.022, 0.012, metal, M.Metal, Z.Trim);
  b.pop();
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle pedals.
  for (const [x, w] of [
    [0.25, 0.07],
    [0.4, 0.08],
    [0.54, 0.05],
  ]) {
    b.rod({ x, y: 0.7, z: -0.86 }, { x, y: floor + 0.16, z: -0.76 }, 0.009, metal);
    b.block(x, floor + 0.15, -0.75, w, 0.08, 0.015, dark, M.Rubber, Z.Trim);
  }
  // Two cloth seats on boxes, with headrests.
  const sd = fit.seatDown;
  for (const x of [-0.42, 0.42]) {
    b.block(x, floor + 0.2 - sd / 2, 0.06, 0.6, 0.36 - sd, 0.48, dark, M.Rubber, Z.Trim, 0.02);
    b.block(x, floor + 0.44 - sd, 0.04, 0.54, 0.12, 0.52, cloth, M.Fabric, Z.Trim, 0.045);
    b.seatBack(x, floor + 0.771 - sd, 0.2525, 0.14);
    b.block(0, 0, 0, 0.52, 0.6, 0.12, cloth, M.Fabric, Z.Trim, 0.04);
    b.block(0, 0.4, 0, 0.3, 0.18, 0.1, cloth, M.Fabric, Z.Trim, 0.04);
    b.pop();
  }
  // Five-speed gear lever and the transfer lever beside it.
  for (const [x, top, z, knob] of [
    [0.06, 0.72 - sd, -0.42, dark],
    [-0.07, 0.62 - sd, -0.44, dark],
  ] as const) {
    b.rod({ x, y: floor + 0.16, z: -0.56 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), knob);
    b.pop();
  }
  b.block(0, floor + 0.18, -0.55, 0.26, 0.04, 0.16, mat, M.Rubber, Z.Trim, 0.03);
  // Door trims with a pull handle and a window winder; the painted inner skin above them.
  for (const side of [-1, 1]) {
    const x = side * 0.8;
    b.push().translate(0, -fit.door.down, fit.door.z + 0.42);
    b.block(x, 0.52, -0.42, 0.02, 0.56, fit.door.length, trim, M.Fabric, Z.Trim, 0.01);
    b.block(x, 0.83, -0.42, 0.025, 0.05, fit.door.length + 0.06, paint, M.Paint, Z.Trim, 0.01);
    b.block(x - side * 0.02, 0.66, -0.24, 0.025, 0.04, 0.2, dark, M.Rubber, Z.Trim, 0.01);
    b.rod(
      { x: x - side * 0.015, y: 0.58, z: -0.58 },
      { x: x - side * 0.05, y: 0.58, z: -0.58 },
      0.007,
      metal,
    );
    b.rod({ x: x - side * 0.05, y: 0.58, z: -0.58 }, { x: x - side * 0.05, y: 0.51, z: -0.54 }, 0.006, metal);
    b.pop();
  }
  // Sun visors under the front of the roof.
  for (const x of [-0.42, 0.42])
    b.block(x, fit.visor.y, fit.visor.z, 0.38, 0.012, 0.12, trim, M.Fabric, Z.Trim, 0.005);
  if (cabOnly) {
    // The single cab's back wall close behind the seats, and a short headlining.
    b.block(0, 0.85, 0.42, 1.6, 1.3, 0.02, paint.clone().multiplyScalar(0.7), M.Paint, Z.Trim);
    b.block(0, 1.49, -0.15, 1.6, 0.008, 1.1, new THREE.Color('#C4BDAA'), M.Fabric, Z.Trim);
    return;
  }
  const inner = paint.clone().multiplyScalar(0.82);
  // A load floor and closed wheel boxes, with benches supported above them.
  b.block(0, floor, 1.49, 1.0, 0.03, 1.23, mat, M.Rubber, Z.Trim);
  for (const [z0, z1] of [
    [0.25, 0.875],
    [2.105, 2.55],
  ])
    b.block(0, floor, (z0 + z1) / 2, 1.6, 0.03, z1 - z0, mat, M.Rubber, Z.Trim);
  for (const side of [-1, 1]) {
    const low = floor,
      top = 0.455;
    // The box's wall is inboard of the dark wheelhouse wall (0.52 m out): at 0.55 m its painted
    // face showed through the wheel opening from outside.
    b.block(side * 0.5, (low + top) / 2, 1.49, 0.02, top - low, 1.23, inner, M.Paint, Z.Trim);
    b.block(side * 0.66, top, 1.49, 0.33, 0.02, 1.23, inner, M.Paint, Z.Trim);
    for (const z of [0.875, 2.105])
      b.block(side * 0.66, (low + top) / 2, z, 0.33, top - low, 0.02, inner, M.Paint, Z.Trim);
    b.block(side * 0.62, floor + 0.38, 1.6, 0.3, 0.08, 1.6, vinyl, M.Fabric, Z.Trim, 0.03);
    for (const z of [0.84, 2.3]) b.block(side * 0.62, 0.33, z, 0.035, 0.34, 0.05, dark, M.Metal, Z.Trim);
    b.block(side * 0.65, 0.485, 1.49, 0.08, 0.04, 0.5, dark, M.Metal, Z.Trim);
    b.block(side * 0.78, floor + 0.72, 1.6, 0.06, 0.5, 1.6, vinyl, M.Fabric, Z.Trim, 0.03);
  }
  // The headlining.
  b.block(
    0,
    1.49,
    (fit.liningFront + 2.55) / 2,
    1.6,
    0.008,
    2.55 - fit.liningFront,
    new THREE.Color('#C4BDAA'),
    M.Fabric,
    Z.Trim,
  );
}
