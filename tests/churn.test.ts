import { describe, expect, it } from 'vitest';
import { SurfaceId } from '../src/data/surfaces';
import { ChurnMap } from '../src/sim/world/churn';

describe('ChurnMap', () => {
  it('cuts up wet clay under a spinning wheel, losing grip there and nowhere else', () => {
    const m = new ChurnMap();
    for (let t = 0; t < 10; t += 0.1) m.work(1, 1, SurfaceId.Clay, 1, 0, 1, 0.1);
    expect(m.at(1, 1)).toBe(1);
    expect(m.grip(1, 1, SurfaceId.Clay)).toBeCloseTo(0.7);
    expect(m.grip(10, 10, SurfaceId.Clay)).toBe(1);
    expect(m.grip(1, 1, SurfaceId.Rock)).toBe(1);
  });

  it('churns dry clay slower than wet, rolling slower than spinning, and leaves rock alone', () => {
    const wet = new ChurnMap();
    const dry = new ChurnMap();
    const rolled = new ChurnMap();
    const rock = new ChurnMap();
    wet.work(0, 0, SurfaceId.Clay, 1, 0, 1, 1);
    dry.work(0, 0, SurfaceId.Clay, 1, 0, 0, 1);
    rolled.work(0, 0, SurfaceId.Clay, 0, 5, 1, 0.4);
    rock.work(0, 0, SurfaceId.Rock, 1, 0, 1, 1);
    expect(dry.at(0, 0)).toBeLessThan(wet.at(0, 0) / 3);
    expect(rolled.at(0, 0)).toBeLessThan(wet.at(0, 0) / 10);
    expect(rock.at(0, 0)).toBe(0);
  });

  it('tears wet grass up faster than clay and to less grip, but barely marks dry grass', () => {
    const clay = new ChurnMap();
    const wet = new ChurnMap();
    const dry = new ChurnMap();
    clay.work(0, 0, SurfaceId.Clay, 1, 0, 1, 1);
    wet.work(0, 0, SurfaceId.Grass, 1, 0, 1, 1);
    dry.work(0, 0, SurfaceId.Grass, 1, 0, 0, 1);
    expect(wet.at(0, 0)).toBeGreaterThan(clay.at(0, 0));
    expect(dry.at(0, 0)).toBeLessThan(wet.at(0, 0) / 5);
    for (let t = 0; t < 10; t += 0.1) wet.work(0, 0, SurfaceId.Grass, 1, 0, 1, 0.1);
    expect(wet.grip(0, 0, SurfaceId.Grass)).toBeLessThan(clay.grip(0, 0, SurfaceId.Clay));
  });
});
