import { camelTuning } from './camel';
import { hiluxTuning } from './hilux';
import { hj60Cabin, hj60Tuning } from './hj60';
import { LC79_CAB_LIFT, lc79Tuning } from './lc79';
import { mqCabin, mqTuning } from './mq';
import { patrolTuning } from './patrol';
import { rangieCabin, rangieTuning } from './rangie';
import { sooty80Cabin, sooty80Tuning } from './sooty80';
import { perentieTuning } from './perentie';
import { TROOPY_START_FUEL, troopyTuning } from './troopy';
import { unimogTuning } from './unimog';
import { UTE_CAB_SHIFT, ute40Tuning } from './ute40';
import { xtracabTuning } from './xtracab';
import type { EpisodeLoadout } from './episodes';
import { fortyTuning, vehicleTuning, type VehicleId, type VehicleTuning } from './vehicle';

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
    spokes: 2 | 3 | 4;
  };
}

export interface VehicleDef {
  tuning: VehicleTuning;
  /** One line for the vehicle menu. */
  blurb: string;
  cabin: CabinLayout;
  /**
   * How much further back and higher the outside camera views sit than for the short 4WD,
   * so a big vehicle fits the screen (1 when left out).
   */
  cameraScale?: number;
  /** Carried on top of the episode's load: fuel in a second tank (L). */
  extraLoad?: { fuel: number };
}

/** The short-wheelbase 4WD's cab, shared by its Camel Trophy version and the 40 Series ute. */
export const shortieCabin: CabinLayout = {
  eye: { x: 0.38, y: 1.24, z: 0.44 },
  // Looking down a little shows the bonnet and the ground ahead.
  pitch: -0.12,
  dialY: 0.88,
  dialZ: -0.182,
  dials: {
    speed: { x: 0.36, radius: 0.068, max: 140, major: 20, minor: 10 },
    rpm: { x: 0.215, radius: 0.039, max: 5000, major: 1000, minor: 500 },
    oil: { x: 0.5, radius: 0.039, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.19, 0.255, 0.32, 0.385, 0.45, 0.515, 0.58], y: 0.795, z: -0.19 },
  // A pull handle under the dash, left of the column.
  handbrake: {
    kind: 'pull',
    base: { x: 0.17, y: 0.7, z: -0.22 },
    tip: { x: 0.17, y: 0.69, z: -0.08 },
    travel: 0.1,
  },
  steeringWheel: {
    centre: { x: 0.38, y: 0.93, z: 0.06 },
    columnBase: { x: 0.38, y: 0.68, z: -0.32 },
    radius: 0.19,
    // Full lock is about 1¼ turns.
    ratio: 13,
    spokes: 3,
  },
};

/**
 * How far the Blender FJ40's body stands above where its own hubs would put it (v1.86). At
 * the model's stock height the roof was 1.95 m and the front tyres were 9 cm under the wings.
 * Toyota's figure for the 1970s hardtop is 2,000 mm, and the photographs show 13 to 15 cm
 * over the front tyres. 42 mm more puts the roof at 1.99 m and that gap at 13 cm. The body,
 * the cab and everything bolted to the body rise together; the axles, wheels and bars do not.
 */
export const FJ40_BODY_LIFT = 0.042;

/**
 * The Blender FJ40's roof and glass are 0.12 m lower than the code body's, so its seat, dash,
 * wheel and the driver's eye are too. Until v1.85 they were left at the code body's height: the
 * eye was 13 mm under the top of the glass and the dash stood across the windscreen.
 */
export const FJ40_CAB_DROP = -0.12 + FJ40_BODY_LIFT;
let fj40CabLowered = false;
/**
 * Called when the Blender body is in use (src/render/fj40Glb.ts). If the model fails to load
 * the FJ40 is drawn with the code body, which keeps the higher cab.
 */
export function useFj40Cab(on: boolean): void {
  fj40CabLowered = on;
}

/** The 70 Series cab as first drawn: the LC79's, and the Troop Carrier's until v2.08. */
export const seventyCabin: CabinLayout = {
  // High up behind an upright screen, looking down the short, square bonnet.
  eye: { x: 0.4, y: 1.32, z: 0.02 },
  pitch: -0.17,
  dialY: 1.04,
  dialZ: -0.6,
  dials: {
    speed: { x: 0.47, radius: 0.058, max: 160, major: 20, minor: 10 },
    rpm: { x: 0.31, radius: 0.058, max: 5000, major: 1000, minor: 500 },
    oil: { x: 0.6, radius: 0.034, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55], y: 0.955, z: -0.603 },
  // The handbrake lever on the floor beside the driver's seat.
  handbrake: {
    kind: 'lever',
    base: { x: 0.12, y: 0.42, z: -0.12 },
    tip: { x: 0.12, y: 0.6, z: -0.3 },
    travel: 0.55,
  },
  steeringWheel: {
    centre: { x: 0.4, y: 1.0, z: -0.34 },
    columnBase: { x: 0.4, y: 0.78, z: -0.66 },
    radius: 0.2,
    // Power steering, about 1¾ turns to full lock.
    ratio: 21,
    spokes: 4,
  },
};

