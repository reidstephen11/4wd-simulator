import type { VehicleTuning } from '../../src/data/vehicle';
import { makeScene } from './scenes';

/** A repeatable dry, level dirt-road run, without episode fuel acceleration. */
export async function measureFuel(tuning: VehicleTuning, targetKmh = 60) {
  const scene = await makeScene({ tuning });
  try {
    scene.run(8, { brake: 1 });
    const idleLitresPerHour = scene.vehicle.drivetrain.fuelRate * 3600;
    const drive = () => ({
      throttle: Math.max(0, Math.min(1, (targetKmh / 3.6 - scene.vehicle.speed) * 0.5)),
    });
    scene.run(35, drive);
    let litres = 0;
    let metres = 0;
    scene.afterStep = (dt) => {
      litres += scene.vehicle.drivetrain.fuelRate * dt;
      metres += Math.abs(scene.vehicle.speed) * dt;
    };
    scene.run(20, drive);
    return {
      idleLitresPerHour,
      litresPer100Km: (litres / metres) * 100000,
      averageKmh: (metres / 20) * 3.6,
    };
  } finally {
    scene.physics.world.free();
  }
}
