import * as THREE from 'three';
import type { HudState } from '../ui/hud';
import type { ToolOption } from '../ui/toolMenu';
import { toolShortLabels } from '../data/toolMenu';

const W = 1024;
const H = 512;
/** Panel size in the cab (m) and where it sits from the driver's eye: low and ahead, tilted up. */
const SIZE = { w: 0.46, h: 0.23 };
const PLACE = { x: 0.3, y: -0.3, z: -0.58, tilt: -0.48 };

export interface NoteWords {
  kind: string;
  title: string;
  text: string;
  hint: string;
}

interface Toast {
  text: string;
  until: number;
}

/**
 * The headset's dash panel (v1.98): the page's HUD is not seen inside a headset, so the parts
 * needed to drive are drawn on a small card fixed in the cab below the windscreen line: the
 * button prompts, the last message cards, the mission and the drive state, and the tool wheel
 * while it is open. Redrawn only when its text changes.
 */
export class VrDash {
  readonly mesh: THREE.Mesh;
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly toasts: Toast[] = [];
  private drawn = '';

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      // Always over the dash it sits in front of.
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.w, SIZE.h), material);
    this.mesh.name = 'vr-dash';
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    this.mesh.rotation.order = 'YXZ';
    this.seat(0.4);
  }

  /**
   * Sit the card towards the middle of the dash, clear of the dials ahead of the wheel, turned
   * to face the driver: `eyeX` is the driver's eye across the car (+ on the right, so a
   * right-hand drive car has the card on the driver's left).
   */
  seat(eyeX: number): void {
    const side = eyeX >= 0 ? -1 : 1;
    this.mesh.position.set(side * PLACE.x, PLACE.y, PLACE.z);
    this.mesh.rotation.set(PLACE.tilt, -side * Math.atan2(PLACE.x, -PLACE.z), 0);
  }

  toast(text: string, ms: number): void {
    this.toasts.push({ text, until: performance.now() + ms });
    while (this.toasts.length > 2) this.toasts.shift();
  }

  update(
    s: HudState,
    tools: { options: readonly ToolOption[]; selected: number } | null,
    note: NoteWords | null,
  ): void {
    const now = performance.now();
    while (this.toasts.length && this.toasts[0].until < now) this.toasts.shift();
    const status = statusLine(s);
    const mission = s.episode ? `${s.episode.mission}${s.episode.clock ? ` · ${s.episode.clock}` : ''}` : '';
    const prompts = s.prompts.slice(0, 3).map((p) => [p.keys, p.text] as const);
    const toasts = this.toasts.map((t) => t.text);
    const key = JSON.stringify([
      status,
      mission,
      prompts,
      toasts,
      tools?.selected,
      tools?.options.map((o) => o.label),
      note,
    ]);
    if (key === this.drawn) return;
    this.drawn = key;
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    roundRect(c, 4, 4, W - 8, H - 8, 28);
    c.fillStyle = 'rgba(28, 31, 24, 0.86)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(216, 208, 192, 0.55)';
    c.stroke();
    if (tools) this.drawTools(tools);
    else if (note) this.drawNote(note, prompts);
    else this.drawDrive(status, mission, prompts, toasts);
    this.texture.needsUpdate = true;
  }

  private drawDrive(
    status: string,
    mission: string,
    prompts: readonly (readonly [string, string])[],
    toasts: readonly string[],
  ): void {
    const c = this.ctx;
    c.textBaseline = 'middle';
    let y = 52;
    if (mission) {
      c.font = '500 30px Barlow, system-ui, sans-serif';
      c.fillStyle = '#c9c0ad';
      y = wrap(c, mission, 40, y, W - 80, 36, 2) + 14;
    }
    c.font = '600 40px Barlow, system-ui, sans-serif';
    for (const t of toasts) {
      c.fillStyle = '#f2d48a';
      y = wrap(c, t, 40, y, W - 80, 46, 2) + 8;
    }
    y = Math.max(y, 200);
    for (const [keys, text] of prompts) {
      if (y > H - 110) break;
      c.font = '700 34px Barlow, system-ui, sans-serif';
      const kw = Math.min(360, c.measureText(keys).width + 36);
      roundRect(c, 40, y - 26, kw, 52, 12);
      c.fillStyle = '#d8d0c0';
      c.fill();
      c.fillStyle = '#1c1f18';
      c.fillText(fit(c, keys, kw - 24), 58, y + 1);
      c.font = '500 36px Barlow, system-ui, sans-serif';
      c.fillStyle = '#f4efe4';
      c.fillText(fit(c, text, W - 120 - kw), 40 + kw + 20, y + 1);
      y += 64;
    }
    c.font = '600 32px Barlow, system-ui, sans-serif';
    c.fillStyle = '#9fb38a';
    c.fillText(fit(c, status, W - 80), 40, H - 46);
  }

  /** A history note or a lesson, in place of the drive panel while it is up. */
  private drawNote(n: NoteWords, prompts: readonly (readonly [string, string])[]): void {
    const c = this.ctx;
    c.textBaseline = 'middle';
    c.font = '600 26px Barlow, system-ui, sans-serif';
    c.fillStyle = '#c9c0ad';
    c.fillText(n.kind.toUpperCase(), 40, 44);
    c.font = '700 38px Barlow, system-ui, sans-serif';
    c.fillStyle = '#f4efe4';
    c.fillText(fit(c, n.title, W - 80), 40, 88);
    c.font = '400 29px Barlow, system-ui, sans-serif';
    c.fillStyle = '#e6dfd0';
    wrap(c, n.text, 40, 136, W - 80, 37, prompts.length ? 7 : 8);
    c.font = '600 28px Barlow, system-ui, sans-serif';
    c.fillStyle = '#9fb38a';
    const p = prompts[0];
    c.fillText(fit(c, p ? `${p[0]}: ${p[1]}` : n.hint, W - 80), 40, H - 40);
  }

  /** The tool wheel as a ring of names, the highlighted one lit (right stick to point, release the grip to use). */
  private drawTools(t: { options: readonly ToolOption[]; selected: number }): void {
    const c = this.ctx;
    const n = t.options.length;
    const cx = W / 2;
    const cy = H / 2 + 6;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    t.options.forEach((o, i) => {
      // The same directions as the stick picks them: index 0 straight up, then clockwise.
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * 360;
      const y = cy + Math.sin(a) * 190;
      const on = i === t.selected;
      c.font = `${on ? 700 : 500} ${on ? 34 : 28}px Barlow, system-ui, sans-serif`;
      const label = toolShortLabels[o.id] ?? o.label;
      const w = Math.min(250, c.measureText(label).width + 28);
      if (on) {
        roundRect(c, x - w / 2, y - 24, w, 48, 12);
        c.fillStyle = o.enabled ? '#e0a440' : '#6b6658';
        c.fill();
      }
      c.fillStyle = on ? '#1c1f18' : o.enabled ? '#f4efe4' : '#7d786b';
      c.fillText(fit(c, label, 236), x, y + 1);
    });
    const o = t.options[t.selected];
    c.font = '600 30px Barlow, system-ui, sans-serif';
    c.fillStyle = '#c9c0ad';
    c.fillText(
      o ? (o.enabled ? 'Let go of the grip to use' : 'Not available now') : 'Right stick to choose',
      cx,
      cy,
    );
    c.textAlign = 'left';
  }
}

