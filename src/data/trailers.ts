import type { VehicleTuning } from './vehicle';

/**
 * Trailers (docs/NEXT.md). Local frame as for the vehicles: x = right, y = up, z = back
 * (the drawbar points to -z). The origin is on the axle line at the springs' top mounts.
 */
export interface TrailerTuning {
  id: 'box6x4' | 'no5';
  name: string;
  /**
   * How it couples: a ball coupling goes on a tow ball (or, for now, a pintle hook); a
   * lunette ring drops over a pintle hook, so it needs a vehicle that has one.
   */
  couplingKind: 'ball' | 'ring';
  /** Empty (tare) mass (kg), centre of mass and principal inertia: pitch (x), yaw (y), roll (z). */
  mass: number;
  com: { x: number; y: number; z: number };
  inertia: { x: number; y: number; z: number };
  wheelRadius: number;
  wheelWidth: number;
  /** Spring top mounts (local), left then right. */
  wheels: { x: number; y: number; z: number }[];
  suspensionRestLength: number;
  suspensionTravel: number;
  /** Spring rate at each wheel (N/m): the loaded trailer sits lower than the empty one. */
  springRate: number;
  damperCompression: number;
  damperRelaxation: number;
  /** Side grip of the tyres (multiplied by the surface's grip). */
  lateralGrip: number;
  /** The coupling's socket, where it sits on the tow ball (local). */
  coupling: { x: number; y: number; z: number };
  /** The jockey wheel under the coupling, wound down when unhitched (local centre and radius). */
  jockey: { x: number; y: number; z: number; r: number };
  /** Collision boxes (local centre + half extents): the box, and the drawbar clear of the coupling. */
  boxes: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }[];
  /** Load space: floor height (local y) and inside half extents. */
  bed: { y: number; hx: number; hz: number; cz: number; sides: number };
  /** Most it may carry (kg): its ATM less its tare. */
  payload: number;
  /** Wheel arches standing up inside the box (local centre and half extents of the right one). */
  arch?: { x: number; y: number; z: number; hx: number; hy: number; hz: number };
  /** A spare wheel standing on the drawbar in front of the box (its centre, local). */
  spare?: { x: number; y: number; z: number };
}

/** A 6×4 box trailer of the 1980s: steel box on leaf springs, 13-inch wheels, no brakes. */
export const boxTrailer: TrailerTuning = {
  id: 'box6x4',
  name: '6×4 box trailer',
  couplingKind: 'ball',
  mass: 240,
  com: { x: 0, y: -0.05, z: -0.3 },
  inertia: { x: 190, y: 230, z: 65 },
  wheelRadius: 0.3,
  wheelWidth: 0.19,
  wheels: [
    { x: -0.74, y: 0, z: 0 },
    { x: 0.74, y: 0, z: 0 },
  ],
  suspensionRestLength: 0.2,
  suspensionTravel: 0.14,
  springRate: 42000,
  damperCompression: 2.4,
  damperRelaxation: 3.2,
  // Narrow, lightly loaded tyres: pushed sideways the loaded trailer slides before it tips.
  lateralGrip: 0.72,
  coupling: { x: 0, y: 0.1, z: -2.3 },
  jockey: { x: 0, y: -0.33, z: -2.1, r: 0.1 },
  boxes: [
    // The box: floor, sides and the guards over the wheels.
    { cx: 0, cy: 0.17, cz: -0.2, hx: 0.64, hy: 0.04, hz: 0.93 },
    { cx: -0.63, cy: 0.38, cz: -0.2, hx: 0.02, hy: 0.21, hz: 0.93 },
    { cx: 0.63, cy: 0.38, cz: -0.2, hx: 0.02, hy: 0.21, hz: 0.93 },
    { cx: 0, cy: 0.38, cz: -1.11, hx: 0.64, hy: 0.21, hz: 0.02 },
    { cx: 0, cy: 0.38, cz: 0.71, hx: 0.64, hy: 0.21, hz: 0.02 },
    // The A-frame drawbar, stopping short of the coupling so the tow ball's tongue never touches it.
    { cx: 0, cy: 0.1, cz: -1.42, hx: 0.28, hy: 0.04, hz: 0.29 },
  ],
  bed: { y: 0.21, hx: 0.6, hz: 0.9, cz: -0.2, sides: 0.42 },
  payload: 510,
};

