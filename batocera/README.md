# Batocera port

Runs the built game full screen as a Ports tile on Batocera (x86_64), inside Electron 45.2.0. Same wrapper as Over the Cape's `batocera/` folder.

Deploy or update from the repo root (saves are kept): `npm install && bash batocera/deploy.sh [host]` (default `batocera-nuc.local`).

- App `/userdata/system/4wd-simulator/`; launcher `/userdata/roms/ports/4WD Simulator.sh`; saves `/userdata/saves/ports/4WDSimulator/`; log `/userdata/system/logs/4wd-simulator.log`.
- New saves start on Low graphics; the page draws at 2/3 resolution; the tile runs at 30 W (`tdp=85`).
- Exit: Batocera's hotkey (Alt+F4), or hold Select + Start for 1.5 s.
