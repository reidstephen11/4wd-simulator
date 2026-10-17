# 4WD Simulator

A relaxed, single-player off-road exploration game that runs in the browser. Drive a detailed, 1970s Land Cruiser 40 Series-inspired short-wheelbase 4WD through a patch of Australian high country, using a winch, planks and careful line choice to get over rough ground. No races, no scores — just the drive and what's over the next hill.

Built with Three.js, Rapier physics and TypeScript. Everything, including leaf textures, terrain detail and sound, is generated in code; there are no downloaded asset files. Graphics use smooth terrain lighting, fine eucalyptus foliage, reflective water and detailed vehicle materials. High quality uses the full resolution of displays with up to 2× pixel density.

## Play

**Online:** https://reidstephen11.github.io/4wd-simulator/ (deployed from `main` by GitHub Actions).

**Locally** (Node 20 or newer):

```bash
npm install
npm run dev        # then open http://localhost:5173
```

Other scripts:

| Script             | What it does                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `npm run build`    | Type-checks and builds the static site into `dist/`                                                |
| `npm run preview`  | Serves `dist/` at http://localhost:4173                                                            |
| `npm run lint`     | ESLint and Prettier check                                                                          |
| `npm test`         | Unit and headless physics tests (Vitest)                                                           |
| `npm run test:e2e` | Browser tests (Playwright; builds first). Set `SCREENSHOTS=M1,M2,…` to refresh `docs/screenshots/` |

Sound starts after your first click or key press (browser rule).

## Controls

| Action                      | Keyboard                                              | Gamepad                                              |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Accelerate                  | W / ↑                                                 | RT                                                   |
| Brake / reverse             | S / ↓ (hold when stopped to reverse)                  | LT                                                   |
| Steer                       | A D / ← →                                             | Left stick                                           |
| Handbrake                   | Space                                                 | X / Square                                           |
| Toggle high/low range       | L (below 20 km/h)                                     | Y / Triangle                                         |
| Winch quick attach / detach | E                                                     | RB                                                   |
| Winch in / out              | R / F                                                 | D-pad up / down                                      |
| Tool menu (winch, planks)   | Hold Q, point with the mouse, arrows or WASD, release | Hold LB, point with the left stick or d-pad, release |
| Interact (pick up planks)   | E (when prompted)                                     | A / Cross                                            |
| Right vehicle               | Hold J (when prompted)                                | Hold B / Circle                                      |
| Camera distance             | Scroll                                                | Right stick up/down                                  |
| Horn                        | H                                                     | Left stick click                                     |
| Map                         | M                                                     | View / Select                                        |
| Pause                       | Esc                                                   | Start / Options                                      |

Placing planks: choose **Place planks** in the tool menu, move them with W/S, turn them with A/D, place with E, cancel with Esc. Prompts on screen switch between keyboard and gamepad glyphs depending on what you last touched.

## Debug mode

Add `?debug` to the URL (for example `http://localhost:5173/?debug` or `https://reidstephen11.github.io/4wd-simulator/?debug`). You get:

- An overlay with FPS, a frame-time graph, draw calls, triangles, main-thread time (simulation and rendering), vehicle state (speed, gear, rpm, surface and load per wheel), winch, flooding, dirt, sound levels and particle counts.
- A panel with: free-fly camera (also **C**), physics collider wireframes and wheel contact points, a teleport button for every place on the map, buttons to play each bird call, and live sliders for the main vehicle tuning values.

## What to test

The v0.1 checklist (SPEC §16), plus things that can only be judged by playing:

- [ ] It loads from the Pages link in current Chrome, Firefox and Edge.
- [ ] Starting at River Flat Camp, you can drive to every place on the map using only the vehicle and its tools (14 places; the map fills in as you find them).
- [ ] **Deep Crossing:** drive into the deep channel and sit there — the engine sputters after about 5 s under water and stalls at 10 s. It restarts on throttle once the air intake has been clear for 20 s.
- [ ] **The Staircase:** the rocky climb needs low range (press L while slow); high range shouldn't make it.
- [ ] **Washout Gully:** the car can't cross the 1.2 m gap on its own. Lay both planks across it (tool menu → Place planks) or take the detour around the top end.
- [ ] **Bog Hole:** in high range the car gets stuck; attach the winch to a nearby tree or marked boulder (E) and reel in (R) to get out.
- [ ] Roll the car on a steep side slope, then right it by holding J.
- [ ] The compass shows discovered places within 400 m; the paper map (M) labels only what you've found; both survive a page reload, and you restart at the last campsite you visited.
- [ ] Pause menu → Return to last campsite works; settings (graphics quality, volumes, units) apply straight away and are remembered.
- [ ] Frame rate on Medium: open `?debug` and check the overlay holds 60 fps while driving around (the target is a 2022 laptop with integrated graphics).
- [ ] Feel: steering response, how much the body leans, braking distance, how easily it rolls, how hard the Staircase and Bog Hole are, camera distance and lag. The main numbers are in `src/data/vehicle.ts` and `src/data/camera.ts`, and the vehicle ones can be changed live in the debug panel.
- [ ] Sound: engine pitch with revs, tyre noise changing between dirt, gravel, mud and water, winch whine, wind up high, creek water, bird calls, the map rustle and the discovery chime. Check the three volume sliders.

## Project layout

```
src/
  core/    game loop (fixed 60 Hz physics + interpolated rendering), game orchestration, test hook
  data/    every tuning number: palette, environment, map, vehicle, surfaces, tools, camera, quality, audio, particles
  sim/     headless simulation (no rendering, UI or audio imports): world generation, physics, vehicle, tools, saving
  render/  Three.js: terrain, vegetation, water, sky, vehicle model, particles, chase camera
  ui/      HUD, compass, paper map, menus, tool menu
  audio/   Web Audio synthesis
  debug/   overlay, free camera, debug panel
tests/     Vitest unit and headless physics tests
e2e/       Playwright browser tests (one file per milestone)
docs/      DECISIONS.md (choices made where the spec was open) and screenshots per milestone
```

## Deployment

`.github/workflows/deploy.yml` runs lint and unit tests, builds `dist/` and deploys it to GitHub Pages on every push to `main`. The build uses relative asset paths, so it works under the repository's Pages URL. Pages has to be switched on once in the repository settings: **Settings → Pages → Source: GitHub Actions**.
