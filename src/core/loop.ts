import { MAX_STEPS_PER_FRAME, PHYSICS_DT } from './config';

export interface LoopCallbacks {
  /** Advance the simulation by exactly PHYSICS_DT. */
  step(dt: number): void;
  /** Draw a frame. `alpha` (0..1) interpolates between the last two sim states. */
  render(alpha: number, frameDt: number): void;
}

/** Something that calls back once per frame: Three.js's renderer.setAnimationLoop. */
export interface FrameScheduler {
  setAnimationLoop(cb: ((time: number) => void) | null): void;
}

/** Main-thread time per drawn frame (ms), smoothed. */
export interface LoopTimings {
  sim: number;
  render: number;
  steps: number;
}

/**
 * With the cap on, a screen refresh that ran no physics step is drawn only once this long has
 * passed since the last drawn frame (ms): just under a 60 Hz frame, so a 60 Hz screen draws
 * every refresh and a 120 Hz one about every other.
 */
export const MIN_DRAW_MS = 15;
/**
 * A refresh that did run a step is drawn once this long has passed (ms). Above a 120 Hz frame,
 * so two steps on neighbouring refreshes (the clock's phase drifting) still draw once; below a
 * 90 Hz frame, so a 90 Hz screen, which steps on two refreshes in three, draws every step.
 */
export const MIN_STEP_DRAW_MS = 9.5;

/**
 * Fixed 60 Hz simulation step with interpolated rendering (SPEC §3 core/).
 * While paused the simulation stops but frames keep rendering.
 */
export class GameLoop {
  paused = false;
  /** Scales simulated time (1 = real time). */
  timeScale = 1;
  /**
   * Browser tests on a software renderer, where a frame can take seconds: run this many
   * steps every frame, whatever the frame took (0 = keep to the clock).
   */
  fixedSteps = 0;
  /**
   * Draw at most about as often as the physics steps (v1.49). A 120 Hz phone otherwise drew
   * every frame twice per step, colour and shadow pass both, for a picture that moved only by
   * interpolation, and ran hot. Off ("Frame rate: Screen") draws on every refresh.
   */
  capFrameRate = true;
  readonly timings: LoopTimings = { sim: 0, render: 0, steps: 0 };
  private acc = 0;
  private last = 0;
  private lastDraw = 0;
  /** Simulation time and steps since the last drawn frame. */
  private simMs = 0;
  private stepsSinceDraw = 0;
  private raf = 0;
  private running = false;

  /**
   * `scheduler`: the renderer's animation loop, which follows the headset's frames while a
   * headset session is on (the page's own frames stop then). Without one, the page's frames.
   */
  constructor(
    private readonly cb: LoopCallbacks,
    private readonly scheduler: FrameScheduler | null = null,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.lastDraw = this.last;
    if (this.scheduler) this.scheduler.setAnimationLoop(this.frame);
    else this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.scheduler) this.scheduler.setAnimationLoop(null);
    else cancelAnimationFrame(this.raf);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    if (!this.scheduler) this.raf = requestAnimationFrame(this.frame);
    const frameDt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const t0 = performance.now();
    let steps = 0;
    if (!this.paused && this.fixedSteps > 0) {
      for (; steps < this.fixedSteps && !this.paused; steps++) this.cb.step(PHYSICS_DT);
      this.acc = 0;
    } else if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      // A step can pause the game (a note to read, the episode ending): stop there.
      while (this.acc >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME && !this.paused) {
        this.cb.step(PHYSICS_DT);
        this.acc -= PHYSICS_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    const t1 = performance.now();
    this.simMs += t1 - t0;
    this.stepsSinceDraw += steps;
    // Tests driving fixed steps and a paused game (the menus still animate) draw every refresh.
    if (
      this.capFrameRate &&
      !this.paused &&
      this.fixedSteps === 0 &&
      now - this.lastDraw < (steps > 0 ? MIN_STEP_DRAW_MS : MIN_DRAW_MS)
    )
      return;
    const drawDt = Math.min(0.25, Math.max(0, (now - this.lastDraw) / 1000));
    this.lastDraw = now;
    this.cb.render(this.paused ? 1 : this.acc / PHYSICS_DT, drawDt);
    const t2 = performance.now();
    const k = 0.1;
    this.timings.sim += (this.simMs - this.timings.sim) * k;
    this.timings.render += (t2 - t1 - this.timings.render) * k;
    this.timings.steps += (this.stepsSinceDraw - this.timings.steps) * k;
    this.simMs = 0;
    this.stepsSinceDraw = 0;
  };
}
