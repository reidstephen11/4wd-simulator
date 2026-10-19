import { describe, expect, it } from 'vitest';
import { environmentFor, type EnvironmentConfig } from '../src/data/environment';
import { ironbarkParkMap } from '../src/data/park';
import { perentieTuning } from '../src/data/perentie';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import { addPuddles } from '../src/sim/world/puddles';
import { buildWorld } from '../src/sim/world/world';
import { makeScene } from './helpers/scenes';

const clear = environmentFor({ time: 'midday', weather: 'clear' });
const wet = environmentFor({ time: 'midday', weather: 'wet' });
const rain = environmentFor({ time: 'midday', weather: 'rain' });

/** Full brakes from 60 km/h on flat dirt: stopping distance, most wheels locked at once, and yaw. */
async function stop(tuning: typeof vehicleTuning, env: EnvironmentConfig) {
  const s = await makeScene({ tuning, speed: 60 / 3.6, env });
  s.run(0.3, { throttle: 0.4 });
  const p0 = s.vehicle.body.translation();
  const f0 = s.vehicle.forward();
  let locked = 0;
  for (let t = 0; s.vehicle.speed > 0.2 && t < 15; t += 0.05) {
    s.run(0.05, { brake: 1 });
    locked = Math.max(locked, s.vehicle.wheels.filter((w) => w.skid > 0).length);
  }
  const p1 = s.vehicle.body.translation();
  const f1 = s.vehicle.forward();
  const yaw = (Math.acos(Math.min(1, f0.x * f1.x + f0.z * f1.z)) * 180) / Math.PI;
  s.physics.world.free();
  return { distance: Math.hypot(p1.x - p0.x, p1.z - p0.z), locked, yaw };
}

describe('wet weather', () => {
  for (const tuning of [vehicleTuning, perentieTuning])
    it(`the ${tuning.name} stops further on wet dirt, locking wheels, and still in a straight line`, async () => {
      const dry = await stop(tuning, clear);
      const damp = await stop(tuning, wet);
      const soaked = await stop(tuning, rain);
      // Dry: the brakes stop it short of locking (the rear valve keeps the rears rolling).
      expect(dry.locked).toBe(0);
      expect(dry.distance).toBeLessThan(18);
      expect(damp.distance).toBeGreaterThan(dry.distance * 1.08);
      expect(soaked.distance).toBeGreaterThan(dry.distance * 1.15);
      expect(soaked.distance).toBeGreaterThanOrEqual(damp.distance);
      expect(damp.locked).toBeGreaterThanOrEqual(2);
      expect(soaked.locked).toBeGreaterThanOrEqual(2);
      for (const r of [dry, damp, soaked]) expect(r.yaw).toBeLessThan(5);
    }, 60_000);

  it('leaves puddles on the flat stretches of the tracks after rain, and more in rain', async () => {
    expect(addPuddles(buildWorld(ironbarkParkMap), clear)).toEqual([]);
    const after = addPuddles(buildWorld(ironbarkParkMap), wet);
    const world = buildWorld(ironbarkParkMap);
    const puddles = addPuddles(world, rain);
    expect(after.length).toBeGreaterThan(10);
    expect(puddles.length).toBeGreaterThan(after.length * 2);
    const lines = new Set(world.map.crawlTrails!.map((t) => t.trackId));
    const t = world.terrain;
    for (const p of puddles) {
      const where = `puddle at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`;
      expect(p.depth, where).toBeGreaterThan(0.02);
      expect(p.depth, where).toBeLessThan(0.2);
      expect(t.surfaceAt(p.x, p.z), where).toBe(SurfaceId.Water);
      expect(t.waterDepthAt(p.x, p.z, rain.waterLevelOffset), where).toBeGreaterThan(0);
      // On a track, and never on one of the stations' obstacle lines.
      const on = world.features.tracks.filter(
        (tr) => trailProgress(tr, p.x, p.z).distance < tr.def.width / 2,
      );
      expect(on.length, where).toBeGreaterThan(0);
      expect(
        on.some((tr) => lines.has(tr.def.id)),
        where,
      ).toBe(false);
    }

    // Driving straight through the deepest one wets the wheels.
    const deepest = [...puddles].sort((a, b) => b.depth - a.depth)[0];
    const track = world.features.tracks.find(
      (tr) => trailProgress(tr, deepest.x, deepest.z).distance < tr.def.width / 2,
    )!;
    const { headingDeg } = trailPoint(track, trailProgress(track, deepest.x, deepest.z).along);
    const yaw = (headingDeg * Math.PI) / 180;
    const sim = new Simulation(await loadRapier(), world, rain);
    const v = sim.addVehicle(
      'p',
      sim.poseAt(deepest.x - Math.sin(yaw) * 10, deepest.z + Math.cos(yaw) * 10, headingDeg),
      perentieTuning,
    );
    const inputs = new Map([['p', { ...emptyInput(), throttle: 0.35 }]]);
    let water = 0;
    for (let i = 0; i < 60 * 8; i++) {
      sim.step(inputs, 1 / 60);
      for (const w of v.wheels) water = Math.max(water, w.water);
    }
    sim.physics.free();
    expect(water).toBeGreaterThan(deepest.depth * 0.5);
  }, 120_000);
});
