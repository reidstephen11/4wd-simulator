# Playtest report — v0.16

Played `main` at v0.16 (commit e25b689) on 20 Oct 2026 in headless Chromium (software rendering) at desktop (1280×720, 1024×600), phone portrait (390×844, 375×667) and phone landscape (844×390) sizes, plus headless physics runs on the real High Country world. All three maps, all three vehicles, night, dusk, rain and after-rain were loaded. No console errors or page errors came up in any run.

Items are ordered by priority. Each has what was seen, how to reproduce it, where the cause is, and a suggested fix. Follow `CLAUDE.md` for shipping (version bump, DECISIONS.md, README, lint/test/build/e2e, PR to `main`).

## Bugs

### 1. The km/h / mph setting does nothing

- **Seen:** Pause → Settings → Units → mph saves the choice, but every speed still reads km/h.
- **Cause:** `settings.units` is only read in `src/ui/menus.ts` (the buttons) and `src/sim/save/save.ts` (saving). `src/ui/crawlGauges.ts:114-115` always prints `km/h`, and the dash speedometer (`src/render/vehicleInstruments.ts:178`) is scaled for km/h only.
- **Fix:** Pass the units setting to the crawl gauges (and to any speed readout added for item 4) and convert with ×0.621. Decide whether the dash dial face changes or stays km/h (a period Australian 40 Series dial is km/h; saying so in README is fine). Add a unit test.

### 2. Phone portrait: the full-screen button sits on top of "View: Follow"

- **Seen:** At 390×844 with touch controls, the ⛶ button overlaps the left half of the "View: Follow" button in the top row (screenshot: top-right corner, the two buttons drawn over each other). Tapping there is ambiguous.
- **Cause:** The touch top-left row (II, MAP, LIGHTS, ⛶ — `src/ui/touchControls.ts:55-58`) and the camera panel in the top right don't fit side by side at portrait width; see the touch layout rules in `src/ui/styles.css`.
- **Fix:** In portrait, wrap the camera buttons below the compass, or move ⛶ into the pause menu, or shrink the labels ("View" instead of "View: Follow"). Add an e2e check that no two visible touch buttons' bounding boxes intersect at 390×844 and 375×667.

### 3. Phone welcome screen opens scrolled to the bottom

- **Seen:** At 375×667 the welcome screen opens with the title and the World choices scrolled off the top; the first thing visible is the Vehicle list and the Drive button. A first-time player may not realise there are three worlds.
- **Cause:** `src/ui/welcome.ts:76` calls `this.rows[this.row][0].focus()` on the Drive button, and focusing scrolls it into view.
- **Fix:** `focus({ preventScroll: true })` (and do the same anywhere else the welcome or pause menu focuses on open).

### 4. Tree strikes throw the car backwards

