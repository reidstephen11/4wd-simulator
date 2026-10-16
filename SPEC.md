# 4WD Simulator — Build Spec (v0.1: playable slice)

A relaxed, single-player off-road exploration game that runs in the browser. You drive a classic 1970s-style 4WD through a hand-designed patch of Australian high country, using a winch, planks and careful line choice to get over rough ground. There are no races, scores, currency or objectives. The point is the drive and finding what's over the next hill.

Inspired by *Over The Hill* (Funselektor, 2026). Use none of its names, assets, logos or text. The vehicle is a generic design with no real-world brand.

---

## 1. Decisions at a glance

| Area | Decision |
|---|---|
| Platform | Browser, desktop only. Three.js + TypeScript. |
| Players | Single-player. Code structured so co-op can be added later (see §11). |
| Scope | Small slice: one map (~1.5 × 1.5 km), one vehicle. |
| Driving feel | Between arcade and sim. Heavy, visible suspension, can slide and roll. High/low range, always 4WD, no diff locks, automatic gears within a range. |
| Visual style | Low-poly, flat-shaded, vertex colours, soft warm light. Own palette (§4). |
| Setting | Australian high country: eucalyptus forest, red-brown dirt tracks, granite ridges, a creek. |
| Purpose | Pure exploration. Discoverable places are marked on the map; no rewards, no challenges. |
| Navigation | Fold-out paper map (key press) + small compass strip. No minimap. |
| Recovery | Winch, two planks, jack to right the vehicle. "Return to last campsite" in the pause menu as a backup. |
| Damage | Light: visual dirt and dents, engine flooding in deep water. Full mechanical damage is a future update (§11). |
| Weather / time | Fixed late afternoon, clear sky. Lighting built so day/night and rain can be added later. |
| Camera | Chase camera only. |
| Audio | All sounds generated in code with the Web Audio API. No audio files. |
| Input | Keyboard and gamepad (Gamepad API). |
| Map creation | Main features placed by hand in data; small detail (bumps, rocks, trees) generated from a fixed seed. |
| Performance target | 60 fps on a mid-range laptop (integrated GPU from ~2022) at "Medium" quality. |

---

## 2. Tech stack

- **Build:** Vite, TypeScript (strict mode), ESLint, Prettier.
- **Rendering:** Three.js (`WebGLRenderer`).
- **Physics:** Rapier (`@dimforge/rapier3d-compat`). Use its heightfield collider for the terrain and `DynamicRayCastVehicleController` as the starting point for the vehicle.
- **Tests:** Vitest for logic and headless physics (Rapier runs in Node). Playwright for in-browser smoke tests and screenshots. Chromium is preinstalled at `/opt/pw-browsers`; do not run `playwright install`.
- **Dependencies:** pin exact versions in `package.json` (no `^` or `~`). Keep the list short: no UI framework, no game engine on top of Three.js.
- **Output:** a static site (`npm run build` → `dist/`) that runs from any static host.

**npm scripts:** `dev`, `build`, `preview`, `lint`, `test` (Vitest), `test:e2e` (Playwright).

---

## 3. Code structure

```
src/
  main.ts              entry: boot, loading screen, start loop
  core/                game loop (fixed 60 Hz physics step + interpolated render), events, config
  sim/                 everything that affects game state; no Three.js imports here
    world/             terrain heights, surface types, water volumes, anchors, POIs
    vehicle/           vehicle physics, drivetrain, condition (damage), engine flooding
    tools/             winch, planks, jack
    input/             maps keyboard/gamepad to a VehicleInput command per vehicle
    save/              localStorage save/load (wrapped in try/catch)
  render/              Three.js only: terrain mesh, vegetation, water, vehicle model, particles, sky, lighting
  ui/                  compass, paper map, prompts, toasts, pause and settings menus (plain DOM + CSS)
  audio/               Web Audio synthesis: engine, tyres, winch, ambience
  data/
    map.ts             hand-authored map features (§5)
    palette.ts         colour tokens (§4)
    surfaces.ts        surface table (§6.3)
    vehicle.ts         vehicle tuning constants (§6)
  debug/               debug overlay (§10)
```

