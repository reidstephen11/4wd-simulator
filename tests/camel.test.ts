import { describe, expect, it } from 'vitest';
import { camelTuning } from '../src/data/camel';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { VehicleModel } from '../src/render/vehicleModel';
import { defaultSettings, loadSave, writeSave, type KeyValueStore } from '../src/sim/save/save';
import { makeScene } from './helpers/scenes';

describe('Camel Trophy 4WD', () => {
  it('is the short-wheelbase 4WD with a snorkel: same chassis, drivetrain and cab', () => {
    const { id, name, intake, intakeHeight, ...rest } = camelTuning;
    const { id: _id, name: _name, intake: _intake, intakeHeight: _height, ...base } = vehicleTuning;
    expect(rest).toEqual(base);
    expect([id, name]).toEqual(['camel', 'Camel Trophy 4WD']);
    expect(vehicles.camel.cabin).toBe(vehicles.shortie.cabin);
    expect(vehicleOrder.slice(0, 3)).toEqual(['shortie', 'camel', 'perentie']);
    // The snorkel head is about 2 m off the ground, beside the left windscreen pillar.
    expect(intakeHeight).toBeGreaterThan(1.9);
    expect(intake.y + vehicleTuning.wheelRadius + 0.12).toBeCloseTo(intakeHeight, 1);
    expect(intake.x).toBeLessThan(-0.8);
  });

  it('wades water that would drown the plain short-wheelbase 4WD', async () => {
    // Water 1.5 m deep everywhere: over the wing-height intake, under the snorkel head.
    const ground = { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.5 };
    for (const [tuning, floods] of [
      [vehicleTuning, true],
      [camelTuning, false],
    ] as const) {
      const s = await makeScene({ tuning, ground });
      s.run(12, {});
      expect(s.vehicle.condition.flood.stalled, tuning.name).toBe(floods);
      s.physics.world.free();
    }
  });

  it('is drawn in Sandglow yellow with black decals, roof lamps and the snorkel at its air intake', () => {
    const model = new VehicleModel(camelTuning);
    const plain = new VehicleModel(vehicleTuning);
    expect(model.root.name).toBe('camel-trophy-4wd');
    const geometry = model.body.geometry;
    const pos = geometry.getAttribute('position'),
      col = geometry.getAttribute('color');
    expect(pos.count).toBeGreaterThan(plain.body.geometry.getAttribute('position').count);
    let yellow = 0,
      ink = 0,
      nearIntake = 0;
    const t = camelTuning.intake;
    for (let i = 0; i < pos.count; i++) {
      const [r, g, b] = [col.getX(i), col.getY(i), col.getZ(i)];
      if (r > 0.6 && g > 0.3 && g < 0.45 && b < 0.05) yellow++;
      if (r < 0.02 && g < 0.02 && b < 0.02) ink++;
      if (Math.hypot(pos.getX(i) - t.x, pos.getY(i) - t.y, pos.getZ(i) - t.z) < 0.1) nearIntake++;
    }
    expect(yellow).toBeGreaterThan(5000);
    expect(ink).toBeGreaterThan(1000);
    expect(nearIntake).toBeGreaterThan(20);
    model.dispose();
    plain.dispose();
  });

  it('is remembered in the save', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeSave(
      {
        version: 1,
        exploration: { discovered: [], lastCampsite: 'trailhead' },
        settings: defaultSettings,
        vehicle: 'camel',
      },
      s,
    );
    expect(loadSave(s)!.vehicle).toBe('camel');
  });
});
