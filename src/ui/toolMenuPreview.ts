import { ToolMenu, type ToolOption } from './toolMenu';
import { InputManager } from '../sim/input/inputManager';
import camp from './assets/camp-dusk.webp';
import './toolMenuPreview.css';

/** A lightweight, playable preview using the production menu and input code. */
export function showToolMenuPreview(root: HTMLElement): void {
  document.getElementById('app')!.style.background = `url(${camp}) center / cover`;
  const options: ToolOption[] = [
    { id: 'frontDiff', label: 'Lock front diff', icon: 'frontDiff', enabled: true },
    { id: 'rearDiff', label: 'Lock rear diff', icon: 'rearDiff', enabled: true },
    { id: 'precision', label: 'Enable precision crawl', icon: 'crawl', enabled: true },
    { id: 'tyres', label: 'Tyres: 36 psi', icon: 'tyre', enabled: true },
    { id: 'transfer', label: 'Transfer: 4H (change)', icon: 'feature', enabled: true },
    { id: 'hubs', label: 'Unlock front hubs (20 s)', icon: 'feature', enabled: false },
    { id: 'recovery', label: 'Recovery gear', icon: 'winch', enabled: true },
    { id: 'winch', label: 'Winch', icon: 'winch', enabled: false },
    { id: 'planks', label: 'Place planks', icon: 'planks', enabled: true },
    { id: 'repair', label: 'Nothing to repair', icon: 'wrench', enabled: false },
    { id: 'refuel', label: 'Pour in a jerry can (2)', icon: 'fuel', enabled: true },
    { id: 'lights', label: 'Headlights on', icon: 'headlight', enabled: true },
  ];
  const bar = document.createElement('nav');
  bar.className = 'tool-preview-bar';
  bar.setAttribute('aria-label', 'Expedition tool menu preview');
  const status = document.createElement('p');
  status.className = 'tool-preview-status';
  status.setAttribute('role', 'status');
  root.append(bar, status);
  const menu = new ToolMenu(root);
  const input = new InputManager();
  input.vehicleEnabled = false;
  let cargo = false;
  const open = () => {
    menu.open(
      [
        ...options,
        ...(cargo
          ? ([
              { id: 'unhitch', label: 'Unhitch the trailer', icon: 'detach', enabled: true },
              { id: 'secureLoad', label: 'Tighten load straps', icon: 'wrench', enabled: true },
              { id: 'loadDrum', label: 'Load loose drum', icon: 'fuel', enabled: true },
              { id: 'trailerTyre', label: 'Repair trailer tyre', icon: 'wrench', enabled: true },
            ] as ToolOption[])
          : []),
      ],
      true,
    );
    menu.el.querySelector('.tool-hint')!.textContent =
      'Hold Q / L1 · Mouse, keys or right stick to select · Release to use · Centre to cancel';
  };
  bar.innerHTML =
    '<button data-preview-cargo aria-pressed="false">+ Trailer tools</button><a href="?">Back to game</a>';
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    cargo = !cargo;
    b.setAttribute('aria-pressed', String(cargo));
    open();
  });
  menu.onPick = (id) => {
    status.textContent = `Selected: ${id}`;
    open();
  };
  open();
  let held = false;
  const poll = () => {
    input.poll();
    const s = input.toolStick();
    const x = (input.held('menuRight') ? 1 : 0) - (input.held('menuLeft') ? 1 : 0);
    const y = (input.held('menuDown') ? 1 : 0) - (input.held('menuUp') ? 1 : 0);
    if (input.activeDevice === 'gamepad' || x || y) menu.pointAt(s.x + x, s.y + y, 0.4);
    if (input.pressed('back')) {
      menu.close(false);
      status.textContent = 'Cancelled';
      open();
    }
    const nextHeld = input.held('toolMenu');
    if (held && !nextHeld) {
      menu.close(true);
      open();
    }
    held = nextHeld;
    input.consumeUi();
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
