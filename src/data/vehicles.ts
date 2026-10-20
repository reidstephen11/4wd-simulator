import { camelTuning } from './camel';
import { patrolTuning } from './patrol';
import { perentieTuning } from './perentie';
import { vehicleTuning, type VehicleId, type VehicleTuning } from './vehicle';

type Point = { x: number; y: number; z: number };

export interface DialLayout {
  /** Centre across the dash (local x). */
  x: number;
  radius: number;
  /** Full-scale value, and the spacing of long and short graduations. */
  max: number;
  major: number;
  minor: number;
}

/** Where the driver sits and what they look at (vehicle frame, right-hand drive). */
export interface CabinLayout {
  /** Driver's eye for the cockpit camera, and how far it looks down at rest (rad). */
  eye: Point;
  pitch: number;
  /** Dial centres share a height and a face plane facing the driver (+z). */
  dialY: number;
  dialZ: number;
  dials: { speed: DialLayout; rpm: DialLayout; oil: DialLayout };
  /**
   * Warning lamps in a row: low range, front and rear lockers, crawl control, engine
   * stopped, handbrake on, high beam.
   */
  lamps: { xs: readonly number[]; y: number; z: number };
  /**
   * The handbrake as the driver sees it: a lever on the tunnel that swings up about
   * `base` (x axis) through `travel` radians, or a T-handle under the dash that pulls
   * out `travel` metres towards the driver. `tip` is the grip with the brake on.
   */
  handbrake: { kind: 'lever' | 'pull'; base: Point; tip: Point; travel: number };
  steeringWheel: {
    centre: Point;
    columnBase: Point;
    radius: number;
    /** Steering-wheel turn per degree at the front wheels. */
    ratio: number;
    spokes: 3 | 4;
  };
}

export interface VehicleDef {
  tuning: VehicleTuning;
  /** One line for the vehicle menu. */
  blurb: string;
  cabin: CabinLayout;
}

/** The short-wheelbase 4WD's cab, shared by its Camel Trophy version. */
const shortieCabin: CabinLayout = {
  eye: { x: 0.38, y: 1.24, z: 0.3 },
  // Looking down a little shows the bonnet and the ground ahead.
  pitch: -0.12,
  dialY: 0.88,
  dialZ: -0.322,
  dials: {
    speed: { x: 0.36, radius: 0.068, max: 140, major: 20, minor: 10 },
    rpm: { x: 0.215, radius: 0.039, max: 5000, major: 1000, minor: 500 },
    oil: { x: 0.5, radius: 0.039, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.19, 0.255, 0.32, 0.385, 0.45, 0.515, 0.58], y: 0.795, z: -0.33 },
  // A pull handle under the dash, left of the column.
  handbrake: {
    kind: 'pull',
    base: { x: 0.17, y: 0.7, z: -0.36 },
    tip: { x: 0.17, y: 0.69, z: -0.22 },
    travel: 0.1,
  },
  steeringWheel: {
    centre: { x: 0.38, y: 0.93, z: -0.08 },
    columnBase: { x: 0.38, y: 0.68, z: -0.46 },
    radius: 0.19,
    // Full lock is about 1¼ turns.
    ratio: 13,
    spokes: 3,
  },
};

export const vehicles: Record<VehicleId, VehicleDef> = {
  shortie: {
    tuning: vehicleTuning,
    blurb: '1970s-style short-wheelbase 4WD, 4.2 L petrol six, three-speed automatic.',
    cabin: shortieCabin,
  },
  camel: {
    tuning: camelTuning,
    blurb: 'The short-wheelbase 4WD in Camel Trophy yellow, with roof lamps and a snorkel.',
    cabin: shortieCabin,
  },
  perentie: {
    tuning: perentieTuning,
    blurb: 'Army Land Rover 110 soft top from Bush Tucker Man, 3.9 L Isuzu diesel, four-speed.',
    cabin: {
      // Upright seat high on the seat box, close to the door and the screen's top rail.
      eye: { x: 0.42, y: 1.24, z: 0.04 },
      pitch: -0.22,
      dialY: 0.86,
      dialZ: -0.468,
      dials: {
        speed: { x: 0.42, radius: 0.062, max: 160, major: 20, minor: 10 },
        rpm: { x: 0.29, radius: 0.04, max: 5000, major: 1000, minor: 500 },
        oil: { x: 0.55, radius: 0.04, max: 1, major: 0.5, minor: 0.25 },
      },
      lamps: { xs: [0.28, 0.335, 0.39, 0.445, 0.5, 0.555, 0.61], y: 0.775, z: -0.466 },
      // The transmission handbrake lever on the tunnel beside the driver.
      handbrake: {
        kind: 'lever',
        base: { x: 0.22, y: 0.47, z: -0.08 },
        tip: { x: 0.21, y: 0.67, z: -0.21 },
        travel: 0.6,
      },
      steeringWheel: {
        centre: { x: 0.42, y: 0.86, z: -0.24 },
        columnBase: { x: 0.42, y: 0.516, z: -0.479 },
        radius: 0.205,
        // Power steering, about 1½ turns to full lock.
        ratio: 17,
        spokes: 4,
      },
    },
  },
  patrol: {
    tuning: patrolTuning,
    blurb: 'GQ Patrol wagon, 4.2 L TD42 diesel, five-speed, coil springs, bull bar, snorkel and roof rack.',
    cabin: {
      // A bucket seat behind a wide, flat bonnet; the screen leans back over the dash.
      eye: { x: 0.42, y: 1.12, z: 0.02 },
      pitch: -0.16,
      dialY: 0.84,
      dialZ: -0.47,
      dials: {
        speed: { x: 0.5, radius: 0.058, max: 180, major: 20, minor: 10 },
        rpm: { x: 0.34, radius: 0.058, max: 5000, major: 1000, minor: 500 },
        oil: { x: 0.21, radius: 0.032, max: 1, major: 0.5, minor: 0.25 },
      },
      lamps: { xs: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55], y: 0.765, z: -0.462 },
      // A T-handle under the dash, left of the column, as on Nissan's 4WDs of the time.
      handbrake: {
        kind: 'pull',
        base: { x: 0.2, y: 0.6, z: -0.53 },
        tip: { x: 0.2, y: 0.59, z: -0.39 },
        travel: 0.1,
      },
      steeringWheel: {
        centre: { x: 0.42, y: 0.86, z: -0.24 },
        columnBase: { x: 0.42, y: 0.6, z: -0.55 },
        radius: 0.19,
        // Power steering, about 1½ turns to full lock.
        ratio: 17,
        spokes: 4,
      },
    },
  },
};

export const vehicleOrder: readonly VehicleId[] = ['shortie', 'camel', 'perentie', 'patrol'];

export function isVehicleId(x: unknown): x is VehicleId {
  return typeof x === 'string' && x in vehicles;
}
