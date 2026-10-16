import { describe, expect, it } from 'vitest';
import { SurfaceId } from '../src/data/surfaces';
import { floodTuning, plankTuning } from '../src/data/tools';
import { lateAfternoon } from '../src/data/environment';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { updateFlood } from '../src/sim/vehicle/flooding';
import { createCondition } from '../src/sim/vehicle/condition';
import { Winch } from '../src/sim/tools/winch';
import { headingOf, v3 } from '../src/sim/vehicle/math';
import { makeScene } from './helpers/scenes';
import { Autopilot } from '../src/sim/input/autopilot';
import { updateWear } from '../src/sim/vehicle/wear';
import { testWorld } from './world';

const DT = 1 / 60;

function runSim(
  sim: Simulation,
  seconds: number,
  input: Partial<VehicleInput> | (() => Partial<VehicleInput>),
): void {
  const inputs = new Map<string, VehicleInput>();
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    inputs.set('p', { ...emptyInput(), ...(typeof input === 'function' ? input() : input) });
    sim.step(inputs, DT);
  }
}

describe('engine flooding (M4)', () => {
  it('stalls after the intake has been under water for 10 s', async () => {
    // Water 1.5 m deep everywhere: the 0.9 m intake is submerged.
    const s = await makeScene({
      ground: { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.5 },
    });
    s.run(8, {});
    expect(s.vehicle.drivetrain.engineRunning).toBe(true);
    s.run(3, {});
    expect(s.vehicle.drivetrain.engineRunning).toBe(false);
    expect(s.vehicle.condition.flood.stalled).toBe(true);
  });

  it('only restarts after 20 s with the intake clear, on throttle', () => {
    const f = createCondition().flood;
    for (let t = 0; t < 11; t += DT) updateFlood(f, true, 0, DT);
    expect(f.stalled).toBe(true);
    for (let t = 0; t < 19; t += DT) updateFlood(f, false, 1, DT);
    expect(f.stalled).toBe(true);
    for (let t = 0; t < 1.5; t += DT) updateFlood(f, false, 1, DT);
    expect(f.stalled).toBe(false);
  });

  it('counts back down slowly when the intake comes out of the water', () => {
    const f = createCondition().flood;
    for (let t = 0; t < 6; t += DT) updateFlood(f, true, 0, DT);
    for (let t = 0; t < 4; t += DT) updateFlood(f, false, 0, DT);
    expect(f.timer).toBeCloseTo(6 - 4 * floodTuning.recoverRate, 1);
  });

  it('does not flood at the shallow Gravel Ford but does in the Deep Crossing channel', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const ford = world.pois.find((p) => p.id === 'gravel-ford')!;
    const v = sim.addVehicle('p', sim.poseAt(ford.x, ford.z, 330));
    runSim(sim, 12, {});
    expect(v.condition.flood.timer).toBe(0);
    // Deepest point near the Deep Crossing.
    let best = { x: 0, z: 0, d: 0 };
    const dc = world.pois.find((p) => p.id === 'deep-crossing')!;
    for (let dx = -8; dx <= 8; dx++)
      for (let dz = -8; dz <= 8; dz++) {
        const d = world.terrain.waterDepthAt(dc.x + dx, dc.z + dz);
        if (d > best.d) best = { x: dc.x + dx, z: dc.z + dz, d };
      }
    v.teleport(sim.poseAt(best.x, best.z, 20));
    runSim(sim, 11, {});
    expect(v.condition.flood.stalled).toBe(true);
  });
});

