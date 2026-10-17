import { vehicleTuning } from '../../data/vehicle';
import type { Vehicle } from '../vehicle/vehicle';
import { emptyInput, type VehicleInput } from './vehicleInput';

/**
 * Simple path-following driver used by tests and the scripted e2e drive. Pure pursuit
 * on a polyline with a speed target; switches to low range when it bogs down.
 */
export class Autopilot {
  private index = 0;
  private stuckTime = 0;
  private rangeCooldown = 0;
  /** Prefer low range from the start. */
  lowRange = false;
  done = false;

  constructor(
    readonly path: ReadonlyArray<readonly [number, number]>,
    public targetSpeed = 6,
  ) {}

  /** Distance from the vehicle to the end of the path. */
  remaining(v: Vehicle): number {
    const p = v.body.translation();
    const end = this.path[this.path.length - 1];
    return Math.hypot(end[0] - p.x, end[1] - p.z);
  }

  input(v: Vehicle, dt: number): VehicleInput {
    const inp = emptyInput();
    const p = v.body.translation();
    const path = this.path;
    // Advance along the path to the nearest point ahead.
    let best = this.index;
    let bestD = Infinity;
    for (let i = this.index; i < Math.min(path.length, this.index + 40); i++) {
      const d = Math.hypot(path[i][0] - p.x, path[i][1] - p.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.index = best;
    const look = Math.min(12, Math.max(5, 4 + Math.abs(v.speed) * 0.8));
    let target = path[path.length - 1];
    for (let i = this.index; i < path.length; i++) {
      if (Math.hypot(path[i][0] - p.x, path[i][1] - p.z) >= look) {
        target = path[i];
        break;
      }
    }
    if (this.remaining(v) < 2.5) this.done = true;
    const f = v.forward();
    const fx = f.x;
    const fz = f.z;
    const fl = Math.hypot(fx, fz) || 1;
    const tx = target[0] - p.x;
    const tz = target[1] - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    const angle = Math.atan2(
      -((fz / fl) * (tx / tl) - (fx / fl) * (tz / tl)),
      (fx / fl) * (tx / tl) + (fz / fl) * (tz / tl),
    );
    const maxA = (vehicleTuning.steering.maxAngleDeg * Math.PI) / 180;
    inp.steer = Math.max(-1, Math.min(1, (angle / maxA) * 1.4));

    // Slow down for sharp turns and near the end.
    let want = this.targetSpeed * (1 - Math.min(0.6, Math.abs(angle) / 1.5));
    if (this.done) want = 0;
    const err = want - v.speed;
    if (err > 0) inp.throttle = Math.min(1, 0.35 + err * 0.4);
    else if (err < -1.2) inp.brake = Math.min(1, -err * 0.3);

    // Bogged down: drop into low range.
    this.rangeCooldown -= dt;
    if (inp.throttle > 0.9 && Math.abs(v.speed) < 1) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt);
    const wantLow = this.lowRange || this.stuckTime > 2;
    if (this.rangeCooldown <= 0 && wantLow !== (v.drivetrain.range === 'low') && Math.abs(v.speed) < 5) {
      inp.toggleRange = true;
      this.rangeCooldown = 3;
    }
    return inp;
  }
}
