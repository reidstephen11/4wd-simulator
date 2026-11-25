import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { vehicles } from '../src/data/vehicles';
import { SurfaceId } from '../src/data/surfaces';
import { VehicleModel } from '../src/render/vehicleModel';
import { spareSidewall } from '../src/render/spares';
import { makeScene } from './helpers/scenes';

describe('rigid axle articulation', () => {
  for (const { tuning } of Object.values(vehicles)) {
    it(`${tuning.id}: keeps hub spacing and tyre camber on each beam, including under steering`, () => {
      const model = new VehicleModel(tuning);
      try {
        for (const twist of [-0.18, 0, 0.18]) {
          model.poseWheels([-0.12 + twist, -0.12 - twist, -0.12 - twist, -0.12 + twist], [0.4, 0.3, 0, 0]);
          for (const [i, j] of [
            [0, 1],
            [2, 3],
          ]) {
            const a = model.wheels[i].pivot,
              b = model.wheels[j].pivot;
            const span = tuning.drawnWheels
              ? tuning.drawnWheels.halfTrack * 2
              : tuning.wheels[j].x - tuning.wheels[i].x;
            expect(a.position.distanceTo(b.position)).toBeCloseTo(span, 10);
            const beam = b.position.clone().sub(a.position).normalize();
            const axle = model.suspension.axles[i / 2];
            const drawnBeam = new Vector3(1, 0, 0).applyQuaternion(axle.quaternion);
            expect(beam.dot(drawnBeam)).toBeCloseTo(1, 10);
            expect((a.position.y + b.position.y) / 2).toBeCloseTo(axle.position.y, 10);
            // Steering rotates about the beam's up direction; a rear tyre's axle is the beam.
            if (i === 2) {
              const tyreAxle = new Vector3(1, 0, 0).applyQuaternion(a.quaternion);
              expect(tyreAxle.dot(beam)).toBeCloseTo(1, 10);
            }
          }
        }
        // Returning to level must clear camber and steering from the previous pose.
        model.poseWheels([-0.12, -0.12, -0.12, -0.12]);
        for (const w of model.wheels)
          expect(w.pivot.quaternion.angleTo(model.root.quaternion)).toBeCloseTo(0);
      } finally {
        model.dispose();
      }
    });
  }

  for (const id of ['ute40', 'mq', 'rangie', 'xtracab'] as const) {
    it(`${id}: leaves the raised rear tyre clear of the tray or inner wheelhouse`, () => {
      const tuning = vehicles[id].tuning;
      const model = new VehicleModel(tuning);
      const material = new MeshBasicMaterial({ side: DoubleSide });
      try {
        model.poseWheels([-0.04, -0.2, -0.2, -0.04]);
        const wheel = model.wheels[3].pivot;
        const axle = new Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
        const shell = new Mesh(model.body.geometry, material);
        shell.updateMatrixWorld();
        const halfWidth = spareSidewall(model.wheels[3].mesh.geometry);
        for (const radius of [0.25, 0.31, 0.36])
          for (let n = 0; n <= 16; n++) {
            const angle = (n * Math.PI) / 16;
            const point = new Vector3(0, Math.sin(angle) * radius, Math.cos(angle) * radius)
              .applyQuaternion(wheel.quaternion)
              .add(wheel.position)
              .addScaledVector(axle, -halfWidth);
            const hits = new Raycaster(point, axle, 0.003, 2 * halfWidth - 0.003).intersectObject(shell);
            expect(hits, `body inside rear wheel at radius ${radius}, angle ${n}`).toHaveLength(0);
          }
      } finally {
        material.dispose();
        model.dispose();
      }
    });
  }

  it('articulates across diagonal rocks without inventing support in the air', async () => {
    const s = await makeScene({});
    try {
      s.vehicle.toggleRange();
      s.run(3, {});
      for (const i of [0, 3]) {
        const w = s.vehicle.tuning.wheels[i];
        s.physics.addStaticBox(
          { kind: 'ledge', x: w.x, y: 0.16, z: w.z, hx: 0.45, hy: 0.16, hz: 0.6, yaw: 0 },
          SurfaceId.Rock,
        );
      }
      s.run(4, { handbrake: true });
      expect(Math.min(...s.vehicle.wheels.map((w) => w.load))).toBeGreaterThan(700);
      expect(s.vehicle.tiltDeg()).toBeLessThan(5);
      // Hubs move inboard on tilted beams; the ground probe stays within the tyre tread.
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(s.vehicle.wheelX[i])).toBeLessThan(Math.abs(s.vehicle.tuning.wheels[i].x));
        const probe = s.vehicle.controller.wheelChassisConnectionPointCs(i)!;
        expect(Math.abs(probe.x - s.vehicle.wheelX[i])).toBeLessThan(s.vehicle.tuning.wheelWidth / 2);
      }
      const height = s.vehicle.position.y;
      s.run(1, { handbrake: true });
      expect(Math.abs(s.vehicle.position.y - height)).toBeLessThan(0.01);
      // A beam cannot create grip over a hole or support the chassis while airborne.
      s.vehicle.body.setTranslation({ ...s.vehicle.position, y: height + 3 }, true);
      s.run(0.2, {});
      expect(s.vehicle.wheels.every((w) => !w.contact && w.load === 0)).toBe(true);
    } finally {
      s.physics.free();
    }
  });
});
