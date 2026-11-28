// Runs the built game full screen on Batocera. Files are served from a private
// app:// address so saves in localStorage stay put between launches.
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'game');

// Same engine as Over the Cape. The Ryzen 5 3500U manages about 60 fps with Low graphics drawn at 2/3 of 1080p (measured
// 31 Oct 2026; 40-45 fps at full 1080p). The game draws at devicePixelRatio, so lower it.
const DRAW_SCALE = `<script>Object.defineProperty(window, 'devicePixelRatio', { get: () => 2 / 3 });</script>`;

app.setPath('userData', process.env.SIM_SAVE_DIR || '/userdata/saves/ports/4WDSimulator');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(request.url).pathname)));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return new Response('', { status: 403 });
    if (file === path.join(ROOT, 'index.html')) {
      const html = fs.readFileSync(file, 'utf8').replace('<head>', `<head>${DRAW_SCALE}`);
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  const win = new BrowserWindow({
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS('* { cursor: none !important; }');
  });
  // Batocera's exit hotkey sends Alt+F4. Quit on release, otherwise the menu behind
  // catches the same keypress and restarts itself.
  let exitPending = false;
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key !== 'F4') return;
    if (input.type === 'keyDown' && input.alt) exitPending = true;
    if (!exitPending) return;
    event.preventDefault();
    if (input.type === 'keyUp') app.quit();
  });
  win.loadURL('app://game/index.html');
});

ipcMain.on('quit', () => app.quit());
app.on('window-all-closed', () => app.quit());
