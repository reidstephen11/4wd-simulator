import { icons } from './icons';

export interface ToolOption {
  id: string;
  label: string;
  icon: keyof typeof icons;
  enabled: boolean;
}

/**
 * Radial tool menu (SPEC §9): held open with Q / LB. Point with the mouse, the steering
 * keys or the left stick; letting go of Q/LB picks the highlighted option.
 */
export class ToolMenu {
  readonly el: HTMLElement;
  private options: ToolOption[] = [];
  private selected = -1;
  isOpen = false;
  onPick: ((id: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tool-menu hidden';
    root.appendChild(this.el);
    this.el.addEventListener('mousemove', (e) => {
      const r = this.el.getBoundingClientRect();
      this.pointAt(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), 30);
    });
  }

  open(options: ToolOption[]): void {
    this.options = options;
    this.selected = -1;
    this.isOpen = true;
    this.el.innerHTML = '<div class="tool-ring"></div><div class="tool-centre paper">Tools</div>';
    const n = options.length;
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = `tool-option paper${o.enabled ? '' : ' disabled'}`;
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      b.style.left = `calc(50% + ${Math.cos(ang) * 120}px)`;
      b.style.top = `calc(50% + ${Math.sin(ang) * 120}px)`;
      b.innerHTML = `<span class="tool-icon">${icons[o.icon]}</span><span>${o.label}</span>`;
      b.addEventListener('click', () => {
        if (!o.enabled) return;
        this.selected = i;
        this.close(true);
      });
      this.el.appendChild(b);
    });
    this.el.classList.remove('hidden');
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
    this.el.classList.add('hidden');
    const o = this.options[this.selected];
    if (pick && o?.enabled) this.onPick?.(o.id);
  }
}
