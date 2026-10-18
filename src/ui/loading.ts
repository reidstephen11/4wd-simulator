import { BUILD_LABEL } from '../core/buildInfo';

/** Loading screen (SPEC §9): title, progress bar, short controls reminder. */
export class LoadingScreen {
  readonly el: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly label: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'loading';
    this.el.innerHTML = `
      <div class="loading-card paper">
        <h1>4WD Simulator</h1>
        <p class="subtitle">High Country</p>
        <div class="progress"><div class="progress-fill"></div></div>
        <p class="progress-label">Starting…</p>
        <ul class="controls-reminder">
          <li><b>W / S</b> drive and brake · <b>A / D</b> steer</li>
          <li><b>L</b> high / low range · <b>E</b> winch · <b>Q</b> tools</li>
          <li><b>M</b> map · <b>Esc</b> pause</li>
        </ul>
        <p class="build-label">Version ${BUILD_LABEL}</p>
      </div>`;
    root.appendChild(this.el);
    this.bar = this.el.querySelector('.progress-fill') as HTMLElement;
    this.label = this.el.querySelector('.progress-label') as HTMLElement;
  }

  set(progress: number, label: string): void {
    this.bar.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
    this.label.textContent = label;
  }

  hide(): void {
    this.el.classList.add('hidden');
    setTimeout(() => this.el.remove(), 600);
  }
}
