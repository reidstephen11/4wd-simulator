import { describe, expect, it } from 'vitest';
import { campCrawlCourse } from '../src/data/crawlCourse';
import { lateAfternoon } from '../src/data/environment';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { coursePoint } from '../src/sim/world/crawlCourse';
import { testWorld } from './world';

const DT = 1 / 60;

describe('Camp Rock Course', () => {
  for (const line of campCrawlCourse.lines)
    it(`drives the ${line.difficulty} ${line.name} line at ${line.difficulty === 'hard' ? 'half' : 'full'} crawl input`, async () => {
      const crawlInput = line.difficulty === 'hard' ? 0.5 : 1;
      const world = testWorld();
      const R = await loadRapier();
      const sim = new Simulation(R, world, lateAfternoon);
      try {
        const start = coursePoint(campCrawlCourse, line.offset, -2);
        const v = sim.addVehicle('p', sim.poseAt(start.x, start.z, campCrawlCourse.headingDeg));
        const inputs = new Map<string, VehicleInput>([['p', emptyInput()]]);
        for (let i = 0; i < 60; i++) sim.step(inputs, DT);
        inputs.set('p', {
          ...emptyInput(),
          toggleRange: true,
          togglePrecision: true,
          toggleFrontDiff: line.difficulty !== 'easy',
          toggleRearDiff: line.difficulty !== 'easy',
        });
        sim.step(inputs, DT);
        const path = Array.from({ length: 60 }, (_, i) => {
          const p = coursePoint(campCrawlCourse, line.offset, -2 + i * 0.5);
          return [p.x, p.z] as [number, number];
        });
        const pilot = new Autopilot(path, 0.7);
        pilot.lowRange = true;
        let rockContacts = 0;
        let maxSpeed = 0;
        let maxTilt = 0;
        let maxDeviation = 0;
        for (let i = 0; i < 90 / DT; i++) {
          const command = pilot.input(v, DT);
          // Taller ledges need a slower approach; half input retains the former crawl target.
          command.throttle = crawlInput;
          command.brake = 0;
          inputs.set('p', command);
          sim.step(inputs, DT);
          rockContacts += v.wheels.filter((w) => w.contact && w.surface === SurfaceId.Rock).length;
          maxSpeed = Math.max(maxSpeed, Math.abs(v.speed));
          maxTilt = Math.max(maxTilt, v.tiltDeg());
          maxDeviation = Math.max(maxDeviation, Math.abs(v.position.x - start.x));
          if (v.position.z < campCrawlCourse.z - campCrawlCourse.length - 1) break;
        }
        expect(v.position.z, `${line.id}: ${JSON.stringify(v.position)} speed ${v.speed}`).toBeLessThan(
          campCrawlCourse.z - campCrawlCourse.length,
        );
        expect(rockContacts).toBeGreaterThan(60);
        expect(maxTilt).toBeLessThan(35);
        expect(maxSpeed).toBeLessThan((crawlInput * vehicleTuning.crawling.forwardKmh) / 3.6 + 0.4);
        expect(maxDeviation).toBeLessThan(1.5);
        expect(world.pois.some((p) => p.id === campCrawlCourse.id)).toBe(true);
      } finally {
        sim.physics.free();
      }
    });
});