/**
 * The Australian Army's No. 5 trailer (Trailer, Cargo, ½ tonne, No. 5), the steel box trailer
 * built for towing behind the Army's Land Rovers from the mid-1960s and still behind the
 * Perentie: 3.18 × 1.55 m overall, an inside box of 1.85 × 1.32 m and 475 mm deep with the
 * wheel arches 0.98 m apart inside it, about 360 kg empty, 500 kg of cargo, no brakes, and a
 * lunette ring on its single-tube drawbar for the pintle hook (reference/vehicles/army-no5-trailer).
 */
export const no5Trailer: TrailerTuning = {
  id: 'no5',
  name: 'Army No. 5 trailer',
  couplingKind: 'ring',
  mass: 360,
  com: { x: 0, y: 0.14, z: -0.22 },
  inertia: { x: 150, y: 190, z: 80 },
  // 7.50-16 bar tyres on Land Rover rims, tucked under the box between the arches: a
  // 1.24 m track, the tyres' outer faces 1.43 m apart under the 1.55 m lip. (v1.22 tried
  // 1.32 m to help the width; it made the loaded trailer stand up in the hard turn across
  // a slope that the No. 5 is meant to go over in, so the width is in the lip instead.)
  wheelRadius: 0.38,
  wheelWidth: 0.19,
  wheels: [
    { x: -0.62, y: 0, z: 0 },
    { x: 0.62, y: 0, z: 0 },
  ],
  suspensionRestLength: 0.2,
  suspensionTravel: 0.12,
  springRate: 60000,
  damperCompression: 2.6,
  damperRelaxation: 3.4,
  // Loaded, it tips at about 0.64 g sideways (centre of mass about 0.97 m up on a 1.24 m
  // track). Its tyres grip sideways well under that, so shoved sideways at a fold it skids
  // rather than bouncing over (at 0.6 it still rolled); across a slope, or in a hard turn on
  // one, it still goes over (the Army found the same).
  lateralGrip: 0.5,
  // 3.18 m from the ring to the back of the box.
  coupling: { x: 0, y: -0.05, z: -2.35 },
  // The prop leg under the front of the drawbar.
  jockey: { x: 0, y: -0.52, z: -1.98, r: 0.05 },
  boxes: [
    // Floor, sides, front and back.
    { cx: 0, cy: 0.19, cz: -0.12, hx: 0.69, hy: 0.04, hz: 0.96 },
    { cx: -0.675, cy: 0.445, cz: -0.12, hx: 0.015, hy: 0.275, hz: 0.96 },
    { cx: 0.675, cy: 0.445, cz: -0.12, hx: 0.015, hy: 0.275, hz: 0.96 },
    { cx: 0, cy: 0.445, cz: -1.065, hx: 0.69, hy: 0.275, hz: 0.015 },
    { cx: 0, cy: 0.445, cz: 0.825, hx: 0.69, hy: 0.275, hz: 0.015 },
    // The spare wheel on the drawbar.
    { cx: 0, cy: 0.43, cz: -1.32, hx: 0.1, hy: 0.38, hz: 0.38 },
    // The drawbar, stopping short of the ring so the pintle never touches it.
    { cx: 0, cy: 0.03, cz: -1.6, hx: 0.05, hy: 0.05, hz: 0.45 },
  ],
  bed: { y: 0.21, hx: 0.66, hz: 0.925, cz: -0.12, sides: 0.475 },
  payload: 500,
  arch: { x: 0.575, y: 0.33, z: 0, hx: 0.085, hy: 0.12, hz: 0.42 },
  spare: { x: 0, y: 0.43, z: -1.32 },
};

