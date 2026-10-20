import type { World } from '../sim/world/world';
import { NO_WATER } from '../sim/world/terrain';
import { Noise2D } from '../sim/world/noise';
import type { PoiDef } from '../sim/world/mapTypes';
import { icons } from './icons';
import { placeMapLabels, type MapLabel } from './mapLabels';
import { trailPoint } from '../sim/world/crawlTrail';
import { gateColours } from '../data/palette';

const SIZE = 1400;
const MARGIN = 70;
/** Closest zoom (the whole map is 1). */
const MAX_ZOOM = 4;
/** A sheet smaller than this (CSS px, a phone) opens zoomed in on the car. */
const SMALL_SHEET = 600;
const PHONE_ZOOM = 2.5;

const hints = {
  keyboard: 'Scroll to zoom · drag to move · M or Esc to close',
  gamepad: 'B or View to close',
  touch: 'Pinch to zoom · drag to move · tap outside to close',
};

/**
 * Fold-out paper map (SPEC §9) drawn on a canvas from the real heightfield: shaded
 * relief, contour lines, creek, forest, tracks and a hand-drawn border. Discovered
 * POIs and campsites get icons and names; undiscovered ones aren't shown.
 */
export class PaperMap {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private readonly noise: Noise2D;
  private readonly iconImages = new Map<string, HTMLImageElement>();
  isOpen = false;
  onClose: (() => void) | null = null;
  private readonly view: HTMLElement;
  private readonly hint: HTMLElement;
  /** Zoom (1 = the whole map) and the canvas's offset in the view (CSS px). */
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  /** Pointers down on the map, for dragging and pinching. */
  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor(
    root: HTMLElement,
    private readonly world: World,
  ) {
    this.noise = new Noise2D(world.map.seed + 9);
    this.el = document.createElement('div');
    this.el.className = 'paper-map hidden';
    this.el.innerHTML = `<div class="paper-map-sheet"><div class="paper-map-view"><canvas width="${SIZE}" height="${SIZE}"></canvas></div><div class="paper-map-hint"></div></div>`;
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.view = this.el.querySelector('.paper-map-view') as HTMLElement;
    this.hint = this.el.querySelector('.paper-map-hint') as HTMLElement;
    this.view.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.view.getBoundingClientRect();
        this.zoomAt(this.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
    this.view.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.view.setPointerCapture?.(e.pointerId);
    });
    this.view.addEventListener('pointermove', (e) => this.onPointerMove(e));
    const up = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    this.view.addEventListener('pointerup', up);
    this.view.addEventListener('pointercancel', up);
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.onClose?.();
    });
    for (const k of ['campsite', 'viewpoint', 'landmark', 'feature'] as const) {
      const img = new Image();
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(icons[k].replace(/currentColor/g, '#3B2A1E').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
      this.iconImages.set(k, img);
    }
  }

  /** World (x, z) to map pixels. */
  private toMap(x: number, z: number): [number, number] {
    const half = this.world.map.wallHalfExtent + 20;
    const s = (SIZE - 2 * MARGIN) / (2 * half);
    return [MARGIN + (x + half) * s, MARGIN + (z + half) * s];
  }

  private building: Promise<void> | null = null;

  /**
   * Draw the static map once, a slice at a time so the game keeps running smoothly.
   * Call early to warm it up; open() waits for it if needed.
   */
  prepare(): Promise<void> {
    if (this.base) return Promise.resolve();
    this.building ??= (async () => {
      const c = document.createElement('canvas');
      c.width = SIZE;
      c.height = SIZE;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));
      const relief = this.reliefRows();
      for (let r = relief.next(); !r.done; r = relief.next()) await yieldFrame();
      g.imageSmoothingEnabled = true;
      g.drawImage(this.reliefCanvas as HTMLCanvasElement, 0, 0, SIZE, SIZE);
      await yieldFrame();
      this.drawForest(g);
      await yieldFrame();
      const contours = this.drawContours(g);
      for (let r = contours.next(); !r.done; r = contours.next()) await yieldFrame();
      this.drawWater(g);
      await yieldFrame();
      this.drawTracks(g);
      this.drawFrame(g);
      this.base = c;
    })();
    return this.building;
  }

  private reliefCanvas: HTMLCanvasElement | null = null;

  /** Shaded relief at half resolution, straight from the height grid, in row slices. */
  private *reliefRows(): Generator<void, void, void> {
    const t = this.world.terrain;
    const R = SIZE / 2;
    const m = MARGIN / 2;
    const c = document.createElement('canvas');
    c.width = R;
    c.height = R;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(R, R);
    const d = img.data;
    const half = this.world.map.wallHalfExtent + 20;
    const s = (2 * half) / (R - 2 * m);
    const H = t.heights;
    const res = t.res;
    const hAt = (x: number, z: number) => {
      const ix = Math.min(res - 1, Math.max(0, Math.round(x + t.half)));
      const iz = Math.min(res - 1, Math.max(0, Math.round(z + t.half)));
      return H[iz * res + ix];
    };
    const lx = -0.55;
    const ly = 0.65;
    const lz = -0.52;
    for (let py = 0; py < R; py++) {
      if (py % 60 === 0) yield;
      for (let px = 0; px < R; px++) {
        const x = (px - m) * s - half;
        const z = (py - m) * s - half;
        const o = (py * R + px) * 4;
        // Paper with a little fibre.
        const fibre = this.noise.noise(px * 0.16, py * 0.16) * 6;
        let r = 243 + fibre;
        let gg = 235 + fibre;
        let b = 218 + fibre;
        if (px >= m && py >= m && px < R - m && py < R - m) {
          const h = hAt(x, z);
          const hx = hAt(x + 2, z) - hAt(x - 2, z);
          const hz = hAt(x, z + 2) - hAt(x, z - 2);
          const nx = -hx;
          const ny = 4;
          const nz = -hz;
          const nl = Math.hypot(nx, ny, nz);
          const shade = (nx * lx + ny * ly + nz * lz) / nl;
          // Gentle colour by height: khaki valley, pale high plain, grey-green mountains.
          const hn = Math.min(1, Math.max(0, (h - 15) / 110));
          r = r * (0.93 + 0.07 * hn) - 6 * (1 - hn);
          gg = gg * (0.95 + 0.05 * hn);
          b = b * (0.88 + 0.1 * hn);
          const k = 0.8 + 0.28 * shade;
          r *= k;
          gg *= k;
          b *= k;
          if (
            Math.abs(x) > this.world.map.wallHalfExtent - 8 ||
            Math.abs(z) > this.world.map.wallHalfExtent - 8
          ) {
            r *= 0.92;
            gg *= 0.92;
            b *= 0.9;
          }
        }
        d[o] = r;
        d[o + 1] = gg;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.reliefCanvas = c;
  }

  private drawForest(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(94, 110, 82, 0.28)';
    for (const tr of this.world.scatter.trees) {
      if (!tr.solid) continue;
      const [x, y] = this.toMap(tr.x, tr.z);
      g.beginPath();
      g.arc(x, y, tr.species === 'snowgum' ? 1.6 : 2.1, 0, Math.PI * 2);
      g.fill();
    }
  }

  private *drawContours(g: CanvasRenderingContext2D): Generator<void, void, void> {
    const t = this.world.terrain;
    const half = this.world.map.wallHalfExtent + 20;
    const step = 4;
    const n = Math.floor((2 * half) / step);
    const H = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) H[j * (n + 1) + i] = t.heightAt(-half + i * step, -half + j * step);
    const interval = 10;
    g.lineCap = 'round';
    for (let level = Math.ceil(10 / interval) * interval; level < 320; level += interval) {
      if (level % 40 === 0) yield;
      const major = level % 50 === 0;
      g.strokeStyle = major ? 'rgba(142, 75, 43, 0.55)' : 'rgba(142, 75, 43, 0.28)';
      g.lineWidth = major ? 1.6 : 0.9;
      g.beginPath();
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const a = H[j * (n + 1) + i];
          const b = H[j * (n + 1) + i + 1];
          const c = H[(j + 1) * (n + 1) + i + 1];
          const d = H[(j + 1) * (n + 1) + i];
          let code = 0;
          if (a > level) code |= 1;
          if (b > level) code |= 2;
          if (c > level) code |= 4;
          if (d > level) code |= 8;
          if (code === 0 || code === 15) continue;
          const x0 = -half + i * step;
          const z0 = -half + j * step;
          const lerp = (h1: number, h2: number) => (level - h1) / (h2 - h1);
          const top: [number, number] = [x0 + lerp(a, b) * step, z0];
          const right: [number, number] = [x0 + step, z0 + lerp(b, c) * step];
          const bottom: [number, number] = [x0 + lerp(d, c) * step, z0 + step];
          const left: [number, number] = [x0, z0 + lerp(a, d) * step];
          const segs: Array<[[number, number], [number, number]]> = [];
          switch (code) {
            case 1:
            case 14:
              segs.push([left, top]);
              break;
            case 2:
            case 13:
              segs.push([top, right]);
              break;
            case 3:
            case 12:
              segs.push([left, right]);
              break;
            case 4:
            case 11:
              segs.push([right, bottom]);
              break;
            case 5:
              segs.push([left, top], [right, bottom]);
              break;
            case 6:
            case 9:
              segs.push([top, bottom]);
              break;
            case 7:
            case 8:
              segs.push([left, bottom]);
              break;
            case 10:
              segs.push([left, bottom], [top, right]);
              break;
          }
          for (const [p, q] of segs) {
            const [ax, ay] = this.toMap(p[0], p[1]);
            const [bx, by] = this.toMap(q[0], q[1]);
            g.moveTo(ax, ay);
            g.lineTo(bx, by);
          }
        }
      g.stroke();
    }
  }

  private drawWater(g: CanvasRenderingContext2D): void {
    const t = this.world.terrain;
    const half = this.world.map.wallHalfExtent + 20;
    g.fillStyle = 'rgba(94, 142, 152, 0.85)';
    const s = (SIZE - 2 * MARGIN) / (2 * half);
    for (let iz = 0; iz < t.res; iz += 2)
      for (let ix = 0; ix < t.res; ix += 2) {
        if (t.water[iz * t.res + ix] <= NO_WATER) continue;
        const x = ix - t.half;
        const z = iz - t.half;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        const [px, py] = this.toMap(x, z);
        g.fillRect(px - s, py - s, s * 2 + 0.5, s * 2 + 0.5);
      }
    // Ink outline along the creek.
    const cr = this.world.features.creek.poly;
    g.strokeStyle = 'rgba(59, 90, 100, 0.7)';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let k = 0; k < cr.count; k += 2) {
      const [x, y] = this.toMap(cr.xs[k], cr.zs[k]);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  private drawTracks(g: CanvasRenderingContext2D): void {
    for (const t of this.world.features.tracks) {
      const faint = !!t.def.faint;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const path = () => {
        g.beginPath();
        for (let k = 0; k < t.poly.count; k += 3) {
          const wob = this.noise.noise(k * 0.05, t.def.id.length) * 0.8;
          const [x, y] = this.toMap(t.poly.xs[k], t.poly.zs[k]);
          if (k === 0) g.moveTo(x + wob, y - wob);
          else g.lineTo(x + wob, y - wob);
        }
        const [ex, ey] = this.toMap(t.poly.xs[t.poly.count - 1], t.poly.zs[t.poly.count - 1]);
        g.lineTo(ex, ey);
      };
      if (faint) {
        g.setLineDash([4, 5]);
        g.strokeStyle = 'rgba(142, 75, 43, 0.85)';
        g.lineWidth = 1.6;
        path();
        g.stroke();
        g.setLineDash([]);
      } else {
        g.strokeStyle = '#6B3A22';
        g.lineWidth = 4.6;
        path();
        g.stroke();
        g.strokeStyle =
          t.def.surface === 'rock' ? '#B9B2A6' : t.def.surface === 'gravel' ? '#C9A27E' : '#D98A5C';
        g.lineWidth = 2.4;
        path();
        g.stroke();
      }
      // A bridge is the usual map sign: a short dark line either side of the track.
      for (const b of t.def.bridges ?? []) {
        const reach = (b.kind === 'deck' ? b.width / 2 : (b.gauge ?? 1.48) / 2 + b.width / 2) + 1.6;
        g.strokeStyle = '#3B2A1E';
        g.lineWidth = 1.3;
        for (const side of [-1, 1]) {
          g.beginPath();
          for (let s = b.from - 1; s <= b.to + 1; s += 1) {
            const p = trailPoint(t, s, side * reach);
            const [x, y] = this.toMap(p.x, p.z);
            if (s === b.from - 1) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
      }
    }
    // Gate flags as red and blue dots either side of the trail.
    for (const gate of this.world.features.gates)
      for (const [flag, colour] of [
        [gate.left, gateColours.left],
        [gate.right, gateColours.right],
      ] as const) {
        const [x, y] = this.toMap(flag.x, flag.z);
        g.fillStyle = colour;
        g.beginPath();
        g.arc(x, y, 1.7, 0, Math.PI * 2);
        g.fill();
      }
  }

  private drawFrame(g: CanvasRenderingContext2D): void {
    const wobblyRect = (inset: number, width: number) => {
      g.strokeStyle = '#3B2A1E';
      g.lineWidth = width;
      g.beginPath();
      const steps = 120;
      const pts: [number, number][] = [];
      const a = inset;
      const b = SIZE - inset;
      for (let i = 0; i <= steps; i++) pts.push([a + ((b - a) * i) / steps, a]);
      for (let i = 0; i <= steps; i++) pts.push([b, a + ((b - a) * i) / steps]);
      for (let i = 0; i <= steps; i++) pts.push([b - ((b - a) * i) / steps, b]);
      for (let i = 0; i <= steps; i++) pts.push([a, b - ((b - a) * i) / steps]);
      pts.forEach(([x, y], i) => {
        const w = this.noise.noise(i * 0.09, inset) * 1.6;
        if (i === 0) g.moveTo(x + w, y + w);
        else g.lineTo(x + w, y - w);
      });
      g.closePath();
      g.stroke();
    };
    wobblyRect(MARGIN - 4, 3);
    wobblyRect(MARGIN - 14, 1.2);
    g.fillStyle = '#3B2A1E';
    g.font = '44px "Patrick Hand", "Nunito", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.world.map.name, SIZE / 2, MARGIN / 2 - 2);
    // North arrow.
    const nx = SIZE - MARGIN - 50;
    const ny = MARGIN + 70;
    g.beginPath();
    g.moveTo(nx, ny - 40);
    g.lineTo(nx + 14, ny + 10);
    g.lineTo(nx, ny);
    g.lineTo(nx - 14, ny + 10);
    g.closePath();
    g.fill();
    g.font = '30px "Patrick Hand", "Nunito", sans-serif';
    g.fillText('N', nx, ny - 58);
    // Scale bar: 200 m.
    const [x0] = this.toMap(0, 0);
    const [x1] = this.toMap(200, 0);
    const len = x1 - x0;
    const sx = MARGIN + 30;
    const sy = SIZE - MARGIN - 34;
    g.lineWidth = 3;
    g.strokeStyle = '#3B2A1E';
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + len, sy);
    g.moveTo(sx, sy - 7);
    g.lineTo(sx, sy + 7);
    g.moveTo(sx + len, sy - 7);
    g.lineTo(sx + len, sy + 7);
    g.stroke();
    g.font = '24px "Patrick Hand", "Nunito", sans-serif';
    g.fillText('200 m', sx + len / 2, sy - 18);
  }

  /**
   * Draw the base map plus discovered POIs and the player arrow, then show it: the
   * whole map on a big screen, zoomed in on the car on a phone.
   */
  open(
    discovered: ReadonlySet<string>,
    player: { x: number; z: number; heading: number },
    device: keyof typeof hints = 'keyboard',
  ): void {
    const opening = !this.isOpen;
    this.el.classList.remove('hidden');
    this.isOpen = true;
    this.hint.textContent = hints[device];
    if (opening) {
      this.pointers.clear();
      const side = this.view.clientWidth;
      const [mx, my] = this.toMap(player.x, player.z);
      this.zoom = 1;
      this.panX = this.panY = 0;
      if (side > 0 && side < SMALL_SHEET)
        this.zoomAt(PHONE_ZOOM, side / 2, side / 2, (mx / SIZE) * side, (my / SIZE) * side);
      else this.applyView();
    }
    if (!this.base) {
      // Still drawing: show the paper and fill it in when ready.
      this.ctx.fillStyle = '#F3EBDA';
      this.ctx.fillRect(0, 0, SIZE, SIZE);
      void this.prepare().then(() => {
        if (this.isOpen) this.open(discovered, player, device);
      });
      return;
    }
    const g = this.ctx;
    g.drawImage(this.base, 0, 0);
    const pois = this.world.pois.filter((p) => discovered.has(p.id));
    const labels = placeMapLabels(
      pois.map((p) => {
        const [x, y] = this.toMap(p.x, p.z);
        g.font = `${p.kind === 'campsite' ? 'bold ' : ''}26px "Patrick Hand", "Nunito", sans-serif`;
        return { id: p.id, x, y, width: g.measureText(p.name).width };
      }),
      SIZE,
      MARGIN,
    );
    g.strokeStyle = 'rgba(59, 42, 30, 0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const label of labels) {
      if (label.labelX === label.x + 22 && label.labelY === label.y) continue;
      const right = label.labelX > label.x;
      g.moveTo(label.x + (right ? 18 : -18), label.y);
      g.lineTo(label.labelX + (right ? 0 : label.width), label.labelY);
    }
    g.stroke();
    pois.forEach((p, i) => this.drawPoi(g, p, labels[i]));
    this.drawPlayer(g, player);
  }

  close(): void {
    this.el.classList.add('hidden');
    this.isOpen = false;
  }

  /** Current zoom and offset (tests). */
  get viewState(): { zoom: number; panX: number; panY: number } {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  /**
   * Zoom to `zoom`, keeping the point of the map under (vx, vy) in the view there — or,
   * given (ux, uy) in unzoomed view px, putting that point of the map at (vx, vy).
   */
  zoomAt(zoom: number, vx: number, vy: number, ux?: number, uy?: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const px = ux ?? (vx - this.panX) / this.zoom;
    const py = uy ?? (vy - this.panY) / this.zoom;
    this.zoom = z;
    this.panX = vx - px * z;
    this.panY = vy - py * z;
    this.applyView();
  }

  private onPointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const others = [...this.pointers].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    if (others.length === 0) {
      this.panX += e.clientX - prev.x;
      this.panY += e.clientY - prev.y;
      this.applyView();
    } else {
      // Pinch: scale by the change in finger spread, about the point between them.
      const o = others[0];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      const r = this.view.getBoundingClientRect();
      if (before > 10)
        this.zoomAt(
          this.zoom * (after / before),
          (e.clientX + o.x) / 2 - r.left,
          (e.clientY + o.y) / 2 - r.top,
        );
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  /** Keep the map covering the view, then move the canvas. */
  private applyView(): void {
    const side = this.view.clientWidth;
    const min = side - side * this.zoom;
    this.panX = Math.min(0, Math.max(min, this.panX));
    this.panY = Math.min(0, Math.max(min, this.panY));
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.view.classList.toggle('zoomed', this.zoom > 1);
  }

  private drawPoi(g: CanvasRenderingContext2D, p: PoiDef, label: MapLabel): void {
    const [x, y] = this.toMap(p.x, p.z);
    const img = this.iconImages.get(p.kind);
    g.fillStyle = 'rgba(243, 235, 218, 0.85)';
    g.beginPath();
    g.arc(x, y, 17, 0, Math.PI * 2);
    g.fill();
    if (img?.complete) g.drawImage(img, x - 14, y - 14, 28, 28);
    g.font = `${p.kind === 'campsite' ? 'bold ' : ''}26px "Patrick Hand", "Nunito", sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(243, 235, 218, 0.9)';
    g.strokeText(p.name, label.labelX, label.labelY);
    g.fillStyle = '#3B2A1E';
    g.fillText(p.name, label.labelX, label.labelY);
  }

  private drawPlayer(g: CanvasRenderingContext2D, p: { x: number; z: number; heading: number }): void {
    const [x, y] = this.toMap(p.x, p.z);
    g.save();
    g.translate(x, y);
    g.rotate((p.heading * Math.PI) / 180);
    g.fillStyle = '#B5653A';
    g.strokeStyle = '#3B2A1E';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(15, 16);
    g.lineTo(0, 8);
    g.lineTo(-15, 16);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
