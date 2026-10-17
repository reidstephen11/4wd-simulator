import './ui/styles.css';
import { Game } from './core/game';
import { LoadingScreen } from './ui/loading';

async function boot(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const uiEl = document.getElementById('ui') as HTMLElement;
  const loading = new LoadingScreen(uiEl);
  try {
    const game = await Game.create(appEl, uiEl, (p, label) => loading.set(p, label));
    loading.set(1, 'Ready');
    loading.hide();
    game.start();
  } catch (err) {
    console.error(err);
    const panel = document.createElement('div');
    panel.className = 'error-panel';
    panel.innerHTML = `<div class="paper"><h2>Something went wrong</h2><p></p></div>`;
    (panel.querySelector('p') as HTMLElement).textContent = String(err);
    uiEl.appendChild(panel);
  }
}

void boot();
