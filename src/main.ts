import './ui/styles.css';
import { Game, type LaunchChoice } from './core/game';
import { choiceFromSave, takeAutostart } from './core/launch';
import { maps } from './data/maps';
import { loadSave } from './sim/save/save';
import { LoadingScreen } from './ui/loading';
import { WelcomeScreen } from './ui/welcome';

async function play(choice: LaunchChoice, audio?: AudioContext): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const uiEl = document.getElementById('ui') as HTMLElement;
  const loading = new LoadingScreen(uiEl);
  loading.setSubtitle(maps[choice.map].def.name);
  try {
    const game = await Game.create(appEl, uiEl, choice, (p, label) => loading.set(p, label), audio);
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

function boot(): void {
  const uiEl = document.getElementById('ui') as HTMLElement;
  const choice = choiceFromSave(loadSave());
  // Changing map from the pause menu reloads straight into the game.
  if (takeAutostart()) void play(choice);
  else new WelcomeScreen(uiEl, choice, (c, audio) => void play(c, audio));
}

boot();