/**
 * The Troop Carrier's cab since v2.08: under a header 0.17 m lower and behind a screen leaning
 * back 37 degrees, so the dash is 0.15 m lower and 0.2 m further back, the seat 0.12 m lower and
 * the eye 0.13 m lower (`TROOPY_CAB_FIT` in src/render/troopyBody.ts moves the cab's parts to match).
 */
const troopyCabin: CabinLayout = {
  ...seventyCabin,
  eye: { x: 0.4, y: 1.19, z: 0.02 },
  dialY: 0.89,
  dialZ: -0.4,
  lamps: { ...seventyCabin.lamps, y: 0.805, z: -0.403 },
  handbrake: {
    kind: 'lever',
    base: { x: 0.12, y: 0.3, z: -0.12 },
    tip: { x: 0.12, y: 0.48, z: -0.3 },
    travel: 0.55,
  },
  steeringWheel: {
    ...seventyCabin.steeringWheel,
    centre: { x: 0.4, y: 0.85, z: -0.14 },
    columnBase: { x: 0.4, y: 0.63, z: -0.46 },
  },
};

/** A cab layout moved along the car by `dz`: every point moves with the cab. */
function shifted(c: CabinLayout, dz: number): CabinLayout {
  const along = (p: Point): Point => ({ ...p, z: p.z + dz });
  return {
    ...c,
    eye: along(c.eye),
    dialZ: c.dialZ + dz,
    lamps: { ...c.lamps, z: c.lamps.z + dz },
    handbrake: { ...c.handbrake, base: along(c.handbrake.base), tip: along(c.handbrake.tip) },
    steeringWheel: {
      ...c.steeringWheel,
      centre: along(c.steeringWheel.centre),
      columnBase: along(c.steeringWheel.columnBase),
    },
  };
}

/** A cab layout raised by `dy` (a body lift): every point moves up with the body. */
function raised(c: CabinLayout, dy: number): CabinLayout {
  const up = (p: Point): Point => ({ ...p, y: p.y + dy });
  return {
    ...c,
    eye: up(c.eye),
    dialY: c.dialY + dy,
    lamps: { ...c.lamps, y: c.lamps.y + dy },
    handbrake: { ...c.handbrake, base: up(c.handbrake.base), tip: up(c.handbrake.tip) },
    steeringWheel: {
      ...c.steeringWheel,
      centre: up(c.steeringWheel.centre),
      columnBase: up(c.steeringWheel.columnBase),
    },
  };
}

const fj40Cabin = raised(shortieCabin, FJ40_CAB_DROP);

const perentieCabin: CabinLayout = {
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
};

/**
 * The Ninety's left-hand-drive cabin: the Perentie's seat, dash and wheel mirrored to the left
 * and moved 20 cm back to the shorter front (8 cm until the November 2026 review, when the body moved 12 cm back
 * on its wheels). Manual steering, about 3½ turns lock to lock.
 */
function camelCabin(): CabinLayout {
  const c = perentieCabin;
  const back = 0.2;
  const mirror = (p: { x: number; y: number; z: number }) => ({ ...p, x: -p.x, z: p.z + back });
  return {
    ...c,
    eye: mirror(c.eye),
    dialZ: c.dialZ + back,
    dials: {
      speed: { ...c.dials.speed, x: -c.dials.speed.x },
      rpm: { ...c.dials.rpm, x: -c.dials.rpm.x },
      oil: { ...c.dials.oil, x: -c.dials.oil.x },
    },
    lamps: { ...c.lamps, xs: c.lamps.xs.map((x) => -x), z: c.lamps.z + back },
    handbrake: { ...c.handbrake, base: mirror(c.handbrake.base), tip: mirror(c.handbrake.tip) },
    steeringWheel: {
      ...c.steeringWheel,
      centre: mirror(c.steeringWheel.centre),
      columnBase: mirror(c.steeringWheel.columnBase),
      ratio: 22,
    },
  };
}