describe('winch (M4)', () => {
  it('winching in reduces the distance to the anchor', async () => {
    const s = await makeScene({});
    const winch = new Winch();
    const v = s.vehicle;
    const m = v.localToWorld(v.tuning.winchMount.x, v.tuning.winchMount.y, v.tuning.winchMount.z);
    winch.attach(v, {
      kind: 'tree',
      id: 'test',
      point: v3(m.x + 3, m.y, m.z - 16),
      radius: 0.3,
      label: 'Tree',
    });
    const d0 = winch.distance();
    for (let i = 0; i < 8 * 60; i++) {
      v.freeRoll = true;
      v.step(emptyInput(), DT);
      winch.step(v, true, false, DT);
      s.physics.step();
      v.postStep(DT);
    }
    expect(winch.distance()).toBeLessThan(d0 - 5);
    expect(winch.tension).toBeGreaterThan(0);
  });

  it('caps the pull at 1.5× the vehicle weight', async () => {
    const s = await makeScene({});
    const winch = new Winch();
    const v = s.vehicle;
    const m = v.localToWorld(0, 0, -2);
    // Anchor behind the vehicle with the handbrake on: the cable goes taut and stays capped.
    winch.attach(v, {
      kind: 'rock',
      id: 'test',
      point: v3(m.x, m.y, m.z - 5),
      radius: 0.1,
      label: 'Boulder',
    });
    let max = 0;
    for (let i = 0; i < 6 * 60; i++) {
      v.step({ ...emptyInput(), brake: 1, throttle: 1 }, DT);
      winch.step(v, true, false, DT);
      s.physics.step();
      v.postStep(DT);
      max = Math.max(max, winch.tension);
    }
    expect(max).toBeLessThanOrEqual(1.5 * v.tuning.mass * 9.81 + 1);
  });

  it('the Bog Hole traps the car in high range and the winch pulls it out', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const bog = world.map.bogs[0];
    // Sit in the middle of the bog facing along the track (east-ish) and let it sink.
    const v = sim.addVehicle('p', sim.poseAt(bog.x, bog.z, 95));
    runSim(sim, 3, {});
    const p0 = { ...v.body.translation() };
    runSim(sim, 8, { throttle: 1 });
    const p1 = v.body.translation();
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(bog.radiusX * 0.8);
    expect(Math.hypot(p1.x - bog.x, p1.z - bog.z)).toBeLessThan(bog.radiusX);
    // Winch to an anchor and reel in.
    sim.quickAttach('p');
    expect(sim.toolsOf('p').winch.attached).toBe(true);
    runSim(sim, 20, { winchIn: true, throttle: 0.4 });
    const p2 = v.body.translation();
    expect(Math.hypot(p2.x - bog.x, p2.z - bog.z)).toBeGreaterThan(bog.radiusX + 1);
  });
});

describe('planks and the Washout Gully (M4)', () => {
  async function gullySetup() {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const g = world.features.gullies[0];
    // The mine track crosses the gully near z = 316; start 5 m before it.
    const track = world.features.tracks.find((t) => t.def.id === 'mine-track')!;
    let k = 0;
    for (let i = 0; i < track.poly.count; i++) if (track.poly.xs[i] < g.def.x) k = i;
    const s = Math.max(0, k - 5);
    const heading = headingOf(track.poly.xs[k] - track.poly.xs[s], track.poly.zs[k] - track.poly.zs[s]);
    const v = sim.addVehicle('p', sim.poseAt(track.poly.xs[s], track.poly.zs[s], heading));
    sim.toolsOf('p').planks.carried = plankTuning.count;
    // Settle and come to a stop, as a driver would before getting the planks out.
    runSim(sim, 1.5, { handbrake: true });
    if (v.drivetrain.range === 'high') v.toggleRange();
    runSim(sim, 0.5, { handbrake: true });
    return { sim, v, g };
  }

  it('fails to cross the 1.2 m gap without planks', async () => {
    const { sim, v, g } = await gullySetup();
    const p0 = v.body.translation();
    const f = v.forward();
    const path: [number, number][] = [];
    for (let s = 0; s <= 25; s += 0.5) path.push([p0.x + f.x * s, p0.z + f.z * s]);
    const pilot = new Autopilot(path, 1.4);
    pilot.lowRange = true;
    runSim(sim, 25, () => pilot.input(v, DT));
    const p = v.body.translation();
    expect(p.x).toBeLessThan(g.def.x + 4);
  });

  it('crosses on planks', async () => {
    const { sim, v, g } = await gullySetup();
    const kit = sim.toolsOf('p').planks;
    // Line the planks up so their middle sits over the gap.
    const p = v.body.translation();
    const frontToGap = Math.abs(g.def.x - p.x) - Math.abs(v.tuning.wheels[0].z);
    kit.distance = Math.max(0, frontToGap - plankTuning.length / 2 - v.tuning.wheelRadius * 0.6);
    expect(sim.placePlanks('p')).toBe(true);
    runSim(sim, 1, { handbrake: true });
    // Steer along the planks at a crawl, as a driver would.
    const mid = kit.placed.map((pl) => pl.body.translation());
    const cx = (mid[0].x + mid[1].x) / 2;
    const cz = (mid[0].z + mid[1].z) / 2;
    const p0 = v.body.translation();
    const dx = cx - p0.x;
    const dz = cz - p0.z;
    const len = Math.hypot(dx, dz);
    const path: [number, number][] = [];
    for (let s = 0; s <= len + 15; s += 0.5) path.push([p0.x + (dx / len) * s, p0.z + (dz / len) * s]);
    const pilot = new Autopilot(path, 1.4);
    pilot.lowRange = true;
    runSim(sim, 25, () => pilot.input(v, DT));
    expect(v.body.translation().x).toBeGreaterThan(g.def.x + 4);
    expect(v.tiltDeg()).toBeLessThan(45);
  });
});

