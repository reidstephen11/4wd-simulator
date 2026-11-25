import type { VehicleTuning } from '../data/vehicle';
import type { PosedBody } from '../sim/bodyPose';
import { STUCK_RIDE_HEIGHT } from '../sim/stuckVehicle';
import { createCondition } from '../sim/vehicle/condition';
import { VehicleModel } from './vehicleModel';
import { followBody } from './followBody';

/**
 * Someone else's vehicle, bogged (src/sim/stuckVehicle.ts) or coming the other way
 * (src/sim/traffic.ts), drawn as one of the game's
 * vehicles: caked in mud, wheels still, following its body between physics steps as it comes
 * out of the bog or along the track.
 */
export class StuckVehicleView {
  readonly model: VehicleModel;

  constructor(
    private readonly stuck: PosedBody,
    tuning: VehicleTuning,
  ) {
    this.model = new VehicleModel(tuning);
    // Wheels sit their radius above the ground under the body, as it rests on them.
    const y = tuning.wheelRadius - STUCK_RIDE_HEIGHT;
    this.model.poseWheels(tuning.wheels.map(() => y));
    const c = createCondition();
    c.dirt = { front: 0.8, sides: 0.9, rear: 0.7, wheels: 1 };
    c.mudShare = 1;
    this.model.applyCondition(c);
    this.update(1);
  }

  /** `alpha` 0 = the pose before the last physics step, 1 = after it. */
  update(alpha: number): void {
    followBody(this.model.root, this.stuck, alpha);
  }
}
