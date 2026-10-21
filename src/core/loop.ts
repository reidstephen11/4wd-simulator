import { CATCH_UP_SECONDS, MAX_STEPS_PER_FRAME, PHYSICS_DT } from './config';

export interface LoopCallbacks {
  /** Advance the simulation by exactly PHYSICS_DT. */
  step(dt: number): void;
  /** Draw a frame. `alpha` (0..1) interpolates between the last two sim states. */
  render(alpha: number, frameDt: number): void;
}

/** Main-thread time per frame (ms), smoothed. */
export interface LoopTimings {
  sim: number;
  render: number;
  steps: number;
}

/**
 * Fixed 60 Hz simulation step with interpolated rendering (SPEC §3 core/).
 * While paused the simulation stops but frames keep rendering.
 */
export class GameLoop {
  paused = false;
  /** Scales simulated time (1 = real time). */
  timeScale = 1;
  /**
   * Simulate up to CATCH_UP_SECONDS of a slow frame instead of MAX_STEPS_PER_FRAME steps.
   * Off for players (a slow frame slows the game down instead); the browser tests turn it
   * on because the software renderer takes seconds to draw each frame.
   */
  catchUp = false;
  /** Real time since the previous frame (s); `frameDt` stops at 0.25 s. */
  frameSeconds = 0;
  readonly timings: LoopTimings = { sim: 0, render: 0, steps: 0 };
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    this.frameSeconds = Math.max(0, (now - this.last) / 1000);
    const frameDt = Math.min(0.25, this.frameSeconds);
    this.last = now;
    const t0 = performance.now();
    let steps = 0;
    if (!this.paused) {
      const limit = this.catchUp ? Math.round(CATCH_UP_SECONDS / PHYSICS_DT) : MAX_STEPS_PER_FRAME;
      this.acc += (this.catchUp ? Math.min(CATCH_UP_SECONDS, this.frameSeconds) : frameDt) * this.timeScale;
      while (this.acc >= PHYSICS_DT && steps < limit) {
        this.cb.step(PHYSICS_DT);
        this.acc -= PHYSICS_DT;
        steps++;
      }
      if (steps === limit) this.acc = 0;
    }
    const t1 = performance.now();
    this.cb.render(this.paused ? 1 : this.acc / PHYSICS_DT, frameDt);
    const t2 = performance.now();
    const k = 0.1;
    this.timings.sim += (t1 - t0 - this.timings.sim) * k;
    this.timings.render += (t2 - t1 - this.timings.render) * k;
    this.timings.steps += (steps - this.timings.steps) * k;
  };
}