describe('jack, campsite return and light damage (M4)', () => {
  it('rights an upside-down car after holding J', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const camp = world.pois.find((p) => p.id === 'river-flat-camp')!;
    const v = sim.addVehicle('p', sim.poseAt(camp.x, camp.z, 0));
    const p = v.body.translation();
    v.body.setTranslation({ x: p.x, y: p.y + 1.5, z: p.z }, true);
    v.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
    runSim(sim, 3, {});
    expect(v.tiltDeg()).toBeGreaterThan(90);
    expect(sim.toolsOf('p').jack.state).toBe('available');
    runSim(sim, 1.6, { jack: true });
    expect(sim.toolsOf('p').jack.state).toBe('righting');
    runSim(sim, 3, {});
    expect(v.tiltDeg()).toBeLessThan(15);
    expect(v.wheels.filter((w) => w.contact).length).toBeGreaterThanOrEqual(3);
  });

  it('returns to the campsite with flooding cleared and planks back on the rack', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const v = sim.addVehicle('p', sim.poseAt(100, 300, 90));
    runSim(sim, 1, { handbrake: true });
    sim.placePlanks('p');
    v.condition.flood.timer = 11;
    v.condition.flood.stalled = true;
    sim.returnToCampsite('p', 'mountain-hut');
    const hut = world.pois.find((p) => p.id === 'mountain-hut')!;
    const pos = v.body.translation();
    expect(Math.hypot(pos.x - hut.reset!.x, pos.z - hut.reset!.z)).toBeLessThan(1);
    expect(v.condition.flood.stalled).toBe(false);
    expect(sim.toolsOf('p').planks.carried).toBe(2);
    expect(sim.toolsOf('p').planks.placed.length).toBe(0);
  });

  it('a hard landing dents the body', async () => {
    const s = await makeScene({});
    const p = s.vehicle.body.translation();
    s.vehicle.body.setTranslation({ x: p.x, y: p.y + 5, z: p.z }, true);
    s.vehicle.body.setLinvel({ x: 0, y: -4, z: 6 }, true);
    for (let i = 0; i < 120; i++) {
      s.vehicle.step(emptyInput(), DT);
      s.physics.step();
      s.vehicle.postStep(DT);
      updateWear(s.vehicle, DT);
    }
    expect(s.vehicle.condition.dents.length).toBeGreaterThan(0);
    for (const d of s.vehicle.condition.dents) expect(d.depth).toBeLessThanOrEqual(0.11);
  });

  it('dirt builds up on dirt and partly washes off in water', async () => {
    const R = await loadRapier();
    const world = testWorld();
    const sim = new Simulation(R, world, lateAfternoon);
    const track = world.features.tracks.find((t) => t.def.id === 'north-bank')!;
    const k = 20;
    const heading = headingOf(
      track.poly.xs[k + 5] - track.poly.xs[k],
      track.poly.zs[k + 5] - track.poly.zs[k],
    );
    const v = sim.addVehicle('p', sim.poseAt(track.poly.xs[k], track.poly.zs[k], heading));
    const path: [number, number][] = [];
    for (let i = k; i < track.poly.count; i++) path.push([track.poly.xs[i], track.poly.zs[i]]);
    const pilot = new Autopilot(path, 10);
    runSim(sim, 10, () => pilot.input(v, DT));
    const dirty = v.condition.dirt.sides;
    expect(dirty).toBeGreaterThan(0.02);
    const ford = world.pois.find((p) => p.id === 'gravel-ford')!;
    v.condition.dirt.sides = 0.8;
    v.teleport(sim.poseAt(ford.x, ford.z, 330));
    runSim(sim, 10, {});
    expect(v.condition.dirt.sides).toBeLessThan(0.8);
    expect(v.condition.dirt.sides).toBeGreaterThan(0.2);
  });
});
