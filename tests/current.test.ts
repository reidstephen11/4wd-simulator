import { describe, expect, it } from 'vitest';
import { hiluxTuning } from '../src/data/hilux';
import { perentieTuning } from '../src/data/perentie';
import { troopyTuning } from '../src/data/troopy';
import { unimogTuning } from '../src/data/unimog';
import { SurfaceId, sweptTuning } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { WaterCurrent } from '../src/sim/world/current';
import type { CreekInfo } from '../src/sim/world/features';
import { densify } from '../src/sim/world/polyline';
import { makeScene } from './helpers/scenes';

/** A straight creek 20 m wide from `from` to `to`, running at 2 m/s mid-channel. */
function creek(from: [number, number], to: [number, number]): CreekInfo {
  const poly = densify([from, to], 1);
  const fill = (x: number) => new Float32Array(poly.count).fill(x);
  return {
    def: { id: 'c', name: 'Creek', points: [] },
    poly,
    water: fill(0),
    halfWidth: fill(10),
    flow: fill(2),
  };
}

/** Flat ground under water `depth` deep, running east at `flow` m/s. */
function river(depth: number, flow: number) {
  return {
    surfaceAt: () => SurfaceId.Water,
    waterSurfaceAt: () => depth,
    waterFlowAt: (_x: number, _z: number, out: { x: number; z: number }) => {
      out.x = flow;
      out.z = 0;
      return out;
    },
  };
}

describe('running water', () => {
  it('runs down each creek from its first point to its last, fastest mid-channel', () => {
    const current = new WaterCurrent([creek([0, 0], [100, 0]), creek([0, 100], [0, 300])]);
    const mid = current.at(50, 0);
    expect(mid.x).toBeCloseTo(2, 2);
    expect(mid.z).toBeCloseTo(0, 2);
    const edge = current.at(50, 9);
    expect(edge.x).toBeGreaterThan(0.9);
    expect(edge.x).toBeLessThan(mid.x - 0.5);
    // Dry ground beside it and far away is still.
    expect(current.at(50, 12).x).toBe(0);
    expect(current.at(500, 500)).toEqual({ x: 0, z: 0 });
    // The second creek runs south.
    expect(current.at(0, 200).z).toBeCloseTo(2, 2);
  });

  it('pushes a vehicle crossing it: the tail swings downstream in water over the hubs', async () => {
    const drive = async (depth: number, flow: number) => {
      const s = await makeScene({ ground: river(depth, flow) });
      const v = s.vehicle;
      s.run(10, { throttle: 0.4 });
      const f = v.forward();
      const r = { yaw: Math.atan2(f.x, -f.z) * (180 / Math.PI), north: -v.position.z, swept: v.swept };
      s.physics.world.free();
      return r;
    };
    // Shallow water barely moves it; over the hubs the current swings it round and holds it back.
    const shallow = await drive(0.3, 2);
    const still = await drive(0.55, 0);
    const running = await drive(0.55, 2);
    expect(Math.abs(shallow.yaw)).toBeLessThan(8);
    expect(Math.abs(still.yaw)).toBeLessThan(1);
    expect(Math.abs(running.yaw)).toBeGreaterThan(12);
    expect(running.north).toBeLessThan(still.north - 3);
    expect(running.swept).toBe(0);
  });

  it('lifts the vehicle off its tyres in deep water, and a current then carries it away', async () => {
    for (const tuning of [vehicleTuning, perentieTuning, hiluxTuning]) {
      const s = await makeScene({ tuning, ground: river(1.3, 0) });
      const v = s.vehicle;
      s.run(6, {});
      // Still water lifts it but leaves it where it is.
      expect(v.afloat, tuning.name).toBeGreaterThan(sweptTuning.lift);
      expect(v.swept).toBe(0);
      s.physics.world.free();

      const r = await makeScene({ tuning, ground: river(1.3, 2) });
      const x0 = r.vehicle.position.x;
      let swept = 0;
      for (let t = 0; t < 10 && swept < sweptTuning.seconds; t += 0.5) {
        r.run(0.5, {});
        swept = r.vehicle.swept;
      }
      expect(swept, tuning.name).toBeGreaterThanOrEqual(sweptTuning.seconds);
      expect(r.vehicle.position.x - x0, tuning.name).toBeGreaterThan(3);
      r.physics.world.free();
    }
  });

  it('leaves the 7 t Unimog standing in 1.3 m of running water, where the others are carried off, until it drowns its intake', async () => {
    const s = await makeScene({ tuning: unimogTuning, ground: river(1.3, 2) });
    const x0 = s.vehicle.position.x;
    s.run(10, {});
    expect(s.vehicle.afloat).toBeLessThan(sweptTuning.lift);
    expect(s.vehicle.swept).toBe(0);
    expect(s.vehicle.position.x - x0).toBeLessThan(1);
    expect(s.vehicle.condition.flood.stalled).toBe(false);
    s.physics.world.free();
    const deep = await makeScene({ tuning: unimogTuning, ground: river(unimogTuning.intakeHeight + 0.5, 0) });
    deep.run(12, { throttle: 0.3 });
    expect(deep.vehicle.condition.flood.stalled).toBe(true);
    deep.physics.world.free();
  });
});

describe('the heavy Troop Carrier in running water', () => {
  /** Seconds the current had it, at most, and how far it drifted, over 10 s parked in a river. */
  async function drift(depth: number, flow: number) {
    const s = await makeScene({ tuning: troopyTuning, ground: river(depth, flow) });
    const x0 = s.vehicle.position.x;
    let swept = 0;
    for (let t = 0; t < 10 && swept < sweptTuning.seconds; t += 0.5) {
      s.run(0.5, {});
      swept = Math.max(swept, s.vehicle.swept);
    }
    const out = { swept, drift: s.vehicle.position.x - x0 };
    s.physics.world.free();
    return out;
  }

  it('holds its ground where the current carries the others away, but not in deeper, faster water', async () => {
    const holds = await drift(1.3, 2);
    expect(holds.swept).toBeLessThan(sweptTuning.seconds);
    expect(holds.drift).toBeLessThan(5);
    const goes = await drift(1.5, 2.5);
    expect(goes.swept).toBeGreaterThanOrEqual(sweptTuning.seconds);
    expect(goes.drift).toBeGreaterThan(3);
  });
});