Rules:
- `sim/` never imports from `render/`, `ui/` or `audio/`. Those layers read sim state each frame.
- No global "the player" singleton. Vehicles are entities with IDs. The local player *controls* a vehicle ID.
- All tuning numbers live in `data/` files, not scattered through code.

---

## 4. Visual language

**Overall look:** low-poly, faceted, flat-shaded (non-indexed geometry or `flatShading: true`). Colours come from vertex colours and the palette, not image textures. Shapes are simple and slightly chunky. Detail comes from silhouettes, light and colour changes, not from polygon count. Readability first: the player must be able to see slope, rock and mud at a glance.

**Lighting (late afternoon):**
- One directional sun, low (~25° elevation), warm (`#FFD9A0`), casting soft shadows (PCF soft) from a shadow camera that follows the vehicle.
- Hemisphere light: sky `#BFD6E2`, ground `#8A6A4A`.
- Tone mapping: ACES Filmic (or AgX), sRGB output.
- Distance fog that fades distant ridges toward a warm-to-blue haze (the blue look of eucalyptus haze). Near fog `#E8CFA6`, far ridges blend toward `#9FB4C4`.
- Sky: vertical gradient dome, horizon `#F2D3A0` → zenith `#8DB3C9`, with a soft sun glow.
- All environment values sit in one `Environment` config object so time of day and weather can drive them later.

**Palette (`data/palette.ts`):**

| Token | Hex | Use |
|---|---|---|
| `dirtTrack` | `#B5653A` | Red-brown vehicle tracks |
| `dirtDark` | `#8E4B2B` | Wheel ruts, track edges |
| `grassDry` | `#C9A35A` | Golden tussock grass, open flats |
| `grassSage` | `#8C9A6B` | Greener grass near water and in shade |
| `foliage` | `#7E8F6A` | Eucalyptus canopy |
| `foliageDark` | `#5E6E52` | Canopy shadow side, shrubs |
| `barkPale` | `#D8D0C0` | Snow gum / ghost gum trunks |
| `barkOchre` | `#C58B5C` | Peeling bark patches |
| `rock` | `#9A948A` | Granite |
| `rockDark` | `#6F6A63` | Rock shadow faces, scree |
| `mud` | `#6B4A33` | Bog holes, creek banks |
| `waterDeep` | `#4E7C86` | Deep creek |
| `waterShallow` | `#7FA9A8` | Shallows, ford |
| `vehicleBody` | `#D9C6A0` | Sand-beige body |
| `vehicleRoof` | `#EDE8DC` | Off-white roof |
| `vehicleTrim` | `#3A3A38` | Bumpers, wheels, trim |

Vary each colour slightly per vertex/instance (±4% brightness, small hue shift) so large areas don't look flat.

**Vegetation and props (all low-poly, instanced):**
- Trees: 3–4 eucalypt variants. Tall straight mountain ash in valleys, twisted snow gums on the high plain. Pale trunks, clumped canopies made of a few faceted blobs.
- Shrubs, tussock grass clumps, fallen logs, scattered granite boulders and tors.
- Man-made: weathered timber hut, rusted abandoned ute, fire lookout tower, wooden signposts, campsite fire ring and log seats, a cattle grid at the map entrance.

**Effects:** dust trail on dry dirt, mud spray from bog holes, water splash and wake in the creek. Particles are small flat-shaded quads or low-poly chunks in palette colours.

**Vehicle look:** short-wheelbase 1970s 4WD silhouette (boxy body, round headlights, flat bonnet, roof rack, spare wheel on the back, front winch on the bumper). Generic, no badges. Visible suspension movement: wheels move independently, and the body leans and pitches.

