import { vehicleTuning, type VehicleTuning } from './vehicle';

/**
 * The short-wheelbase 4WD in Camel Trophy dress: Sandglow yellow, door and bonnet
 * decals, roof lamps and a snorkel. It shares the chassis, springs and drivetrain with
 * the plain short-wheelbase 4WD; the snorkel lifts the engine's air intake from the
 * wing to the top of the windscreen pillar, so it wades deeper before it floods.
 */
export const camelTuning: VehicleTuning = {
  ...vehicleTuning,
  id: 'camel',
  name: 'Camel Trophy 4WD',
  // Snorkel head beside the left windscreen pillar, about 2 m off the ground.
  intakeHeight: 2.0,
  intake: { x: -0.875, y: 1.5, z: -0.7 },
};
