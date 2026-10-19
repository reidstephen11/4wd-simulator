import type * as THREE from 'three';
import type { VehicleId, VehicleTuning } from '../data/vehicle';
import { buildVehicleBody } from './vehicleBody';
import { buildVehicleWheel } from './vehicleWheel';
import { buildRackPlank } from './vehicleEquipment';
import { buildPerentieBody, buildPerentiePlank, buildPerentieWheel } from './perentieBody';
import { addCamelTrophyKit, camelLivery, camelRim } from './camelLivery';

/** How each vehicle is drawn: its body, wheels, carried planks, paint and springs. */
export interface VehicleLook {
  name: string;
  body(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry;
  wheel(tuning: VehicleTuning): THREE.BufferGeometry;
  plank(index: number): THREE.BufferGeometry;
  paint: { roughness: number; metalness: number; clearcoat: number; clearcoatRoughness: number };
  springs: 'leaf' | 'coil';
}

export const vehicleLooks: Record<VehicleId, VehicleLook> = {
  shortie: {
    name: '40-series-4wd',
    body: buildVehicleBody,
    wheel: buildVehicleWheel,
    plank: buildRackPlank,
    paint: { roughness: 0.39, metalness: 0.14, clearcoat: 0.7, clearcoatRoughness: 0.24 },
    springs: 'leaf',
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
  },
  perentie: {
    name: 'land-rover-110-perentie',
    body: buildPerentieBody,
    wheel: buildPerentieWheel,
    plank: buildPerentiePlank,
    // Army enamel is flat: no clearcoat and a dull sheen.
    paint: { roughness: 0.72, metalness: 0.05, clearcoat: 0, clearcoatRoughness: 1 },
    springs: 'coil',
  },
};
