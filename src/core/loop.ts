import { MAX_STEPS_PER_FRAME, PHYSICS_DT } from './config';

export interface LoopCallbacks {
  /** Advance the simulation by exactly PHYSICS_DT. */
  step(dt: number): void;
  /** Draw a frame. `alpha` (0..1) interpolates between the last two sim states. */
  render(alpha: number, frameDt: number): void;
}

/**
 * Fixed 60 Hz simulation step with interpolated rendering (SPEC §3 core/).
 * While paused the simulation stops but frames keep rendering.
 */
export class GameLoop {
  paused = false;
  /** Scales simulated time (1 = real time). */
  timeScale = 1;
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
    const frameDt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      let steps = 0;
      while (this.acc >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME) {
        this.cb.step(PHYSICS_DT);
        this.acc -= PHYSICS_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    this.cb.render(this.paused ? 1 : this.acc / PHYSICS_DT, frameDt);
  };
}
