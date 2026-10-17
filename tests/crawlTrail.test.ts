import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { graniteLink } from '../src/data/crawlTrail';
import { lateAfternoon } from '../src/data/environment';
import { SurfaceId } from '../src/data/surfaces';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { flatDirt, loadRapier, Physics } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import { rockShape } from '../src/sim/world/rockShape';
import { testWorld } from './world';

describe('Granite Link trail and bypass', () => {
  for (const bypass of [false, true])
    for (const back of [false, true])
      it(`drives the full ${bypass ? 'open-diff bypass' : 'technical trail'} ${back ? 'towards camp' : 'out from camp'}`, async () => {
        const world = testWorld(),
          sim = new Simulation(await loadRapier(), world, lateAfternoon);
        try {
          const track = world.features.tracks.find(
            (t) => t.def.id === (bypass ? graniteLink.bypassTrackId : graniteLink.trackId),
          )!;
          const start = trailPoint(track, back ? track.poly.length : 0);
          const v = sim.addVehicle('p', sim.poseAt(start.x, start.z, start.headingDeg + (back ? 180 : 0)));
          const inputs = new Map([['p', emptyInput()]]),
            dt = 1 / 60;
          for (let i = 0; i < 60; i++) sim.step(inputs, dt);
          inputs.set('p', {
            ...emptyInput(),
            toggleRange: true,
            togglePrecision: true,
            toggleFrontDiff: !bypass,
            toggleRearDiff: !bypass,
          });
          sim.step(inputs, dt);
          const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
            const p = trailPoint(track, Math.min(track.poly.length, i * 0.5));
            return [p.x, p.z] as [number, number];
          });
          if (back) path.reverse();
          const pilot = new Autopilot(path, 0.7);
          pilot.lowRange = true;
          let maxTilt = 0,
            maxSpeed = 0,
            maxDeviation = 0;
          const sections = new Set<string>();
          for (let time = 0; time < 150 && !pilot.done; time += dt) {
            const command = pilot.input(v, dt);
            command.throttle = pilot.done ? 0 : 1;
            command.brake = 0;
            inputs.set('p', command);
            sim.step(inputs, dt);
            const near = trailProgress(track, v.position.x, v.position.z);
            maxDeviation = Math.max(maxDeviation, near.distance);
            maxTilt = Math.max(maxTilt, v.tiltDeg());
            maxSpeed = Math.max(maxSpeed, Math.abs(v.speed));
            for (const section of graniteLink.sections)
              if (near.along >= section.from && near.along <= section.to) sections.add(section.name);
          }
          expect(pilot.done, `ended ${pilot.remaining(v).toFixed(1)} m from exit`).toBe(true);
          expect(sections.size).toBe(3);
          expect(maxTilt).toBeLessThan(bypass ? 18 : 30);
          if (!bypass) expect(maxTilt).toBeGreaterThan(12);
          expect(maxSpeed).toBeLessThan(1.5);
          expect(maxDeviation).toBeLessThan(track.def.width / 2);
        } finally {
          sim.physics.free();
        }
      });

  it('matches the visible chamfered rock surface and corners with its collision hull', async () => {
    const physics = new Physics(await loadRapier(), flatDirt);
    const shape = rockShape(1, 0.45, 1.5, 0.1);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(shape.vertices, 3));
    geometry.setIndex(Array.from(shape.indices));
    const material = new MeshBasicMaterial(),
      mesh = new Mesh(geometry, material);
    const cast = new Raycaster();
    try {
      physics.addStaticBox(
        { kind: 'ledge', x: 0, y: 0, z: 0, hx: 1, hy: 0.45, hz: 1.5, yaw: 0, bevel: 0.1 },
        SurfaceId.Rock,
      );
      physics.step();
      mesh.updateMatrixWorld();
      for (const x of [-0.99, -0.88, -0.7, 0, 0.7, 0.88, 0.99])
        for (const z of [-1.49, -1.4, -1, 0, 1, 1.4, 1.49]) {
          const from = new Vector3(x, 3, z),
            down = new Vector3(0, -1, 0);
          cast.set(from, down);
          const visual = cast.intersectObject(mesh)[0];
          const physical = physics.world.castRay(new physics.R.Ray(from, down), 5, true);
          expect(!!physical).toBe(!!visual);
          if (physical && visual) expect(physical.timeOfImpact).toBeCloseTo(visual.distance, 4);
        }
    } finally {
      physics.free();
      geometry.dispose();
      material.dispose();
    }
  });
});
