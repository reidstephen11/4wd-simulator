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

| Action                         | Keyboard                                              | Gamepad                                              |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| Accelerate                     | W / ↑                                                 | RT                                                   |
| Brake / reverse                | S / ↓ (hold when stopped to reverse)                  | LT                                                   |
| Steer                          | A D / ← →                                             | Left stick                                           |
| Handbrake                      | Space                                                 | X / Square                                           |
| Toggle high/low range          | L (below 20 km/h)                                     | Y / Triangle                                         |
| Front / rear diff lock         | Z / X (below 5 km/h to engage)                        | Hold LB → front / rear diff                          |
| Precision crawl                | P                                                     | Hold LB → precision crawl                            |
| Winch quick attach / detach    | E                                                     | RB                                                   |
| Winch in / out                 | R / F                                                 | D-pad up / down                                      |
| Tool menu (recovery, crawling) | Hold Q, point with the mouse, arrows or WASD, release | Hold LB, point with the left stick or d-pad, release |
| Interact (pick up planks)      | E (when prompted)                                     | A / Cross                                            |
| Right vehicle                  | Hold J (when prompted)                                | Hold B / Circle                                      |
| Orbit camera                   | Mouse drag (left or right button), or Num 4/6/8/2     | Right stick                                          |
| Camera distance                | Scroll                                                | D-pad left/right while driving                       |
| Recenter camera                | V or Num 5, or the Reset view button                  | Right stick click                                    |
| Cycle crawler views            | C, or the View button                                 | Hold LB + click right stick                          |
| Horn                           | H                                                     | Left stick click                                     |
| Map                            | M                                                     | View / Select                                        |
| Pause                          | Esc                                                   | Start / Options                                      |

Placing planks: choose **Place planks** in the tool menu, move them with W/S, turn them with A/D, place with E, cancel with Esc. Prompts on screen switch between keyboard and gamepad glyphs depending on what you last touched.

## Rock crawling

The **Camp Rock Course** is about 40 m east of River Flat Camp; follow the sign beside camp. Three marked lines progress from low warm-up steps to cross-axle rocks and a harder ledge line. Each line has entrance and exit markers, a difficulty sign and nearby driving hints. The course also appears on the map once discovered.

Select **low range (L)**, then toggle **precision crawl (P)**. Hold W for a forward target of 2.5 km/h; S still brakes normally while moving forwards, then targets 2 km/h in reverse once stopped. Precision mode adjusts throttle and brakes to control descents while retaining full engine effort for climbing. Analogue triggers vary the target speed. Release the controls to stop, or press P again for normal driving.

Toggle the **rear locker with X** and **front locker with Z**. A locked axle keeps using the grounded tyre when its partner lifts. Engage below 5 km/h; unlocking is always allowed. Front lock increases the turning radius, so unlock it for tight manoeuvres. The status buttons show each axle's state and can also be clicked. On gamepad, hold LB, point the left stick at the front locker, rear locker or precision crawl option, then release LB to select it.

Low range also softens the springs and anti-roll bars, adds 6 cm of suspension droop and adjusts the dampers. The tyres can stay loaded over diagonal rocks while parked body height and bump clearance stay the same. Returning to high range restores the normal suspension support.

Press **C** or click **View** to cycle Follow → Front left → Front right → Rear close. The front views look low across the tyres for placing a wheel on a rock; the rear view helps judge the belly and rear axle. Mouse drag, right-stick orbit and zoom still work. **V / R3 / Reset view** returns to follow and restores its previous zoom. On gamepad, hold **LB and click R3** to cycle views without choosing a tool.

The **Granite Link** starts just east of the camp course. Follow the amber markers through about 70 m of split rocks, an off-camber shelf and granite ledges. Marked boulders beside the trail provide winch anchors. The wider, green-marked gravel bypass connects the same entrance and exit, making a loop back to camp. Both routes work in either direction; section hints explain the obstacle nearby. The rocks' chamfered surfaces use the same vertices for rendering and collision.

## Debug mode

Add `?debug` to the URL (for example `http://localhost:5173/?debug` or `https://reidstephen11.github.io/4wd-simulator/?debug`). You get:

- An overlay with FPS, a frame-time graph, draw calls, triangles, main-thread time (simulation and rendering), vehicle state (speed, gear, rpm, surface and load per wheel), winch, flooding, dirt, sound levels and particle counts.
- A panel with: free-fly camera (also the **backtick key**), physics collider wireframes and wheel contact points, a teleport button for every place on the map, buttons to play each bird call, and live sliders for the main vehicle tuning values.

## What to test

The v0.1 checklist (SPEC §16), plus things that can only be judged by playing:

- [ ] It loads from the Pages link in current Chrome, Firefox and Edge.
- [ ] Starting at River Flat Camp, you can drive to every place on the map using only the vehicle and its tools (16 places; the map fills in as you find them).
- [ ] **Camp logs:** select low range (L) and crawl over both logs without a run-up. Try reverse and a line with only one wheel on each axle crossing the log; the tyres should climb before the body touches.
- [ ] **Granite Link:** follow the amber trail through all three rock sections, then return on the green gravel bypass. Try C / View at a diagonal obstacle to see the axle flex; confirm V restores follow. Try the loop in the opposite direction.
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
