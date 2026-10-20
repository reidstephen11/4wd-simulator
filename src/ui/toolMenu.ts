import { icons } from './icons';

export interface ToolOption {
  id: string;
  label: string;
  icon: keyof typeof icons;
  enabled: boolean;
}

/**
 * Radial tool menu (SPEC §9): held open with Q / LB. Point with the mouse, the steering
 * keys or the left stick; letting go of Q/LB picks the highlighted option. Opened from the
 * touch TOOLS button it stays open until an option or the space around it is tapped.
 */
export class ToolMenu {
  readonly el: HTMLElement;
  private options: ToolOption[] = [];
  private selected = -1;
  isOpen = false;
  /** Opened by a tap: stays open without a held button. */
  sticky = false;
  onPick: ((id: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tool-menu hidden';
    root.appendChild(this.el);
    this.el.addEventListener('mousemove', (e) => {
      // Over an option, that option; on the oval, a corner of one can lie in the
      // direction of its neighbour.
      const over = (e.target as HTMLElement).closest('.tool-option');
      if (over) {
        this.setSelected([...this.el.querySelectorAll('.tool-option')].indexOf(over));
        return;
      }
      const r = this.el.getBoundingClientRect();
      this.pointAt(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), 30);
    });
    this.el.addEventListener('click', (e) => {
      if (this.sticky && !(e.target as HTMLElement).closest('.tool-option')) this.close(false);
    });
  }

  open(options: ToolOption[], sticky = false): void {
    this.options = options;
    this.sticky = sticky;
    this.selected = -1;
    this.isOpen = true;
    this.el.innerHTML = '<div class="tool-ring"></div><div class="tool-centre paper">Tools</div>';
    this.el.classList.remove('hidden');
    const n = options.length;
    const buttons = options.map((o, i) => {
      const b = document.createElement('button');
      b.className = `tool-option paper${o.enabled ? '' : ' disabled'}`;
      b.innerHTML = `<span class="tool-icon">${icons[o.icon]}</span><span>${o.label}</span>`;
      b.addEventListener('click', () => {
        if (!o.enabled) return;
        this.selected = i;
        this.close(true);
      });
      this.el.appendChild(b);
      return b;
    });
    const w = Math.max(...buttons.map((b) => b.offsetWidth)),
      h = Math.max(...buttons.map((b) => b.offsetHeight));
    const { rx, ry } = ringRadii(
      n,
      w,
      h,
      this.el.clientWidth || innerWidth,
      this.el.clientHeight || innerHeight,
    );
    buttons.forEach((b, i) => {
      const p = ringPoint(i, n, rx, ry);
      b.style.left = `calc(50% + ${p.x}px)`;
      b.style.top = `calc(50% + ${p.y}px)`;
    });
    const ring = this.el.querySelector('.tool-ring') as HTMLElement;
    ring.style.width = `${rx * 2}px`;
    ring.style.height = `${ry * 2}px`;
    ring.style.margin = `${-ry}px 0 0 ${-rx}px`;
  }

  /** Highlight the option in a screen direction (dx right, dy down). */
  pointAt(dx: number, dy: number, deadzone: number): void {
    if (!this.isOpen || Math.hypot(dx, dy) < deadzone) return;
    const n = this.options.length;
    let ang = Math.atan2(dy, dx) + Math.PI / 2;
    ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = Math.round(ang / ((Math.PI * 2) / n)) % n;
    this.setSelected(i);
  }

  private setSelected(i: number): void {
    this.selected = i;
    this.el.querySelectorAll('.tool-option').forEach((b, k) => b.classList.toggle('selected', k === i));
  }

  /** Close; when `pick` is true the highlighted, enabled option is chosen. */
  close(pick: boolean): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.sticky = false;
    this.el.classList.add('hidden');
    const o = this.options[this.selected];
    if (pick && o?.enabled) this.onPick?.(o.id);
  }
}

/** Where option i of n sits on an oval of radii rx × ry (clockwise from the top). */
export function ringPoint(i: number, n: number, rx: number, ry: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
}

/** Do any two of n options (w × h px) on this oval overlap? */
export function ringOverlaps(n: number, rx: number, ry: number, w: number, h: number): boolean {
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = ringPoint(i, n, rx, ry),
        b = ringPoint(j, n, rx, ry);
      if (Math.abs(a.x - b.x) < w + 4 && Math.abs(a.y - b.y) < h + 4) return true;
    }
  return false;
}

/**
 * Radii of the oval the options sit on: from a circle of 120 px (less on a small screen,
 * scaled from its shorter side), wider until neighbouring options (w × h px) no longer
 * overlap, then taller if the screen (vw × vh) is too narrow for that (a phone held
 * upright). Always on the screen.
 */
export function ringRadii(
  n: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
): { rx: number; ry: number } {
  const start = Math.min(120, 0.25 * Math.min(vw, vh));
  const fitX = Math.max(start, vw / 2 - w / 2 - 6),
    fitY = Math.max(start, vh / 2 - h / 2 - 6);
  let rx = start,
    ry = start;
  while (ringOverlaps(n, rx, ry, w, h) && (rx < fitX || ry < fitY)) {
    if (rx < fitX) rx = Math.min(fitX, rx + 4);
    else ry = Math.min(fitY, ry + 4);
  }
  return { rx, ry };
}
