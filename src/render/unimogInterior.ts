import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { unimogColors } from './unimogPaint';
import { CAB } from './unimogLayout';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The Unimog's cab (its walls in unimogLayout.ts): a flat steel dash across the cab under
 * the screen with the dials in front of the right-hand driver, two seats against the
 * rear wall either side of the gearbox hump with its row of levers (gears, the field and
 * road groups, the lockers and the power take-off), a big wheel on a steep column, floor
 * pedals, and painted door skins (the handbrake lever moves: see vehicleInstruments.ts).
 */
export function addUnimogInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.unimog.cabin;
  const { paint, vinyl } = unimogColors;
  const { front, back, floor, waist, roof } = CAB;
  const mid = (front + back) / 2,
    len = back - front;
  const dark = new THREE.Color('#252726'),
    mat = new THREE.Color('#1D1F1E'),
    metal = new THREE.Color('#8A8E86'),
    inner = paint.clone().multiplyScalar(0.8);
  // Rubber floor mat and the gearbox hump between the seats.
  b.block(0, floor + 0.036, mid, 2.1, 0.012, len - 0.05, mat, M.Rubber, Z.Trim);
  b.block(0, floor + 0.12, mid - 0.05, 0.46, 0.26, 0.9, inner, M.Paint, Z.Trim, 0.04);
  // The firewall: the cab's front wall from the floor up to the bonnet's top at the cowl, between
  // the side skins. Without it the footwells opened into the engine bay and the ground showed
  // under the dash (v2.27).
  b.block(
    0,
    (floor - 0.02 + 1.1) / 2,
    front + 0.015,
    2 * CAB.side - 0.08,
    1.1 - floor + 0.02,
    0.02,
    inner,
    M.Paint,
    Z.Trim,
  );
  // Dash: a steel panel across the cab under the screen, its top at the waist, and its top rail.
  const dashZ = front + 0.18;
  b.block(0, waist - 0.16, dashZ, 2.1, 0.32, 0.25, inner, M.Paint, Z.Trim, 0.02);
  b.block(0, waist + 0.01, dashZ - 0.05, 2.1, 0.04, 0.24, dark, M.Rubber, Z.Trim, 0.015);
  b.block(0.5, waist - 0.13, cabin.dialZ - 0.008, 0.5, 0.22, 0.006, dark, M.Rubber, Z.Trim);
  addDialFaces(b, cabin, redlineRpm);
  // Switches and a placard on the passenger side.
  for (let i = 0; i < 5; i++) {
    b.slot = M.Metal;
    b.tag = Z.Trim;
    b.push()
      .translate(-0.15 - i * 0.08, waist - 0.13, cabin.dialZ - 0.005)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 10), metal);
    b.pop();
  }
  b.block(
    -0.6,
    waist - 0.21,
    cabin.dialZ - 0.008,
    0.3,
    0.12,
    0.006,
    new THREE.Color('#C9C3A6'),
    M.Fabric,
    Z.Trim,
  );
  // The column stands on the floor behind the dash, as the 435's does, between the clutch and
  // brake pedals (the brake pedal stood right behind it at x 0.52).
  addSteeringColumn(b, cabin);
  // Floor-hinged clutch, brake and throttle pedals.
  for (const [x, w] of [
    [0.34, 0.08],
    [0.6, 0.09],
    [0.74, 0.06],
  ]) {
    b.rod({ x, y: floor + 0.02, z: dashZ + 0.15 }, { x, y: floor + 0.14, z: dashZ + 0.27 }, 0.01, metal);
    b.block(x, floor + 0.14, dashZ + 0.29, w, 0.1, 0.02, dark, M.Rubber, Z.Trim);
  }
  // The levers on the hump: the gear lever, then the group, locker and take-off levers.
  for (const [x, top, z, knob] of [
    [0.1, floor + 0.6, mid - 0.05, dark],
    [-0.02, floor + 0.44, mid - 0.15, new THREE.Color('#9C3A2C')],
    [-0.1, floor + 0.4, mid - 0.1, new THREE.Color('#D2B33A')],
    [-0.16, floor + 0.38, mid - 0.02, dark],
  ] as const) {
    b.rod({ x, y: floor + 0.25, z: z + 0.1 }, { x, y: top, z }, 0.01, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.025, 12, 8), knob);
    b.pop();
  }
  // Two seats with high backs against the rear wall. The cushion's top is 0.28 m above the
  // floor (y 0.82): 0.70 m under the driver's eye and 0.89 m under the lining, and 0.2 m under
  // the steering wheel's lower rim, which rested on the cushion's front when its top was at 0.97.
  for (const x of [0.5, -0.55]) {
    b.block(x, floor + 0.085, back - 0.35, 0.42, 0.17, 0.36, dark, M.Metal, Z.Trim);
    b.block(x, floor + 0.22, back - 0.42, 0.52, 0.12, 0.5, vinyl, M.Fabric, Z.Trim, 0.04);
    b.seatBack(x, floor + 0.55, back - 0.115, 0.12);
    b.block(0, 0, 0, 0.52, 0.68, 0.1, vinyl, M.Fabric, Z.Trim, 0.04);
    b.pop();
  }
  // Painted inner door skins with a pull handle; the lining overhead.
  for (const side of [-1, 1]) {
    const x = side * (CAB.side - 0.03);
    b.block(x, floor + 0.28, mid, 0.02, 0.6, len - 0.1, inner, M.Paint, Z.Trim, 0.01);
    b.rod(
      { x: x - side * 0.02, y: floor + 0.46, z: mid + 0.1 },
      { x: x - side * 0.02, y: floor + 0.46, z: mid + 0.35 },
      0.012,
      dark,
    );
  }
  b.block(
    0,
    roof - 0.05,
    mid + 0.07,
    2.14,
    0.008,
    len - 0.1,
    unimogColors.canvas.clone().multiplyScalar(0.8),
    M.Fabric,
    Z.Trim,
  );
}