- **Seen (headless, High Country):** From `poseAt(-160, 246, 180)` (River Flat Camp heading south) at full throttle, the car reaches 64 km/h and hits a candlebark trunk at about (-161, 351.6). Speed goes 64 → 0 in one 0.25 s sample, then the car moves **backwards at 18–24 km/h** for a second, slides back down the 16° bank and rolls onto its side (tilt 111°) while nearly stopped. A real 4WD hitting a 25 cm trunk at 64 km/h would wrap the bumper and stop; it would not rebound at a third of its speed.
- **Where:** Vehicle colliders set restitution 0.05 / 0 (`src/sim/vehicle/vehicle.ts:183,198`); the rebound is most likely Rapier's penetration correction pushing the chassis out of the trunk collider after a deep one-step overlap, or the tree colliders' own restitution/combine rule.
- **Fix:** Check the tree collider restitution and combine rule (use `CoefficientCombineRule.Min` so the car's 0.05 wins), consider CCD on the chassis, and cap the rebound speed after a hard frontal hit. Add a headless test: drive into a known tree at 30 and 60 km/h and assert the reverse speed afterwards stays under ~3 km/h. The repro script used is reproduced below.

```ts
// npx vite-node <file>.ts  — prints speed, tilt and wheel contacts every 0.25 s
const sim = new Simulation(R, testWorld(), lateAfternoon);
const v = sim.addVehicle('p', sim.poseAt(-160, 246, 180));
sim.startEngine('p');
// settle 1.5 s, then throttle: 1 for 13 s, logging v.speed * 3.6 and v.tiltDeg()
```

### 5. Tool menu spills over the HUD on short screens

- **Seen:** At 844×390 (phone landscape) the radial tool menu is taller than the screen: "Winch" sits on top of the compass and "Nothing to repair" sits on top of the range/planks status panel.
- **Where:** `src/ui/toolMenu.ts` and its CSS in `src/ui/styles.css` — the ring radius doesn't scale with viewport height.
- **Fix:** Size the ring from `min(width, height)` and hide or dim the compass and status strip while the menu is open.

## Poorly designed elements

### 6. No speed readout while driving normally

In the follow view, in high range, the HUD shows no speed at all; the only readouts are in the crawl gauges (low range or precision crawl) and on the dash in the driver's seat. The README quotes stopping distances "from 60 km/h" that a player has no way to see. Add a small speed (and gear) readout to the status strip, honouring the units setting (item 1). Keep it hidden in the driver's seat where the dash already shows it.

### 7. The Controls screen on a phone lists only keyboard and gamepad

On a touch device, Pause → Controls shows the keyboard and gamepad columns only; the touch controls listed in the README ("Phones and tablets") are missing. On a phone, show a Touch column (or a touch-only table) instead of Keyboard. The Back button is also below the fold at 844×390 — pin it to the bottom of the card.

### 8. The paper map is too small to read on phones and can't be zoomed

At 844×390 the map is about 340 px square; place names ("River Flat Camp") are a few pixels high and unreadable. There is no zoom or pan (`src/ui/paperMap.ts` has no wheel or pinch handling). Add pinch and scroll-wheel zoom with drag to pan, centred on the car when opened. The hint under the map also says "M · Esc · tap outside to close" on every device and is cut off at the bottom of the screen at 390 px tall; show only the hint for the device in use, inside the sheet.

### 9. Pause menu needs scrolling at 600 px tall

At 1024×600 (common on small laptops once the browser bars take their share) the pause card scrolls and "Main menu" is cut in half. At 844×390 it is 615 px of content in a 347 px card. Tighten the button padding at short heights, or lay the buttons out in two columns when the viewport is wide but short.

### 10. The High Country start faces into the creek

The car arrives at River Flat Camp at (-150, 238) heading 315° (north-west), pointed across the grass at the creek, with the camp track off to the left. Holding W from the start drives off-track and into the water within about 5 s. Face the car along the track that leads out of camp (towards the Camp Rock Course sign is the natural first destination).

### 11. A shrub pokes through the bonnet at the High Country start

In the driver's seat at the start position, a large shrub is drawn over the left side of the bonnet. Shrubs have no collider, so it's only visual, but it is the first thing a player sees in that view. Keep shrubs a few metres clear of campsite spawn poses (the same rule already used to keep trees off tracks, `src/sim/world/mapTypes.ts:307`).

### 12. Crawler Creek gates don't count anything

The README says so ("The gates don't score anything yet"), but the gates are the whole point of that map: there is no feedback for passing a gate in order, missing one or hitting a flag. A minimal version: a "Gate 14 / 52" counter under the compass, a soft chime per gate, and a "missed gate 13" toast. The scored-run code in `src/sim/crawlRuns.ts` is the natural place to hang it.

## Minor

- **Dust looks like floating hexagons.** Wheel dust in follow view (dry dirt, ~50 km/h) renders as large, flat, pale hexagon sprites behind the rear wheels. Softer, smaller particles that fade faster would read as dust. See `src/render/particles.ts` and `src/data/particles.ts`.
- **Headlight pool has hard straight edges** at night in follow view: the lit patch is a crisp trapezoid. A softer falloff at the edge of the cone would look more natural (`src/render/headlights.ts`).
- **Quick repeated key presses can be lost.** View cycling (C) and similar single-press actions use `pressed()` (once per frame) rather than `pressCount()` like the pause menu does (`src/core/game.ts:695-711`). At normal frame rates this rarely matters, but on a slow machine several quick C presses advance only one view.
- **`scripts/drive-lab.ts` drives off its own test ground.** The "flat 30s" line reports 212.9 km/h because after about 25 s the car has left the 800 m slab (`tests/helpers/scenes.ts`, `cuboid(400, 1, 400)`) and is falling. Real top speeds on flat dirt are about 94 km/h (short-wheelbase 4WD, 3rd gear, 3,870 rpm) and about 80 km/h (Perentie, 4th) — both plausible. Make the slab bigger or stop the run at the edge so the number isn't misleading.

## Checked and working

- Welcome screen choices (world, vehicle, time, weather) are applied and kept; progress, last campsite and settings survive a reload.
- Discovering places by driving in, the compass markers, and "Return to last campsite" target.
- Esc from Settings returns to the pause menu, and Esc again resumes; M and Esc close the map.
- Low range, precision crawl, crawl gauges and the driver's-seat dash (lit at night).
- Night (headlights on low beam on arrival), dusk, rain (streaks, hint panel readable) and after-rain on all three maps; the Camel Trophy roof lamps.
- Headless: the whole Granite Spur loop (`obstacle-lab loop`) completes with every leg "done".
