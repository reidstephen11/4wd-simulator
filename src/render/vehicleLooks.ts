import type * as THREE from 'three';
import type { Vec3 } from '../sim/vehicle/math';
import type { VehicleId, VehicleTuning } from '../data/vehicle';
import { buildVehicleBody } from './vehicleBody';
import { buildVehicleWheel } from './vehicleWheel';
import { buildRackPlank } from './vehicleEquipment';
import { buildPerentieBody, buildPerentiePlank, buildPerentieWheel } from './perentieBody';
import { addCamelTrophyKit, camelLivery, camelRim } from './camelLivery';
import { buildPatrolBody, buildPatrolPlank, buildPatrolWheel } from './patrolBody';

/** How each vehicle is drawn: its body, wheels, carried planks, paint and springs. */
export interface VehicleLook {
  name: string;
  body(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry;
  wheel(tuning: VehicleTuning): THREE.BufferGeometry;
  plank(index: number): THREE.BufferGeometry;
  paint: { roughness: number; metalness: number; clearcoat: number; clearcoatRoughness: number };
  springs: 'leaf' | 'coil';
  /** Lens centres: the headlamps, and any driving lamps that come on with high beam. */
  lamps: { head: readonly Vec3[]; roof?: readonly Vec3[] };
}

const fortySeriesHeadlamps: Vec3[] = [
  { x: -0.535, y: 0.605, z: -1.948 },
  { x: 0.535, y: 0.605, z: -1.948 },
];

export const vehicleLooks: Record<VehicleId, VehicleLook> = {
  shortie: {
    name: '40-series-4wd',
    body: buildVehicleBody,
    wheel: buildVehicleWheel,
    plank: buildRackPlank,
    paint: { roughness: 0.39, metalness: 0.14, clearcoat: 0.7, clearcoatRoughness: 0.24 },
    springs: 'leaf',
    lamps: { head: fortySeriesHeadlamps },
  },
  camel: {
    name: 'camel-trophy-4wd',
    // The snorkel takes the left wing, so the aerial moves to the right.
    body: (tuning, wheel) =>
      buildVehicleBody(tuning, wheel, camelLivery, { aerialSide: 1, add: addCamelTrophyKit }),
    wheel: (tuning) => buildVehicleWheel(tuning, camelRim),
    plank: buildRackPlank,
    paint: { roughness: 0.39, metalness: 0.14, clearcoat: 0.7, clearcoatRoughness: 0.24 },
    springs: 'leaf',
    lamps: {
      head: fortySeriesHeadlamps,
      roof: [-0.5, -0.17, 0.17, 0.5].map((x) => ({ x, y: 2.07, z: -0.53 })),
    },
  },
  perentie: {
    name: 'land-rover-110-perentie',
    body: buildPerentieBody,
    wheel: buildPerentieWheel,
    plank: buildPerentiePlank,
    // Army enamel is flat: no clearcoat and a dull sheen.
    paint: { roughness: 0.72, metalness: 0.05, clearcoat: 0, clearcoatRoughness: 1 },
    springs: 'coil',
    lamps: {
      head: [
        { x: -0.625, y: 0.39, z: -2.042 },
        { x: 0.625, y: 0.39, z: -2.042 },
      ],
    },
  },
  patrol: {
    name: 'gq-patrol',
    body: buildPatrolBody,
    wheel: buildPatrolWheel,
    plank: buildPatrolPlank,
    paint: { roughness: 0.36, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.28 },
    springs: 'coil',
    lamps: {
      head: [
        { x: -0.645, y: 0.43, z: -2.29 },
        { x: 0.645, y: 0.43, z: -2.29 },
      ],
      // The two driving lamps on the bull bar come on with high beam.
      roof: [
        { x: -0.28, y: 0.86, z: -2.43 },
        { x: 0.28, y: 0.86, z: -2.43 },
      ],
    },
  },
};
