import type * as THREE from 'three';

/** Debug overlay (SPEC §10): FPS, frame-time graph, draw calls, triangles, plus custom lines. */
export class DebugOverlay {
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly graph: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly times: number[] = [];
  private acc = 0;
  private frames = 0;
  fps = 0;
  /** Average frame time (ms) over the last second. */
  frameMs = 0;
  private lines: string[] = [];

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.graph = document.createElement('canvas');
    this.graph.width = 180;
    this.graph.height = 48;
    this.text = document.createElement('pre');
    this.el.append(this.graph, this.text);
    root.appendChild(this.el);
    this.ctx = this.graph.getContext('2d') as CanvasRenderingContext2D;
  }

  setLines(lines: string[]): void {
    this.lines = lines;
  }

  frame(dtSec: number, renderer: THREE.WebGLRenderer): void {
    const ms = dtSec * 1000;
    this.times.push(ms);
    if (this.times.length > 180) this.times.shift();
    this.acc += dtSec;
    this.frames++;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frameMs = (this.acc * 1000) / this.frames;
      this.acc = 0;
      this.frames = 0;
      const info = renderer.info.render;
      this.text.textContent = [
        `${this.fps.toFixed(0)} fps  ${this.frameMs.toFixed(1)} ms`,
        `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k`,
        ...this.lines,
      ].join('\n');
    }
    const c = this.ctx;
    const w = this.graph.width;
    const h = this.graph.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    const y60 = h - (16.7 / 50) * h;
    c.beginPath();
    c.moveTo(0, y60);
    c.lineTo(w, y60);
    c.stroke();
    c.strokeStyle = '#ffd9a0';
    c.beginPath();
    this.times.forEach((t, i) => {
      const x = (i / 180) * w;
      const y = h - Math.min(1, t / 50) * h;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
  }
}