function statusLine(s: HudState): string {
  const parts = [s.transfer?.mode ?? (s.range === 'low' ? 'Low range' : 'High range')];
  if (s.parkBrake) parts.push('Handbrake on');
  if (s.frontLocked) parts.push('Front locker');
  if (s.rearLocked) parts.push('Rear locker');
  if (s.precisionCrawl) parts.push('Crawl');
  if (s.winchAttached) parts.push('Winch on');
  if (s.lights !== 'off') parts.push(s.lights === 'high' ? 'High beam' : 'Low beam');
  if (s.engine === 2) parts.push('STALLED');
  else if (s.engine === 1) parts.push('Water in the engine');
  return parts.join('  ·  ');
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Cut `text` with an ellipsis to fit `max` px. */
function fit(c: CanvasRenderingContext2D, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Draw `text` over up to `lines` lines from y; returns the y below it. */
function wrap(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  lh: number,
  lines: number,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(next).width > max && line) {
      n++;
      if (n === lines) {
        c.fillText(fit(c, `${line} ${words.slice(i).join(' ')}`, max), x, y);
        return y + lh;
      }
      c.fillText(line, x, y);
      y += lh;
      line = words[i];
    } else line = next;
  }
  if (line) {
    c.fillText(line, x, y);
    y += lh;
  }
  return y;
}
