import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { sooty80Tuning as tuning } from '../src/data/sooty80';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { VehicleModel } from '../src/render/vehicleModel';
import { loadSave, writeSave } from '../src/sim/save/save';
import { SurfaceId } from '../src/data/surfaces';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

describe('Sooty MkII-inspired 80 Series', () => {
  it('is selected and restored as its own vehicle', () => {
    expect(vehicleOrder).toContain('sooty80');
    const store = new MemoryStore();
    writeSave(saveData({ vehicle: 'sooty80' }), store);
    const saved = loadSave(store)!;
    expect(saved.vehicle).toBe('sooty80');
    expect(vehicles[saved.vehicle].tuning).toBe(tuning);
  });

  it('draws its model with open wheel wells, moving coils, headlights and a right-hand-drive cab', () => {
    const model = new VehicleModel(tuning, true);
    try {
      expect(model.root.name).toBe('sooty-mkii-80-series');
      expect(model.wheels).toHaveLength(4);
      expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(4);
      expect(model.instruments.wheel.parent!.position.x).toBeGreaterThan(0);
      expect(model.beams).not.toBeNull();
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const shell = new Mesh(model.body.geometry, material);
      shell.updateMatrixWorld();
      for (const wheel of tuning.wheels) {
        const side = Math.sign(wheel.x);
        const ray = new Raycaster(new Vector3(side * 0.66, 0.2, wheel.z), new Vector3(side, 0, 0), 0, 0.3);
        expect(ray.intersectObject(shell)).toHaveLength(0);
      }
      const cabin = vehicles.sooty80.cabin;
      // From just behind the wheel, a ray must reach each dial rather than its housing.
      for (const dial of Object.values(cabin.dials)) {
        const ray = new Raycaster(
          new Vector3(dial.x, cabin.dialY, cabin.dialZ + 0.2),
          new Vector3(0, 0, -1),
          0,
          0.3,
        );
        const hit = ray.intersectObject(shell)[0];
        expect(hit).toBeDefined();
        expect(hit.point.z).toBeLessThan(cabin.dialZ + 0.015);
        expect(hit.point.z).toBeGreaterThan(cabin.dialZ - 0.01);
      }
      material.dispose();
      for (const attribute of Object.values(model.body.geometry.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    } finally {
      model.dispose();
    }
  });

  it('drives, brakes and climbs a 30-degree hill in low range with its own collision body', async () => {
    const flat = await makeScene({ tuning });
    try {
      flat.run(3, {});
      expect(Math.abs(flat.vehicle.speed)).toBeLessThan(0.1);
      flat.run(12, { throttle: 1 });
      expect(flat.vehicle.speed * 3.6).toBeGreaterThan(50);
      // Holding brake after stopping selects reverse; release at the first stop.
      let braking = 0;
      while (flat.vehicle.speed > 0.1 && braking < 8) {
        flat.run(0.1, { brake: 1 });
        braking += 0.1;
      }
      flat.run(1, {});
      expect(Math.abs(flat.vehicle.speed)).toBeLessThan(0.1);
      expect(flat.vehicle.tiltDeg()).toBeLessThan(5);
    } finally {
      flat.physics.world.free();
    }
    const hill = await makeScene({ tuning, pitchDeg: 30 });
    try {
      hill.vehicle.toggleRange();
      const z = hill.vehicle.position.z;
      hill.run(12, { throttle: 1 });
      expect(z - hill.vehicle.position.z).toBeGreaterThan(15);
      expect(hill.vehicle.tiltDeg()).toBeLessThan(40);
    } finally {
      hill.physics.world.free();
    }
  });

  it('uses the visible snorkel for flooding and holds 145 L independently of starting fill', async () => {
    expect(tuning.engine.fuel.tankLitres).toBe(145);
    // The lifted draft's parked hubs are 0.196 m below the origin.
    expect(tuning.intake.y + tuning.wheelRadius + 0.196).toBeCloseTo(tuning.intakeHeight, 3);
    const scene = await makeScene({
      tuning,
      ground: { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.5 },
    });
    try {
      scene.run(10, {});
      expect(scene.vehicle.condition.flood.stalled).toBe(false);
    } finally {
      scene.physics.world.free();
    }
  });
});
