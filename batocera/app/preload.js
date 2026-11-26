// Start new players on Low graphics; they can change it in Settings.
const SAVE_KEY = '4wdsim.save.v2';
if (!localStorage.getItem(SAVE_KEY)) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, settings: { quality: 'low' } }));
}

// Backup way out: hold Select + Start for 1.5 seconds to return to Batocera.
const { ipcRenderer } = require('electron');

const SELECT = 8;
const START = 9;
let heldSince = 0;

setInterval(() => {
  const pads = [...navigator.getGamepads()].filter(Boolean);
  const held = pads.some((p) => p.buttons[SELECT]?.pressed && p.buttons[START]?.pressed);
  if (!held) heldSince = 0;
  else if (!heldSince) heldSince = Date.now();
  else if (Date.now() - heldSince > 1500) ipcRenderer.send('quit');
}, 100);
