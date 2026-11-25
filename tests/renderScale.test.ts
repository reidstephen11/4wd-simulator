import { describe, expect, it } from 'vitest';
import { RenderScale } from '../src/render/renderScale';

const run = (r: RenderScale, seconds: number, frameMs: number, cpuMs: number) => {
  for (let t = 0; t < seconds; t += frameMs / 1000) r.update(frameMs / 1000, cpuMs);
};

describe('render scale', () => {
  it('lowers the resolution step by step while the graphics hold the frame rate down, to its floor', () => {
    const r = new RenderScale(0.7);
    run(r, 3, 45, 8);
    expect(r.scale).toBeLessThan(1);
    run(r, 20, 45, 8);
    expect(r.scale).toBeCloseTo(0.7);
  });

  it('leaves the resolution alone when the game code is what takes the time', () => {
    const r = new RenderScale(0.7);
    run(r, 20, 45, 40);
    expect(r.scale).toBe(1);
  });

  it('puts the resolution back once frames are quick again, after a pause', () => {
    const r = new RenderScale(0.7);
    run(r, 3, 45, 8);
    run(r, 1, 16.7, 8); // the average catches up
    const low = r.scale;
    run(r, 4, 16.7, 8);
    expect(r.scale).toBe(low);
    run(r, 40, 16.7, 8);
    expect(r.scale).toBe(1);
  });

  it('steps down at 39 frames a second when the graphics are the limit (a Pixel 10a in the trees)', () => {
    const r = new RenderScale(0.7);
    run(r, 3, 25.8, 10.6);
    expect(r.scale).toBeLessThan(1);
  });

  it('waits longer each time going back up made it slow again', () => {
    const r = new RenderScale(0.7);
    run(r, 1.5, 30, 8); // down to 0.9, held 10 s
    expect(r.scale).toBeCloseTo(0.9);
    run(r, 15, 16.7, 8); // back up to 1
    expect(r.scale).toBe(1);
    run(r, 1.5, 30, 8); // slow again straight away: down, held 20 s
    expect(r.scale).toBeCloseTo(0.9);
    run(r, 15, 16.7, 8);
    expect(r.scale).toBeCloseTo(0.9);
    run(r, 10, 16.7, 8);
    expect(r.scale).toBe(1);
  });

  it('never goes below 1 when the floor is 1', () => {
    const r = new RenderScale(1);
    run(r, 20, 60, 5);
    expect(r.scale).toBe(1);
  });
});