---

## 5. The map

**Size:** about 1.5 × 1.5 km. Edges are closed off naturally by steep mountains and dense scrub, plus an invisible wall as a fallback.

**How it's built:**
1. A base height from low-frequency noise (fixed seed) for rolling hills.
2. Hand-authored features in `data/map.ts`, applied on top: splines and shapes for the ridge, creek, tracks, flats and gullies.
3. Small detail from noise and seeded scatter: bumps, ruts, rocks, trees, grass. Scatter avoids tracks, water and POI footprints.

The same seed gives the same map every time.

**Physics heightfield:** 1 m resolution. **Render mesh:** split into chunks (e.g. 64 m) with distance-based detail levels so the far terrain uses fewer triangles.

**Layout (author these in `data/map.ts`):**

| Feature | Description | What it tests |
|---|---|---|
| **River Flat Camp** (spawn, campsite 1) | Grassy flat beside the creek in the south. Fire ring, signpost. | — |
| **Main track** | A winding dirt track from camp, up the valley, to the high plain. Worn ruts, a few rocky steps. | Basic driving |
| **The Creek** | Runs roughly east–west through the middle of the map. | Water |
| **Gravel Ford** | Wide, shallow (≤ 0.4 m) crossing on the main track. | Safe crossing |
| **Deep Crossing** | A shortcut crossing with a deep channel (up to ~1.1 m) on one side. The shallow line is visible if you look. | Engine flooding, line choice |
| **Bog Hole** | Muddy section on a side track near the creek. | Mud, winch |
| **Washout Gully** | A ~1.2 m wide washed-out gap across a side track, with a longer detour around it. | Planks |
| **Fallen Tree** | A dynamic log lying across a track. It can be winched aside or driven around slowly. | Winching objects |
| **The Staircase** | A steep granite climb up the ridge: rock steps and a tight switchback. Climbable in low range with a good line, not in high range. | Low range, line choice, rollover risk |
| **Dingo Gap Lookout** (viewpoint) | Top of the ridge, a sign and a wide view back over the valley. | Reward of a view |
| **Mountain Hut** (campsite 2) | Weathered timber hut on the high plain among snow gums. | — |
| **Fire Tower** (landmark) | Lookout tower on a high knoll; reached by a steep, loose gravel track. | Loose surface climbing |
| **Old Ute** (landmark) | Rusted abandoned vehicle in a clearing off a faint track. | Finding faint tracks |
| **Falls** (landmark) | Small waterfall where the creek drops off the plateau; reached on foot-speed rocky ground. | Rock crawling |
| **Old Mine** (landmark) | Timber-framed shaft entrance and spoil heap on a hillside. | Side slopes |
| **Granite Tors** (viewpoint) | A pile of huge boulders on open ground with a view west. | Open terrain |

Each POI has a discovery radius (default 25 m). Campsites also define a reset position and heading.

---

## 6. Vehicle

### 6.1 Tuning starting points (`data/vehicle.ts`)

| Property | Value |
|---|---|
| Mass | 1,600 kg, centre of mass fairly high (rollovers must be possible) |
| Wheelbase / track width | ~2.3 m / ~1.45 m |
| Suspension travel | ~0.25 m per wheel, soft springs, visible articulation |
| Drive | Always 4WD, open differentials (no locks) |
| High range | Top speed ~100 km/h on flat track |
| Low range | Top speed ~25 km/h, ~2.5× wheel torque compared to high |
| Gears | Automatic within the selected range; no clutch |
| Brakes | Foot brake (S / LT), handbrake locks rear wheels |
| Air intake height | 0.9 m above ground (used for flooding) |

Keyboard steering is smoothed (ramps in and out) so it feels close to an analogue stick. Steering angle narrows a little as speed rises.

### 6.2 Feel targets (tune until these hold)

