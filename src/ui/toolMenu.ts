import './toolMenu.css';
import { icons } from './icons';
import { uiScale } from './uiScale';
import { orderTools, toolGroup, toolGroupLabels, toolShortLabels } from '../data/toolMenu';

export interface ToolOption {
  id: string;
  label: string;
  icon: keyof typeof icons;
  enabled: boolean;
}

/** Hold Q / L1, aim with the mouse, keys or right stick, then release to use. */
export class ToolMenu {
  readonly el: HTMLElement;
  private options: ToolOption[] = [];
  private selected = -1;
  private scale = 1;
  isOpen = false;
  sticky = false;
  onPick: ((id: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tool-menu hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Vehicle tools');
    root.appendChild(this.el);
    this.el.addEventListener('mousemove', (e) => {
      const over = (e.target as HTMLElement).closest<HTMLElement>('[data-tool-index]');
      if (over) {
        this.setSelected(Number(over.dataset.toolIndex));
        return;
      }
      const r = this.el.getBoundingClientRect();
      this.pointAt(
        e.clientX - (r.left + r.width / 2),
        e.clientY - (r.top + r.height / 2),
        92 * uiScale() * this.scale,
      );
    });
    this.el.addEventListener('click', (e) => {
      const over = (e.target as HTMLElement).closest<HTMLElement>('[data-tool-index]');
      if (over) {
        this.setSelected(Number(over.dataset.toolIndex));
        if (this.options[this.selected]?.enabled) this.close(true);
      } else if (this.sticky) this.close(false);
    });
    window.addEventListener('resize', () => {
      if (this.isOpen) this.layout();
    });
  }

  open(
    options: ToolOption[],
    sticky = false,
    hint = 'Hold Q · Point to select · Release Q to use · Esc to cancel',
  ): void {
    this.options = orderTools(options);
    this.sticky = sticky;
    this.selected = -1;
    this.isOpen = true;
    this.el.dataset.style = 'expedition';
    this.el.classList.toggle('tool-dense', options.length > 10);
    this.el.classList.toggle('tool-crowded', options.length > 13);
    this.el.classList.remove('hidden');
    this.el.innerHTML = `<div class="tool-heading"><span>OVER THE CAPE / FIELD CONTROLS</span><h2>Vehicle tools</h2></div>
      <div class="tool-stage"><svg class="tool-sectors" viewBox="-300 -300 600 600" aria-hidden="true"></svg>
      <div class="tool-centre"><span class="tool-eyebrow">READY WHEN YOU ARE</span><strong>Choose a tool</strong><small>Return to centre<br>to cancel</small></div></div>
      <div class="tool-legend"><span>Traction</span><span>Recovery</span><span>Vehicle</span>${options.some((o) => toolGroup(o.id) === 'cargo') ? '<span>Trailer</span>' : ''}</div>
      <p class="tool-hint"></p>`;
    this.el.querySelector('.tool-hint')!.textContent = sticky
      ? 'Tap a tool to use · Tap outside to cancel'
      : hint;
    const stage = this.el.querySelector('.tool-stage')!;
    const svg = this.el.querySelector('.tool-sectors')!;
    this.options.forEach((o, i) => {
      const group = toolGroup(o.id);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', sectorPath(i, this.options.length));
      path.dataset.toolIndex = String(i);
      path.dataset.group = group;
      path.classList.add('tool-sector');
      if (!o.enabled) path.classList.add('disabled');
      svg.appendChild(path);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tool-option${o.enabled ? '' : ' disabled'}`;
      b.dataset.toolIndex = String(i);
      b.dataset.group = group;
      b.setAttribute('aria-label', o.label);
      b.setAttribute('aria-disabled', String(!o.enabled));
      b.innerHTML = `<span class="tool-family">${toolGroupLabels[group]}</span><span class="tool-icon">${icons[o.icon]}</span><span>${toolShortLabels[o.id] ?? o.label}</span>`;
      b.addEventListener('focus', () => this.setSelected(i));
      stage.appendChild(b);
    });
    this.layout();
  }

  private layout(): void {
    // The wheel is drawn 600 × --u across (src/ui/uiScale.ts); shrink it to fit the screen.
    const u = uiScale();
    this.scale = Math.min(
      1,
      (this.el.clientWidth - 32 * u) / (600 * u),
      (this.el.clientHeight - 152 * u) / (600 * u),
    );
    const grid = this.sticky && this.scale < 0.72;
    this.el.classList.toggle('tool-grid', grid);
    const stage = this.el.querySelector<HTMLElement>('.tool-stage')!;
    stage.style.transform = grid ? '' : `translate(-50%, -50%) scale(${Math.max(0.25, this.scale)})`;
    this.el.querySelectorAll<HTMLElement>('.tool-option').forEach((b, i) => {
      const radius = this.options.length > 10 ? 234 : 211;
      const p = ringPoint(i, this.options.length, radius, radius);
      b.style.left = `calc(50% + ${p.x} * var(--u))`;
      b.style.top = `calc(50% + ${p.y} * var(--u))`;
    });
  }

  /** Screen directions: right-stick neutral explicitly cancels the highlight. */
  pointAt(dx: number, dy: number, deadzone: number): void {
    if (!this.isOpen) return;
    if (Math.hypot(dx, dy) < deadzone) {
      this.setSelected(-1);
      return;
    }
    const n = this.options.length;
    if (!n) return;
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    this.setSelected(Math.round(angle / ((Math.PI * 2) / n)) % n);
  }

  private setSelected(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.el.querySelectorAll<HTMLElement | SVGElement>('[data-tool-index]').forEach((b) => {
      const selected = Number(b.dataset.toolIndex) === i;
      b.classList.toggle('selected', selected);
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(selected));
    });
    const o = this.options[i];
    this.el.querySelector('.tool-eyebrow')!.textContent = o
      ? toolGroupLabels[toolGroup(o.id)]
      : 'READY WHEN YOU ARE';
    this.el.querySelector('.tool-centre strong')!.textContent = o?.label ?? 'Choose a tool';
    this.el.querySelector('.tool-centre small')!.textContent = o
      ? o.enabled
        ? this.sticky
          ? 'Tap to use'
          : 'Release to use'
        : 'Unavailable right now'
      : 'Return to centre to cancel';
    this.el.querySelector('.tool-centre')!.classList.toggle('unavailable', !!o && !o.enabled);
  }

  /** What is on offer and what is highlighted (the headset's dash panel draws it, v1.98). */
  get view(): { options: readonly ToolOption[]; selected: number } | null {
    return this.isOpen ? { options: this.options, selected: this.selected } : null;
  }

  close(pick: boolean): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.sticky = false;
    this.el.classList.add('hidden');
    const o = this.options[this.selected];
    if (pick && o?.enabled) this.onPick?.(o.id);
  }
}

/** Annular sectors use the same angular boundaries as stick selection. */
export function sectorPath(i: number, n: number): string {
  const a = -Math.PI / 2 + ((i - 0.5) / n) * Math.PI * 2 + 0.012;
  const b = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2 - 0.012;
  const p = (r: number, t: number) => `${Math.cos(t) * r},${Math.sin(t) * r}`;
  return `M${p(116, a)} L${p(288, a)} A288,288 0 0 1 ${p(288, b)} L${p(116, b)} A116,116 0 0 0 ${p(116, a)} Z`;
}

/** Where option i of n sits on an oval of radii rx × ry (clockwise from the top). */
export function ringPoint(i: number, n: number, rx: number, ry: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
}
