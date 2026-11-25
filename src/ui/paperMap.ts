import { controllers, defaultController, type ControllerType } from '../data/controllers';
import type { World } from '../sim/world/world';
import { NO_WATER } from '../sim/world/terrain';
import { Noise2D } from '../sim/world/noise';
import type { PoiDef } from '../sim/world/mapTypes';
import { icons } from './icons';
import { mergeHints, placeMapLabels, type MapBox, type MapLabel } from './mapLabels';
import { isTouchDevice } from './touchControls';
import { uiScale } from './uiScale';
import { trailPoint } from '../sim/world/crawlTrail';
import { gateColours } from '../data/palette';
import { seenTuning, type SeenGround } from '../sim/seenGround';

/** An unfound place within this of ground you've seen shows as a question mark (m). */
const HINT_RANGE = 250;
const PAPER = '#F3EBDA';

/** The sheet's longer side (canvas px). */
const SIZE = 1400;
const MARGIN = 70;
/**
 * A long, narrow map's sheet is at least this share of SIZE across, leaving paper beside it
 * for names: wider on a big screen, where the names are drawn larger (see `marks`).
 */
const MIN_SHEET = { touch: 0.45, screen: 0.6 };
/** Place names on the open map are at least this many CSS px at interface scale 1 (src/ui/uiScale.ts). */
const MIN_NAME_PX = 13;
/** Closest zoom (the whole map is 1). */
const MAX_ZOOM = 4;
/**
 * A view this much wider than the map (a phone held sideways) shows a window on the
 * map instead of shrinking the whole sheet to a thin column.
 */
const WINDOW_ASPECT = 1.25;
/** A sheet smaller than this (CSS px, a phone) opens zoomed in on the car. */
const SMALL_SHEET = 600;
const PHONE_ZOOM = 2.5;

const hints = {
  keyboard: 'Scroll to zoom · drag to move · M or Esc to close',
  touch: 'Pinch to zoom · drag to move · Close, or tap outside',
};

/**
 * Canvas size at zoom 1. A square view shows the whole sheet. A short, wide view of a
 * tall map fills the width and scrolls along the length, so the sheet can use the screen
 * without stretching the map.
 */
export function mapCanvasBase(
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
): { baseW: number; baseH: number; windowed: boolean } {
  if (viewW <= 0 || viewH <= 0 || mapW <= 0 || mapH <= 0)
    return { baseW: Math.max(0, viewW), baseH: Math.max(0, viewH), windowed: false };
  const mapAspect = mapW / mapH;
  if (viewW / viewH > mapAspect * WINDOW_ASPECT)
    return { baseW: viewW, baseH: viewW / mapAspect, windowed: true };
  return { baseW: viewW, baseH: viewH, windowed: false };
}

/** Keep a zoomed map covering the view. Pan is in CSS pixels, origin top-left. */
export function clampMapPan(
  panX: number,
  panY: number,
  viewW: number,
  viewH: number,
  baseW: number,
  baseH: number,
  zoom: number,
): { panX: number; panY: number } {
  return {
    panX: Math.min(0, Math.max(viewW - baseW * zoom, panX)),
    panY: Math.min(0, Math.max(viewH - baseH * zoom, panY)),
  };
}

/**
 * Fold-out paper map (SPEC §9) drawn on a canvas from the real heightfield: shaded
 * relief, contour lines, creek, forest, tracks and a hand-drawn border. Only ground the
 * car has been near is drawn; the rest is blank paper. Discovered POIs and campsites get
 * icons and names; an undiscovered one near the ground you've seen is a question mark.
 */
export class PaperMap {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  /** The border, title, north arrow and scale, drawn over the blank paper. */
  private frame: HTMLCanvasElement | null = null;
  /** Blank paper over the ground not yet seen (redrawn on each open). */
  private fog: HTMLCanvasElement | null = null;
  private readonly noise: Noise2D;
  private readonly iconImages = new Map<string, HTMLImageElement>();
  isOpen = false;
  onClose: (() => void) | null = null;
  private readonly view: HTMLElement;
  private readonly hint: HTMLElement;
  private hintTimer = 0;
  /** Zoom (1 = the whole map) and the canvas's offset in the view (CSS px). */
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  /** Pointers down on the map, for dragging and pinching. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  /** The sheet's size (canvas px): square for a square map, upright for a long one. */
  private readonly width: number;
  private readonly height: number;
  /** Half the area drawn, east–west and north–south (m), and canvas px per metre. */
  private readonly halfX: number;
  private readonly halfZ: number;
  private readonly scale: number;
  /**
   * How large the names, icons, question marks and the car's arrow are drawn (1 = as on a
   * phone): set on opening so a name is at least MIN_NAME_PX × the interface scale on screen.
   */
  private marks = 1;
  /** The `marks` the frame's lettering was drawn at. */
  private frameMarks = 0;

