import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { SurfaceId } from '../src/data/surfaces';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { Groups, groups, loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { propDims, propYaw } from '../src/sim/world/props';
import { StaticMeshBatcher } from '../src/sim/world/staticMesh';
import { makeScene } from './helpers/scenes';
import { testWorld } from './world';

const DT = 1 / 60;

/**
 * Hold walking pace; using a speed target prevents momentum from hiding a snag. Like a
 * driver, it brakes when idle creep or a drop carries the car past the target.
 */
function crawl(speed: number, reverse = false) {
  const v = speed * (reverse ? -1 : 1);
  if (v > 0.9)
    return reverse ? { throttle: Math.min(1, (v - 0.6) * 0.5) } : { brake: Math.min(1, (v - 0.6) * 0.5) };
  const effort = Math.max(0, Math.min(1, (0.6 - v) * 2));
  return reverse ? { brake: effort } : { throttle: effort };
}

async function logScene(reverse: boolean, offset = 0) {
  const s = await makeScene({});
  const d = propDims.logSeat;
  const z = reverse ? 3 : -3;
  const batcher = new StaticMeshBatcher(256);
  batcher.prism('wood', [-d.l / 2 + offset, d.y, z], [d.l / 2 + offset, d.y, z], d.r, d.sides, -Math.PI / 2);
  for (const b of batcher.batches.values()) {
    const c = s.physics.world.createCollider(
      s.physics.R.ColliderDesc.trimesh(
        new Float32Array(b.vertices),
        new Uint32Array(b.indices),
        s.physics.R.TriMeshFlags.FIX_INTERNAL_EDGES,
      )
        .setFriction(0.6)
        .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
    );
    s.physics.colliderSurface.set(c.handle, SurfaceId.Wood);
  }
  s.vehicle.toggleRange();
  return s;
}

describe('rock crawling', () => {
  for (const reverse of [false, true]) {
    for (const offset of [0, 0.85]) {
      it(`crawls ${reverse ? 'backwards' : 'forwards'} over a camp log with ${offset ? 'one wheel per axle' : 'both wheels per axle'}`, async () => {
        const s = await logScene(reverse, offset);
        try {
          const y0 = s.vehicle.position.y;
          let maxLift = 0;
          let maxSpeed = 0;
          let maxTilt = 0;
          const woodContact = [false, false];
          for (let i = 0; i < 18 / DT; i++) {
            s.run(DT, crawl(s.vehicle.speed, reverse));
            maxLift = Math.max(maxLift, s.vehicle.position.y - y0);
            maxSpeed = Math.max(maxSpeed, Math.abs(s.vehicle.speed));
            maxTilt = Math.max(maxTilt, s.vehicle.tiltDeg());
            s.vehicle.wheels.forEach((w, j) => {
              if (w.contact && w.surface === SurfaceId.Wood && w.load > 100)
                woodContact[j < 2 ? 0 : 1] = true;
            });
          }
          expect(s.vehicle.position.z * (reverse ? 1 : -1)).toBeGreaterThan(5.5);
          expect(maxSpeed).toBeLessThan(1.5);
          expect(maxLift).toBeGreaterThan(0.05);
          expect(maxTilt).toBeLessThan(30);
          expect(woodContact).toEqual([true, true]);
        } finally {
          s.physics.free();
        }
      });
    }
  }

  it('crawls through staggered rock ledges without a run-up', async () => {
    const s = await makeScene({});
    try {
      for (const [x, z, height] of [
        [-0.65, -3, 0.25],
        [0.65, -5, 0.3],
      ]) {
        s.physics.addStaticBox(
          { x, y: height / 2, z, hx: 0.45, hy: height / 2, hz: 0.4, yaw: 0, kind: 'ledge' },
          SurfaceId.Rock,
        );
      }
      s.vehicle.toggleRange();
      let maxTilt = 0;
      let maxSpeed = 0;
      for (let i = 0; i < 24 / DT; i++) {
        s.run(DT, crawl(s.vehicle.speed));
        maxTilt = Math.max(maxTilt, s.vehicle.tiltDeg());
        maxSpeed = Math.max(maxSpeed, Math.abs(s.vehicle.speed));
      }
      expect(s.vehicle.position.z).toBeLessThan(-8);
      expect(maxSpeed).toBeLessThan(1.5);
      expect(maxTilt).toBeGreaterThan(5);
      expect(maxTilt).toBeLessThan(30);
    } finally {
      s.physics.free();
    }
  });

  it('keeps a tall solid obstacle impassable', async () => {
    const s = await makeScene({});
    try {
      s.physics.addStaticBox(
        { x: 0, y: 0.6, z: -3, hx: 3, hy: 0.6, hz: 0.4, yaw: 0, kind: 'ledge' },
        SurfaceId.Rock,
      );
      s.vehicle.toggleRange();
      s.run(12, () => crawl(s.vehicle.speed));
      expect(s.vehicle.position.z).toBeGreaterThan(-2);
      expect(s.vehicle.position.y).toBeLessThan(1);
    } finally {
      s.physics.free();
    }
  });

  it('leaves the visible gap beneath the rear wheel arch clear', async () => {
    const s = await makeScene({});
    try {
      const probe = s.vehicle.localToWorld(0.75, 0.15, 0.75);
      const overlap = s.physics.world.intersectionWithShape(
        probe,
        s.vehicle.rotation,
        new s.physics.R.Ball(0.02),
        undefined,
        groups(Groups.STATIC, Groups.VEHICLE),
      );
      expect(overlap).toBeNull();
    } finally {
      s.physics.free();
    }
  });

  it('crosses both actual River Flat Camp logs at walking pace', async () => {
    const world = testWorld();
    const R = await loadRapier();
    for (const prop of world.map.props.filter((p) => p.kind === 'logSeat')) {
      const sim = new Simulation(R, world, lateAfternoon);
      try {
        const yaw = propYaw(prop.headingDeg);
        const dx = Math.sin(yaw);
        const dz = Math.cos(yaw);
        const v = sim.addVehicle('p', sim.poseAt(prop.x + dx * 3.5, prop.z + dz * 3.5, prop.headingDeg));
        const inputs = new Map([['p', emptyInput()]]);
        for (let i = 0; i < 60; i++) sim.step(inputs, DT);
        v.toggleRange();
        for (let i = 0; i < 22 / DT; i++) {
          inputs.set('p', { ...emptyInput(), ...crawl(v.speed) });
          sim.step(inputs, DT);
        }
        const progress = -(v.position.x - prop.x) * dx - (v.position.z - prop.z) * dz;
        expect(progress, `log at ${prop.x}, ${prop.z}`).toBeGreaterThan(2.5);
        expect(v.tiltDeg()).toBeLessThan(30);
      } finally {
        sim.physics.free();
      }
    }
  });

  for (const mode of ['high', 'low', 'precision'] as const) {
    for (const reverse of [false, true]) {
      for (const angle of [0, 45]) {
        it(`clears either camp log from a near standing start using ${mode} ${reverse ? 'reverse' : 'forward'} input at ${angle}°`, async () => {
          const world = testWorld();
          const R = await loadRapier();
          for (const prop of world.map.props.filter((p) => p.kind === 'logSeat')) {
            const sim = new Simulation(R, world, lateAfternoon);
            try {
              const heading = prop.headingDeg + angle;
              const radians = (heading * Math.PI) / 180;
              const dx = Math.sin(radians) * (reverse ? -1 : 1);
              const dz = -Math.cos(radians) * (reverse ? -1 : 1);
              const v = sim.addVehicle('p', sim.poseAt(prop.x - dx * 1.7, prop.z - dz * 1.7, heading));
              const inputs = new Map([['p', emptyInput()]]);
              // Neutral input must still step the suspension, as the real game does.
              for (let i = 0; i < 120; i++) sim.step(inputs, DT);
              if (mode !== 'high') v.toggleRange();
              v.precisionCrawl = mode === 'precision';
              let progress = -1.7;
              for (let i = 0; i < 20 / DT && progress < 2.8; i++) {
                // Match a held W or S key rather than a test-only speed controller.
                inputs.set('p', { ...emptyInput(), ...(reverse ? { brake: 1 } : { throttle: 1 }) });
                sim.step(inputs, DT);
                progress = (v.position.x - prop.x) * dx + (v.position.z - prop.z) * dz;
              }
              expect(progress, `log at ${prop.x}, ${prop.z}`).toBeGreaterThan(2.8);
              expect(v.tiltDeg()).toBeLessThan(35);
            } finally {
              sim.physics.free();
            }
          }
        });
      }
    }
  }
});