/** The trailers by id. */
export const trailers: Record<TrailerTuning['id'], TrailerTuning> = { box6x4: boxTrailer, no5: no5Trailer };

export const trailerTuning = {
  /** The coupling hitches when it is this close to the tow ball (m): near enough to wheel it on by hand. */
  hitchReach: 0.7,
  /** Stopped (m/s) to hitch or unhitch. */
  stoppedSpeed: 0.5,
  /** Angle between the vehicle and the trailer (degrees) where the drawbar is about to meet the back of the car:
   * reversing on full lock it stops against the bumper at about 70°; driving forwards on full
   * lock it settles at about 56°. */
  jackknifeDeg: 62,
  /** Folded this far (degrees), the drawbar is against the towbar's tongue and goes no further. */
  foldLimitDeg: 68,
  /** Tilted this far over (degrees), it has tipped onto its side. */
  tippedDeg: 60,
  /** Unhitched, the wheels are chocked: brake force at each (N). */
  chockForce: 6000,
  /** A wheel's spring compressing this fast (m/s) is a hit the box bangs on. */
  bumpSpeed: 1.2,
};

/** A 200 L steel drum: 585 mm across and 880 mm tall, 18 kg empty. */
export const DRUM = { radius: 0.29, height: 0.88, empty: 18 };

/** A drum full of diesel (0.84 kg/L) weighs about 186 kg. */
export const DIESEL_DRUM_MASS = DRUM.empty + 200 * 0.84;

/** Where `count` drums stand on the floor (x, z): two across, filling from the front of the box. */
export function drumSpots(count: number, bed: TrailerTuning['bed']): [number, number][] {
  const spots: [number, number][] = [];
  const front = bed.cz - bed.hz + DRUM.radius + 0.02;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2);
    spots.push([(i % 2 === 0 ? -1 : 1) * (bed.hx - DRUM.radius), front + row * (2 * DRUM.radius + 0.02)]);
  }
  return spots;
}

/** The mass, centre and half extents of `count` full drums standing in a trailer, for Trailer.setLoad. */
export function drumLoad(
  count: number,
  bed: TrailerTuning['bed'],
): { mass: number; com: { x: number; y: number; z: number }; half: { x: number; y: number; z: number } } {
  const spots = drumSpots(count, bed);
  const n = Math.max(1, spots.length);
  const x = spots.reduce((a, s) => a + s[0], 0) / n;
  const z = spots.reduce((a, s) => a + s[1], 0) / n;
  const zs = spots.map((s) => s[1]);
  return {
    mass: count * DIESEL_DRUM_MASS,
    com: { x, y: bed.y + DRUM.height / 2, z },
    half: {
      x: count > 1 ? bed.hx : DRUM.radius,
      y: DRUM.height / 2,
      z: (Math.max(...zs, 0) - Math.min(...zs, 0)) / 2 + DRUM.radius,
    },
  };
}

/**
 * Where a trailer's coupling sits on a vehicle (local): the ball on the towbar tongue
 * drawn behind the tow point (src/render/vehicleEquipment.ts), or the vehicle's own hitch
 * (a pintle hook) where it has one.
 */
export function hitchPoint(t: VehicleTuning): { x: number; y: number; z: number } {
  if (t.hitch) return t.hitch;
  return { x: t.towPoint.x, y: t.towPoint.y + 0.1, z: t.towPoint.z + 0.13 };
}

/** Can this trailer go on this vehicle? A lunette ring needs a pintle hook (the vehicle's `hitch`). */
export function canCouple(trailer: TrailerTuning, vehicle: VehicleTuning): boolean {
  return trailer.couplingKind === 'ball' || vehicle.hitch !== undefined;
}
