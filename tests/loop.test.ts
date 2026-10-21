import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/core/loop';
import { CATCH_UP_SECONDS, MAX_STEPS_PER_FRAME, PHYSICS_DT } from '../src/core/config';

/** A loop driven by hand: `frame(ms)` draws the next frame `ms` after the last one. */
function drivenLoop() {
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const seen = { steps: 0, frameDt: 0 };
  const loop = new GameLoop({
    step: () => seen.steps++,
    render: (_alpha, frameDt) => (seen.frameDt = frameDt),
  });
  let now = performance.now();
  loop.start();
  const frame = (ms: number) => {
    now += ms;
    pending!(now);
  };
  // Start from a frame boundary: the first frame's length depends on the clock.
  frame(1);
  seen.steps = 0;
  return { loop, frame, seen };
}

afterEach(() => vi.unstubAllGlobals());

describe('game loop pacing', () => {
  it('simulates at most a few steps for a slow frame, so the game slows down', () => {
    const { loop, frame, seen } = drivenLoop();
    frame(5000);
    expect(seen.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(seen.frameDt).toBe(0.25);
    // The real frame time is kept for the fps shown in the debug overlay.
    expect(loop.frameSeconds).toBeCloseTo(5, 6);
  });

  it('simulates up to a second of each slow frame when catching up', () => {
    const { loop, frame, seen } = drivenLoop();
    loop.catchUp = true;
    frame(5000);
    expect(seen.steps).toBe(Math.round(CATCH_UP_SECONDS / PHYSICS_DT));
    // Shorter frames are simulated in full: the game keeps up with real time.
    seen.steps = 0;
    let real = 0;
    for (const ms of [400, 900, 650, 16]) {
      frame(ms);
      real += ms / 1000;
    }
    expect(Math.abs(seen.steps * PHYSICS_DT - real)).toBeLessThan(PHYSICS_DT * 1.01);
    // Animations still take at most a quarter of a second per frame.
    frame(900);
    expect(seen.frameDt).toBe(0.25);
  });

  it('steps once per frame at 60 fps either way', () => {
    for (const catchUp of [false, true]) {
      const { loop, frame, seen } = drivenLoop();
      loop.catchUp = catchUp;
      for (let i = 0; i < 120; i++) frame(1000 / 60);
      expect(Math.abs(seen.steps - 120)).toBeLessThanOrEqual(1);
    }
  });
});