export const vehicles: Record<VehicleId, VehicleDef> = {
  sooty80: {
    tuning: sooty80Tuning,
    blurb:
      'Sooty MkII-inspired modified 80 Series, 4.2 L turbo diesel six, 3 inch lift, 35 inch tyres and touring gear.',
    cabin: sooty80Cabin,
    cameraScale: 1.15,
  },
  shortie: {
    tuning: vehicleTuning,
    blurb:
      '1970s Land Cruiser FJ40, open from the start. The Blender-built body, 4.2 L petrol six, three-speed automatic. The earlier body is listed next to it.',
    get cabin() {
      return fj40CabLowered ? fj40Cabin : shortieCabin;
    },
  },
  forty: {
    tuning: fortyTuning,
    blurb:
      'The earlier hand-coded 40 Series, open from the start. The same truck as the FJ40, so the two bodies can be compared.',
    cabin: shortieCabin,
  },
  ute40: {
    tuning: ute40Tuning,
    blurb:
      '40 Series farm ute on the HJ47’s long chassis: the same 4.2 L petrol six and automatic, a steel tray, bull bar, spotlights and snorkel.',
    // A long ute with a headboard: stand a little further back.
    cameraScale: 1.15,
    // The 40's cab, moved forward with the front axle.
    cabin: shifted(shortieCabin, UTE_CAB_SHIFT),
  },
  camel: {
    tuning: camelTuning,
    blurb: '1986 Camel Trophy Land Rover Ninety, 2.5 L diesel, five-speed, roof lamps, snorkel and winch.',
    cabin: camelCabin(),
  },
  rangie: {
    tuning: rangieTuning,
    blurb:
      'Early-1980s two-door Range Rover, 3.5 L V8, five-speed, full-time 4WD with a centre lock, coils, bull bar and rack.',
    cameraScale: 1.05,
    cabin: rangieCabin,
  },
  perentie: {
    tuning: perentieTuning,
    blurb: 'Army Land Rover 110 soft top, 3.9 L Isuzu diesel, four-speed.',
    cabin: perentieCabin,
  },
  hilux: {
    tuning: hiluxTuning,
    blurb: '1979–83 Toyota Hilux 4WD single cab with the styleside tub, 2.0 L petrol four, four-speed.',
    cabin: {
      // Low on the bench seat, close under the roof, looking down the falling bonnet. The eye
      // is 0.145 m under the windscreen's header (it came down 3 cm with the roof in v2.09).
      eye: { x: 0.37, y: 1.03, z: 0.05 },
      pitch: -0.13,
      dialY: 0.69,
      dialZ: -0.535,
      dials: {
        speed: { x: 0.445, radius: 0.052, max: 160, major: 20, minor: 10 },
        rpm: { x: 0.295, radius: 0.052, max: 7000, major: 1000, minor: 500 },
        oil: { x: 0.565, radius: 0.032, max: 1, major: 0.5, minor: 0.25 },
      },
      lamps: { xs: [0.22, 0.27, 0.32, 0.37, 0.42, 0.47, 0.52], y: 0.612, z: -0.538 },
      // The umbrella-handle handbrake under the dash, left of the column.
      handbrake: {
        kind: 'pull',
        base: { x: 0.17, y: 0.55, z: -0.57 },
        tip: { x: 0.17, y: 0.54, z: -0.45 },
        travel: 0.1,
      },
      steeringWheel: {
        centre: { x: 0.37, y: 0.77, z: -0.27 },
        columnBase: { x: 0.37, y: 0.56, z: -0.58 },
        radius: 0.19,
        // No power steering: nearly two turns to full lock.
        ratio: 22,
        spokes: 2,
      },
    },
  },
  xtracab: {
    tuning: xtracabTuning,
    blurb:
      '1985 Toyota Pickup (Hilux) SR5 Xtra Cab 4x4, left-hand drive: 2.4 L injected petrol four, five-speed, 31 inch tyres, tube bumpers, roll bar and six driving lamps.',
    cameraScale: 1.08,
    cabin: {
      // Left-hand drive, as sold in North America: low on a bucket seat under a low roof,
      // looking down a flat bonnet through a raked screen.
      eye: { x: -0.37, y: 1.0, z: 0.06 },
      pitch: -0.12,
      dialY: 0.665,
      dialZ: -0.565,
      dials: {
        speed: { x: -0.445, radius: 0.052, max: 160, major: 20, minor: 10 },
        rpm: { x: -0.295, radius: 0.052, max: 7000, major: 1000, minor: 500 },
        oil: { x: -0.565, radius: 0.03, max: 1, major: 0.5, minor: 0.25 },
      },
      lamps: { xs: [-0.52, -0.47, -0.42, -0.37, -0.32, -0.27, -0.22], y: 0.588, z: -0.568 },
      // The pull-and-twist handbrake handle under the dash, right of the column.
      handbrake: {
        kind: 'pull',
        base: { x: -0.17, y: 0.53, z: -0.6 },
        tip: { x: -0.17, y: 0.52, z: -0.48 },
        travel: 0.1,
      },
      steeringWheel: {
        centre: { x: -0.37, y: 0.735, z: -0.3 },
        columnBase: { x: -0.37, y: 0.53, z: -0.62 },
        radius: 0.19,
        // Power steering on the SR5, about 1¾ turns to full lock; the two-spoke wheel of
        // the interior photographs.
        ratio: 21,
        spokes: 2,
      },
    },
  },
  unimog: {
    tuning: unimogTuning,
    blurb:
      'Army Unimog UL1700L 4-tonne truck on portal axles, 5.7 L turbo-diesel six. Slow, but goes almost anywhere.',
    // A tall, long truck: stand well back to see all of it.
    cameraScale: 1.4,
    cabin: {
      // High over the front wheels behind a big screen, looking down over the short bonnet
      // (the cab's walls are in src/render/unimogLayout.ts).
      eye: { x: 0.5, y: 1.52, z: -1.15 },
      pitch: -0.2,
      dialY: 1.08,
      dialZ: -1.685,
      dials: {
        speed: { x: 0.5, radius: 0.06, max: 100, major: 20, minor: 10 },
        rpm: { x: 0.355, radius: 0.046, max: 3000, major: 500, minor: 250 },
        oil: { x: 0.645, radius: 0.036, max: 1, major: 0.5, minor: 0.25 },
      },
      lamps: { xs: [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65], y: 0.975, z: -1.688 },
      // The handbrake lever on the floor, inboard of the driver's seat.
      handbrake: {
        kind: 'lever',
        base: { x: 0.18, y: 0.58, z: -1.2 },
        tip: { x: 0.17, y: 0.82, z: -1.36 },
        travel: 0.6,
      },
      steeringWheel: {
        // A big wheel on a steep column, almost flat like a bus's.
        centre: { x: 0.5, y: 1.15, z: -1.45 },
        columnBase: { x: 0.5, y: 0.78, z: -1.82 },
        radius: 0.22,
        // Power steering: about two turns to full lock.
        ratio: 22,
        spokes: 3,
      },
    },
  },
  troopy: {
    tuning: troopyTuning,
    blurb: '1990s LandCruiser 75 Series Troop Carrier, 4.2 L diesel six, five-speed, with a sub-tank.',
    cameraScale: 1.12,
    // Starting fill for the game, separate from the sub-tank's 90 L capacity.
    extraLoad: { fuel: TROOPY_START_FUEL },
    cabin: troopyCabin,
  },
  hj60: {
    tuning: hj60Tuning,
    blurb:
      '1986 LandCruiser HJ60 wagon, 4.0 L 2H diesel six, five-speed, leaf springs, barn doors, bull bar and gutter rack.',
    cameraScale: 1.08,
    cabin: hj60Cabin,
  },
  mq: {
    tuning: mqTuning,
    blurb:
      '1980s MQ Patrol short-wheelbase hardtop, 3.3 L SD33 diesel six, four-speed, leaf springs, bull bar and gutter rack.',
    cabin: mqCabin,
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
  lc79: {
    tuning: lc79Tuning,
    blurb:
      'LandCruiser 79 single cab, tuned 4.5 L twin-turbo V8 diesel, 4 inch lift on coils, 37 inch tyres, tray and canopy.',
    // Lifted, on big tyres, with a tall canopy behind the cab.
    cameraScale: 1.25,
    // The same 70 Series cab, lifted with the body.
    cabin: raised(seventyCabin, LC79_CAB_LIFT),
  },
};

/** What a vehicle carries at the start of an episode: the episode's load and its own extras. */
export function vehicleLoadout(load: EpisodeLoadout, id: VehicleId): EpisodeLoadout {
  const extra = vehicles[id].extraLoad;
  return {
    ...load,
    fuel: Math.min(vehicles[id].tuning.engine.fuel.tankLitres, load.fuel + (extra?.fuel ?? 0)),
  };
}

export const vehicleOrder: readonly VehicleId[] = [
  'shortie',
  'forty',
  'ute40',
  'camel',
  'rangie',
  'perentie',
  'hilux',
  'xtracab',
  'unimog',
  'troopy',
  'hj60',
  'mq',
  'patrol',
  'lc79',
  'sooty80',
];

export function isVehicleId(x: unknown): x is VehicleId {
  return typeof x === 'string' && x in vehicles;
}