- Climbs a ~30° dirt slope in low range; struggles above ~20° in high range.
- Rolls if you corner hard above ~40 km/h on a side slope, or drive across a slope steeper than ~35°.
- Slides on mud and loose gravel; grips well on dry rock at low speed.
- Body visibly leans in corners, dips under braking, and wheels drop into holes.
- Landing from small jumps is bouncy but recoverable; big drops can roll the car.

### 6.3 Surfaces (`data/surfaces.ts`)

Each terrain cell has a surface type, sampled under each wheel.

| Surface | Grip | Rolling resistance | Notes |
|---|---|---|---|
| Dirt track | 1.00 | 0.02 | Dust particles when dry |
| Dry grass | 0.85 | 0.04 | |
| Gravel / scree | 0.75 | 0.03 | Loose; wheels spin on steep climbs |
| Rock | 1.10 | 0.015 | |
| Mud | 0.45 | 0.25 | Wheels sink up to 0.15 m; mud spray |
| Water (on creek bed) | 0.60 | +drag | Drag scales with depth and speed; splash |

Include a `wetness` input (0 for now) that lowers grip, so rain can be added later.

### 6.4 Light damage

- **Engine flooding:** if the air intake is below the water surface, a flood timer counts up (and slowly counts down when it's back above water). A warning icon shows and the engine sputters at ~5 s. At 10 s the engine stalls. It can't restart until the intake has been above water for 20 s, then the player presses the throttle to restart. The winch still works with the engine off.
- **Dirt:** a per-zone dirt level (front, sides, rear, wheels) increases while driving on dirt and mud and is partly washed off by water. Shown by blending the body colour toward `dirtTrack`/`mud`.
- **Dents:** hard impacts above a speed threshold push nearby body vertices inward a small amount (capped), so the car looks worn after rough drives. Purely visual.
- All of this lives in a `VehicleCondition` object (see §11) so mechanical damage can be added later without restructuring.

---

## 7. Recovery tools

### 7.1 Winch
- Front-mounted, 30 m cable.
- **Anchors:** tree trunks and marked boulders (sim-side list of anchor points). Later: other vehicles.
- **Quick attach** (E / RB): attaches to the best anchor within range, preferring ones in front of the vehicle. Press again to detach.
- **Manual target:** in the tool menu, choose "Winch", then cycle through highlighted anchors in range and confirm.
- **Winch in / out** (R / F, D-pad up/down): changes cable length at ~1 m/s. When taut, the cable pulls with a spring-damper force capped at ~1.5× vehicle weight, so it can drag the car up a slope or out of mud, but not through a solid obstacle.
- Cable is drawn as a thin tube from the bumper to the anchor, sagging when slack and straight when taut. A strap wraps the tree.
- Can also hook dynamic objects (the Fallen Tree) and drag them.

### 7.2 Planks
- The vehicle carries 2 planks (each ~2.4 m × 0.3 m).
- **Place:** in the tool menu, choose "Planks". A see-through preview shows both planks lined up in front of the front wheels. The player can adjust distance and angle, then confirm.
- Placed planks are heavy dynamic bodies with high friction. They can shift or slip if the car hits them off-line.
- Used to bridge gaps up to ~1.5 m or for grip on mud.
- **Pick up:** drive or stop within 4 m and press the interact key. They go back on the roof rack. If left behind more than 150 m away, they can be recalled from the tool menu.

### 7.3 Jack (righting the vehicle)
- When the car has been tilted more than 60° and nearly still for 2 s, show a prompt: "Hold J to right the vehicle".
- Holding for 1.5 s plays a short animation that rolls the car back onto its wheels next to where it was.

### 7.4 Return to last campsite
- Pause menu option. A short fade to black, then the vehicle is placed at the last campsite visited, with flooding cleared. Planks come back with it.

---

## 8. Camera

- Chase camera behind and above the vehicle, smoothly following position and heading.
- Raises and pulls back slightly on steep slopes and at speed; moves closer when crawling slowly.
- Never clips into terrain or rocks (push forward along the view line when blocked).
- Follows the vehicle's heading with lag, not its roll, so the horizon stays steady when the car tilts.
- Scroll wheel / right stick up-down adjusts follow distance within limits.

---

## 9. UI and HUD

Keep the screen mostly clear. Use a warm, hand-drawn look: off-white paper tones, dark brown ink, a simple serif or rounded font loaded from Google Fonts.

- **Compass strip** (top centre): N/E/S/W and degree ticks; discovered POIs within 400 m appear as small icons on the strip.
- **Status cluster** (bottom left, small): range indicator (H / L), planks carried (e.g. 2/2), engine warning icon when flooding.
- **Context prompts** (bottom centre): e.g. "E — Attach winch", "Hold J — Right vehicle", "E — Pick up planks".
- **Discovery toast:** when entering a POI radius for the first time: "Discovered: Dingo Gap Lookout" with a small paper card animation.
- **Tool menu** (hold Q / LB): radial menu with Winch (manual target), Planks (place / recall), Detach winch.
- **Paper map** (M / View button): full-screen fold-out map drawn on a canvas from the real heightfield: contour lines, shaded relief, tracks, creek, map border with a hand-drawn feel. Discovered POIs and campsites show icons and names. Undiscovered POIs are not shown. A player arrow shows position and heading. The game pauses while the map is open.
- **Pause menu** (Esc / Start): Resume, Map, Return to last campsite, Settings, Controls.
- **Settings:** graphics quality (Low / Medium / High: shadow quality, draw distance, vegetation density, pixel ratio), master / engine / ambience volume, units (km/h or mph, for future use).
- **Loading screen:** title, simple progress bar, short controls reminder.

---

## 10. Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | W / ↑ | RT |
| Brake / reverse | S / ↓ | LT |
| Steer | A D / ← → | Left stick |
| Handbrake | Space | X / Square |
| Toggle high/low range | L | Y / Triangle |
| Winch quick attach / detach | E | RB |
| Winch in / out | R / F | D-pad up / down |
| Tool menu | Hold Q | Hold LB |
| Interact (pick up planks) | E (when prompted) | A / Cross |
| Right vehicle | Hold J | Hold B / Circle |
| Camera distance | Scroll | Right stick up/down |
| Horn | H | Left stick click |
| Map | M | View / Select |
| Pause | Esc | Start / Options |

Show the active device's glyphs in prompts (switch when the player touches the other device).

### Debug mode (`?debug` in the URL)
- FPS and frame-time graph, draw calls, triangle count.
- Physics collider wireframes, wheel contact points, surface type under each wheel.
- Teleport list for every POI.
- Free-fly camera toggle.
- Live sliders for the main vehicle tuning values.

---

## 11. Built for later (don't build these now, but don't block them)

| Future feature | What to do now |
|---|---|
| **Co-op (up to 4)** | Keep `sim/` separate from rendering. Vehicles are entities with IDs driven by `VehicleInput` commands. Sim state must be serialisable. Winch anchors already accept "vehicle" as a target type. |
| **Full damage** | `VehicleCondition` holds health for engine, 4 tyres, 4 suspension corners and body panels. The drivetrain and suspension read multipliers from it (all 1.0 now). |
| **Day/night, weather** | All light, sky and fog values come from the `Environment` config. Surfaces take a `wetness` input. Creek water level is a single parameter. |
| **More vehicles and maps** | Vehicle tuning and model are data-driven. Map features come from `data/map.ts`; a second map is a second data file. |
| **Upgrades, photo mode, wildlife, portable winch anchor, mobile** | Out of scope. No hooks needed. |

---

## 12. Out of scope for v0.1

Co-op and networking · currency, upgrades, unlocks · trail challenges, timers, scores · day/night cycle, weather · mechanical damage, repair kits · photo mode · wildlife · multiple vehicles or maps · mobile and touch controls · camera modes other than the chase camera · recorded audio files.

---

## 13. Audio (Web Audio API, generated in code)

- **Engine:** oscillators plus filtered noise. Pitch follows engine RPM, which follows the auto gear and range. Louder and grittier under load. Sputter when flooding, stall and restart sounds.
- **Tyres:** filtered noise layers that cross-fade by surface (dirt crunch, gravel rattle, mud squelch, water splash) and scale with wheel speed and slip.
- **Suspension:** short thumps on hard compressions.
- **Winch:** electric motor whine whose pitch follows load, plus cable creak when taut.
- **Ambience:** wind that rises with altitude, creek water near the creek, and synthesized bird calls (a kookaburra-style laugh, magpie-style warble) at random intervals.
- **UI:** soft paper rustle when opening the map, a gentle chime on discovery.
- Audio starts after the first click or key press (browser autoplay rules). Volumes come from settings.

---

## 14. Saving

`localStorage`, every read and write wrapped in try/catch. The game must work normally if storage is unavailable.

Saved: discovered POIs, last campsite, settings. Vehicle position is not saved; loading puts you at the last campsite.

---

## 15. Milestones

Work in this order. Each milestone ends with its checks passing, a commit, and Playwright screenshots saved to `docs/screenshots/<milestone>/`.

**M1 — Project and world look**
Vite + TS project, game loop, terrain from base noise + `map.ts` features, flat-shaded vertex-coloured mesh, sky, fog, sun and shadows, debug free camera.
*Check:* page loads without console errors; screenshot shows the valley with readable slopes in the palette colours.

**M2 — Driving**
Rapier world, terrain heightfield collider, vehicle with suspension, drivetrain, high/low range, surfaces, keyboard and gamepad input, chase camera, simple placeholder vehicle model.
*Check:* headless test: full throttle on flat dirt for 5 s moves the car > 30 m; low range climbs a 30° test ramp, high range fails a 30° ramp; a hard turn at 50 km/h on a 20° side slope rolls the car.

**M3 — World content**
Tracks, creek with water volumes and drag, mud, washout gully, fallen tree, Staircase, all POIs and props, instanced vegetation with trunk colliders, chunked terrain detail levels, final vehicle model.
*Check:* each POI exists and is reachable by driving (teleport near, then drive in); screenshots of each POI.

**M4 — Tools and light damage**
Winch (quick and manual), planks with preview, jack, return to campsite, engine flooding, dirt and dents.
*Check:* headless tests: intake underwater for 11 s stalls the engine; winching in reduces distance to the anchor; the car crosses the washout gully on planks and fails without them.

**M5 — Exploration UI and saving**
Compass, status cluster, prompts, discovery toasts, tool menu, paper map, pause and settings menus, campsites, saving.
*Check:* driving into a POI radius shows the toast and adds it to the map; reloading keeps discoveries; storage blocked → game still runs.

**M6 — Audio**
All sounds in §13.
*Check:* no audio errors in the console; audio context starts on first input; volume settings work.

**M7 — Polish and performance**
Particles, quality presets, culling and detail levels tuned, camera polish, final tuning against §6.2.
*Check:* Medium preset holds 60 fps in the debug overlay on the target hardware class; frame time stays steady while driving across the whole map; no console errors during a 5-minute scripted drive.

---

## 16. Definition of done (v0.1)

- Loads from a static build in a current desktop Chrome, Firefox or Edge.
- You can drive from River Flat Camp to every POI using only the vehicle and its tools.
- The Deep Crossing can flood the engine; the Staircase needs low range; the Washout Gully needs planks or the detour; the Bog Hole can trap the car and the winch can free it.
- The paper map, compass and discoveries work and survive a reload.
- Meets the 60 fps target at Medium.
- `npm run lint`, `npm test` and `npm run test:e2e` all pass.