  constructor(
    root: HTMLElement,
    private readonly world: World,
  ) {
    this.noise = new Noise2D(world.map.seed + 9);
    this.halfX = world.map.wall[0] + 20;
    this.halfZ = world.map.wall[1] + 20;
    this.scale = (SIZE - 2 * MARGIN) / (2 * Math.max(this.halfX, this.halfZ));
    const minSheet = isTouchDevice() ? MIN_SHEET.touch : MIN_SHEET.screen;
    this.width = Math.round(Math.max(2 * this.halfX * this.scale + 2 * MARGIN, minSheet * SIZE));
    this.height = Math.round(Math.max(2 * this.halfZ * this.scale + 2 * MARGIN, minSheet * SIZE));
    this.el = document.createElement('div');
    this.el.className = 'paper-map hidden';
    this.el.innerHTML = `<div class="paper-map-sheet"><button type="button" class="paper-map-close" aria-label="Close map">Close</button><div class="paper-map-view"><canvas width="${this.width}" height="${this.height}"></canvas></div><div class="paper-map-hint"></div></div>`;
    root.appendChild(this.el);
    // The sheet takes the map's shape, as big as fits the screen. A short landscape
    // phone overrides this in CSS and shows a window onto the map instead.
    const sheet = this.el.querySelector('.paper-map-sheet') as HTMLElement;
    sheet.style.setProperty('--map-aspect', (this.width / this.height).toFixed(4));
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
    this.el.querySelector('.paper-map-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClose?.();
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        if (this.isOpen) this.applyView();
      }).observe(this.view);
    }
    for (const k of ['campsite', 'viewpoint', 'landmark', 'feature'] as const) {
      const img = new Image();
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(icons[k].replace(/currentColor/g, '#3B2A1E').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
      this.iconImages.set(k, img);
    }
  }

  /** World (x, z) to map pixels. */
  private toMap(x: number, z: number): [number, number] {
    return [this.width / 2 + x * this.scale, this.height / 2 + z * this.scale];
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
      c.width = this.width;
      c.height = this.height;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));
      const relief = this.reliefRows();
      for (let r = relief.next(); !r.done; r = relief.next()) await yieldFrame();
      g.imageSmoothingEnabled = true;
      g.drawImage(this.reliefCanvas as HTMLCanvasElement, 0, 0, this.width, this.height);
      await yieldFrame();
      this.drawForest(g);
      await yieldFrame();
      const contours = this.drawContours(g);
      for (let r = contours.next(); !r.done; r = contours.next()) await yieldFrame();
      this.drawWater(g);
      await yieldFrame();
      this.drawTracks(g);
      this.base = c;
    })();
    return this.building;
  }

  private reliefCanvas: HTMLCanvasElement | null = null;

  /** Shaded relief at half resolution, straight from the height grid, in row slices. */
  private *reliefRows(): Generator<void, void, void> {
    const t = this.world.terrain;
    const RW = Math.round(this.width / 2);
    const RH = Math.round(this.height / 2);
    const c = document.createElement('canvas');
    c.width = RW;
    c.height = RH;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(RW, RH);
    const d = img.data;
    const { halfX, halfZ } = this;
    const s = 2 / this.scale;
    const H = t.heights;
    const hAt = (x: number, z: number) => H[t.index(x, z)];
    const [wallX, wallZ] = this.world.map.wall;
    const lx = -0.55;
    const ly = 0.65;
    const lz = -0.52;
    for (let py = 0; py < RH; py++) {
      if (py % 60 === 0) yield;
      for (let px = 0; px < RW; px++) {
        const x = (px - RW / 2) * s;
        const z = (py - RH / 2) * s;
        const o = (py * RW + px) * 4;
        // Paper with a little fibre.
        const fibre = this.noise.noise(px * 0.16, py * 0.16) * 6;
        let r = 243 + fibre;
        let gg = 235 + fibre;
        let b = 218 + fibre;
        if (Math.abs(x) <= halfX && Math.abs(z) <= halfZ) {
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
          if (Math.abs(x) > wallX - 8 || Math.abs(z) > wallZ - 8) {
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
    const { halfX, halfZ } = this;
    const step = 4;
    const nx = Math.floor((2 * halfX) / step);
    const nz = Math.floor((2 * halfZ) / step);
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = t.heightAt(-halfX + i * step, -halfZ + j * step);
    const interval = 10;
    g.lineCap = 'round';
    for (let level = Math.ceil(10 / interval) * interval; level < 320; level += interval) {
      if (level % 40 === 0) yield;
      const major = level % 50 === 0;
      g.strokeStyle = major ? 'rgba(142, 75, 43, 0.55)' : 'rgba(142, 75, 43, 0.28)';
      g.lineWidth = major ? 1.6 : 0.9;
      g.beginPath();
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const a = H[j * (nx + 1) + i];
          const b = H[j * (nx + 1) + i + 1];
          const c = H[(j + 1) * (nx + 1) + i + 1];
          const d = H[(j + 1) * (nx + 1) + i];
          let code = 0;
          if (a > level) code |= 1;
          if (b > level) code |= 2;
          if (c > level) code |= 4;
          if (d > level) code |= 8;
          if (code === 0 || code === 15) continue;
          const x0 = -halfX + i * step;
          const z0 = -halfZ + j * step;
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
    g.fillStyle = 'rgba(94, 142, 152, 0.85)';
    const s = this.scale;
    for (let iz = 0; iz < t.resZ; iz += 2)
      for (let ix = 0; ix < t.resX; ix += 2) {
        if (t.water[iz * t.resX + ix] <= NO_WATER) continue;
        const x = ix - t.halfX;
        const z = iz - t.halfZ;
        if (Math.abs(x) > this.halfX || Math.abs(z) > this.halfZ) continue;
        const [px, py] = this.toMap(x, z);
        g.fillRect(px - s, py - s, s * 2 + 0.5, s * 2 + 0.5);
      }
    // Ink outline along each creek.
    g.strokeStyle = 'rgba(59, 90, 100, 0.7)';
    g.lineWidth = 1.4;
    for (const { poly: cr } of this.world.features.creeks) {
      g.beginPath();
      for (let k = 0; k < cr.count; k += 2) {
        const [x, y] = this.toMap(cr.xs[k], cr.zs[k]);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
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
          t.def.surface === 'rock' || t.def.surface === 'concrete'
            ? '#B9B2A6'
            : t.def.surface === 'gravel'
              ? '#C9A27E'
              : '#D98A5C';
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
    // The frame runs round the map drawn, MARGIN in from a square sheet's edges.
    const [left, top] = this.toMap(-this.halfX, -this.halfZ);
    const [right, bottom] = this.toMap(this.halfX, this.halfZ);
    const wobblyRect = (inset: number, width: number) => {
      g.strokeStyle = '#3B2A1E';
      g.lineWidth = width;
      g.beginPath();
      const steps = 120;
      const pts: [number, number][] = [];
      const [a, b] = [left - MARGIN + inset, right + MARGIN - inset];
      const [c, d] = [top - MARGIN + inset, bottom + MARGIN - inset];
      for (let i = 0; i <= steps; i++) pts.push([a + ((b - a) * i) / steps, c]);
      for (let i = 0; i <= steps; i++) pts.push([b, c + ((d - c) * i) / steps]);
      for (let i = 0; i <= steps; i++) pts.push([b - ((b - a) * i) / steps, d]);
      for (let i = 0; i <= steps; i++) pts.push([a, d - ((d - c) * i) / steps]);
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
    // The title fits the margin above the frame, so it grows less than the other lettering.
    const k = this.marks;
    g.font = `${44 * Math.min(k, 1.35)}px "Patrick Hand", "Nunito", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.world.map.name, this.width / 2, top - MARGIN / 2 - 2);
    // North arrow.
    const nx = right - 50;
    const ny = top + 70;
    g.beginPath();
    g.moveTo(nx, ny - 40);
    g.lineTo(nx + 14, ny + 10);
    g.lineTo(nx, ny);
    g.lineTo(nx - 14, ny + 10);
    g.closePath();
    g.fill();
    g.font = `${30 * k}px "Patrick Hand", "Nunito", sans-serif`;
    g.fillText('N', nx, ny - 40 - 18 * k);
    // Scale bar: 200 m, or 500 m on a map drawn small.
    const metres = 200 * this.scale < 60 ? 500 : 200;
    const len = metres * this.scale;
    const sx = left + 30;
    // Outside the frame, in the sheet's margin, so it can't sit under a place near the edge.
    const sy = bottom + 20;
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
    g.font = `${24 * k}px "Patrick Hand", "Nunito", sans-serif`;
    g.fillText(`${metres} m`, sx + len / 2, sy + 6 + 12 * k);
  }

  /**
   * Draw the base map plus discovered POIs and the player arrow, then show it: the
   * whole map on a big screen, zoomed in on the car on a phone.
   */
  open(
    discovered: ReadonlySet<string>,
    player: { x: number; z: number; heading: number },
    device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard',
    controller: ControllerType = defaultController,
    seen: SeenGround | null = null,
    /** Things still to be loaded: a question mark too, near seen ground. */
    unfound: readonly { x: number; z: number }[] = [],
  ): void {
    const opening = !this.isOpen;
    this.el.classList.remove('hidden');
    this.isOpen = true;
    document.body.classList.toggle('map-open', true);
    this.updateInput(device, controller);
    if (opening) {
      this.pointers.clear();
      this.armHint();
      const [w, h] = [this.view.clientWidth, this.view.clientHeight];
      const base = mapCanvasBase(w, h, this.width, this.height);
      const [mx, my] = this.toMap(player.x, player.z);
      this.zoom = 1;
      this.panX = this.panY = 0;
      const ux = (mx / this.width) * base.baseW;
      const uy = (my / this.height) * base.baseH;
      // A wide short sheet shows the map full width, scrolled to the car. A small
      // fitted sheet (a phone held upright) opens zoomed in on the car.
      if (w > 0 && base.windowed) this.zoomAt(1, w / 2, h / 2, ux, uy);
      else if (w > 0 && Math.max(w, h) < SMALL_SHEET) this.zoomAt(PHONE_ZOOM, w / 2, h / 2, ux, uy);
      else this.applyView();
    }
    // Names at least MIN_NAME_PX × the interface scale on screen at the opening zoom.
    const [vw, vh] = [this.view.clientWidth, this.view.clientHeight];
    if (vw > 0) {
      const shown = (mapCanvasBase(vw, vh, this.width, this.height).baseH * this.zoom) / this.height;
      this.marks = Math.min(2.5, Math.max(1, (MIN_NAME_PX * uiScale()) / (26 * shown)));
    }
    if (!this.base) {
      // Still drawing: show the paper and fill it in when ready.
      this.ctx.fillStyle = '#F3EBDA';
      this.ctx.fillRect(0, 0, this.width, this.height);
      void this.prepare().then(() => {
        if (this.isOpen) this.open(discovered, player, device, controller, seen, unfound);
      });
      return;
    }
    const k = this.marks;
    if (!this.frame || this.frameMarks !== k) {
      this.frame ??= document.createElement('canvas');
      this.frame.width = this.width;
      this.frame.height = this.height;
      this.drawFrame(this.frame.getContext('2d') as CanvasRenderingContext2D);
      this.frameMarks = k;
    }
    const g = this.ctx;
    g.drawImage(this.base, 0, 0);
    if (seen) this.drawFog(g, seen);
    g.drawImage(this.frame, 0, 0);
    // Question marks: one for a cluster, so they can't pile on top of each other.
    const hintSpots: { x: number; z: number }[] = [];
    if (seen) {
      for (const p of this.world.pois)
        if (!discovered.has(p.id) && seen.near(p.x, p.z, HINT_RANGE)) hintSpots.push(p);
      for (const f of unfound) if (seen.near(f.x, f.z, HINT_RANGE)) hintSpots.push(f);
    }
    const hints = mergeHints(
      hintSpots.map((p) => {
        const [x, y] = this.toMap(p.x, p.z);
        return { x, y };
      }),
      32 * k,
    );
    for (const h of hints) this.drawHint(g, h.x, h.y);
    const pois = this.world.pois.filter((p) => discovered.has(p.id));
    // Names keep clear of the question marks and of the car's arrow as well as each other.
    const [carX, carY] = this.toMap(player.x, player.z);
    const obstacles: MapBox[] = [
      ...hints.map((h) => ({
        left: h.x - 15 * k,
        right: h.x + 15 * k,
        top: h.y - 15 * k,
        bottom: h.y + 15 * k,
      })),
      { left: carX - 26 * k, right: carX + 26 * k, top: carY - 26 * k, bottom: carY + 26 * k },
    ];
    const labels = placeMapLabels(
      pois.map((p) => {
        const [x, y] = this.toMap(p.x, p.z);
        g.font = this.nameFont(p);
        return { id: p.id, x, y, width: g.measureText(p.name).width };
      }),
      this.width,
      MARGIN,
      this.height,
      k,
      obstacles,
    );
    g.strokeStyle = 'rgba(59, 42, 30, 0.5)';
    g.lineWidth = 1.5 * k;
    g.beginPath();
    for (const label of labels) {
      if (label.labelX === label.x + 22 * k && label.labelY === label.y) continue;
      const right = label.labelX > label.x;
      g.moveTo(label.x + (right ? 18 : -18) * k, label.y);
      g.lineTo(label.labelX + (right ? 0 : label.width), label.labelY);
    }
    g.stroke();
    pois.forEach((p, i) => this.drawPoi(g, p, labels[i]));
    this.drawPlayer(g, player);
  }

  updateInput(device: 'keyboard' | 'gamepad' | 'touch', controller: ControllerType): void {
    if (!this.isOpen) return;
    const text =
      device === 'gamepad'
        ? `${controllers[controller].back} or ${controllers[controller].map} to close`
        : hints[device];
    if (this.hint.textContent === text) return;
    this.hint.textContent = text;
    this.armHint();
  }

  close(): void {
    this.el.classList.add('hidden');
    this.isOpen = false;
    document.body.classList.remove('map-open');
    window.clearTimeout(this.hintTimer);
  }

  /** The hint stays long enough to read, then gets out of the way of the map. */
  private armHint(): void {
    this.hint.classList.remove('faded');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.add('faded'), 3200);
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
    const [w, h] = [this.view.clientWidth, this.view.clientHeight];
    const base = mapCanvasBase(w, h, this.width, this.height);
    if (w <= 0 || h <= 0) return;
    this.canvas.style.width = `${base.baseW}px`;
    this.canvas.style.height = `${base.baseH}px`;
    const clamped = clampMapPan(this.panX, this.panY, w, h, base.baseW, base.baseH, this.zoom);
    this.panX = clamped.panX;
    this.panY = clamped.panY;
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.view.classList.toggle('zoomed', this.zoom > 1);
  }

  /** Blank paper over the map, with the ground seen cut out of it, soft-edged. */
  private drawFog(g: CanvasRenderingContext2D, seen: SeenGround): void {
    this.fog ??= document.createElement('canvas');
    const f = this.fog;
    f.width = this.width;
    f.height = this.height;
    const fg = f.getContext('2d') as CanvasRenderingContext2D;
    const [left, top] = this.toMap(-this.halfX, -this.halfZ);
    const [right, bottom] = this.toMap(this.halfX, this.halfZ);
    fg.fillStyle = PAPER;
    fg.fillRect(left, top, right - left, bottom - top);
    fg.globalCompositeOperation = 'destination-out';
    fg.fillStyle = '#000';
    const r = seenTuning.cell * 0.85 * this.scale;
    fg.beginPath();
    for (const [col, row] of seen.cells()) {
      const [x, y] = this.toMap(...seen.centre(col, row));
      fg.moveTo(x + r, y);
      fg.arc(x, y, r, 0, Math.PI * 2);
    }
    fg.fill();
    g.save();
    g.filter = 'blur(3px)';
    g.drawImage(f, 0, 0);
    g.restore();
  }

  /** A place's name on the map, at the size the marks are drawn. */
  private nameFont(p: PoiDef): string {
    return `${p.kind === 'campsite' ? 'bold ' : ''}${26 * this.marks}px "Patrick Hand", "Nunito", sans-serif`;
  }

  /** A pencilled question mark where something hasn't been found yet (canvas px). */
  private drawHint(g: CanvasRenderingContext2D, x: number, y: number): void {
    const k = this.marks;
    g.fillStyle = 'rgba(243, 235, 218, 0.85)';
    g.beginPath();
    g.arc(x, y, 15 * k, 0, Math.PI * 2);
    g.fill();
    g.font = `bold ${30 * k}px "Patrick Hand", "Nunito", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#7A5A3A';
    g.fillText('?', x, y + 1);
  }

  private drawPoi(g: CanvasRenderingContext2D, p: PoiDef, label: MapLabel): void {
    const [x, y] = this.toMap(p.x, p.z);
    const img = this.iconImages.get(p.kind);
    const k = this.marks;
    g.fillStyle = 'rgba(243, 235, 218, 0.85)';
    g.beginPath();
    g.arc(x, y, 17 * k, 0, Math.PI * 2);
    g.fill();
    if (img?.complete) g.drawImage(img, x - 14 * k, y - 14 * k, 28 * k, 28 * k);
    g.font = this.nameFont(p);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.lineWidth = 5 * k;
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
    g.scale(this.marks, this.marks);
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
