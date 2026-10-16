# Decisions

Places where SPEC.md was unclear or didn't work as written, and what was chosen instead.
Each entry: what the spec says, what was done, and why.

## Build and tooling

- **Vitest 3.2 instead of the newest major.** npm 10's resolver crashed (`Cannot read properties of null (reading 'edgesOut')`) on the optional peer chain of Vitest 4/5. Vitest 3.2.7 installs cleanly and does everything the spec needs.
- **TypeScript 5.9.** TypeScript 6+/7 is outside the range `typescript-eslint` supports, so lint would break.
- **Playwright 1.56.1.** This is the version whose Chromium build (1194) is preinstalled at `/opt/pw-browsers`, so nothing is downloaded.
- **Vite `base: './'`.** Relative asset paths work under the GitHub Pages project URL (`/4wd-simulator/`) and on any other static host or sub-folder, which §2 also asks for.
- **Shadows: `PCFShadowMap` with `shadow.radius`.** §4 asks for "PCF soft". In three r186 `PCFSoftShadowMap` was removed (it logs a warning and falls back); plain PCF now does soft filtering with a sampling radius, so that is used.
- **Sky is not tone-mapped.** The sky dome shows the Environment colours exactly as authored (§4 horizon/zenith hex values). Lit surfaces go through ACES Filmic with exposure 0.62 (three's ACES multiplies by 1/0.6 internally, so 1.0 washed the palette out).

## World

- **Map is 1536 m × 1536 m** (spec: ~1.5 km) so it divides into 64 m chunks and a 1 m heightfield (1537 × 1537 samples). The playable area is ±716 m; border mountains and an invisible wall close it off.
- **Coordinates:** x = east, z = south (north is −z), y = up, origin at the map centre. Headings are compass degrees (0 = north, 90 = east).
- **Escarpments, hills and ridges as authoring primitives.** `data/map.ts` describes the land with a few shapes (a north escarpment up to the high plain, a low east bench the creek drops off at the Falls, hills, a ridge crest) plus the creek and track splines. Base noise adds rolling relief; detail noise adds 1 m bumps.
- **The Falls are a ~11 m drop off a low bench in the east**, not off the high plain. A 60 m waterfall off the plain wouldn't be "small", and the creek has to run east–west through the middle of the map.
- **Creek water level** is a per-point water surface along the creek spline plus one global `Environment.waterLevelOffset` (§11's "single parameter").
- **All named features are discoverable POIs**, not only the landmarks: Gravel Ford, Deep Crossing, Bog Hole, Washout Gully, Fallen Tree and The Staircase get discovery radii and appear on the map once found, alongside the campsites, viewpoints and landmarks. The Main track and The Creek are linear features, so they are drawn on the map but not "discovered".
- **Terrain rendering** is a fixed-depth quadtree (256 m blocks at 8 m resolution far away down to 64 m chunks at 1 m near the camera) instead of uniform 64 m chunks. Uniform chunks meant 300+ draw calls; the quadtree keeps it under ~100. LOD 0 uses exactly the physics triangles. Skirts hide cracks between levels.
- **Distance haze** uses a custom fog patch: warm `#E8CFA6` close in, shifting to `#9FB4C4` on far ridges, capped below 100% so far ridges stay visible as blue silhouettes. A ring of low-poly backdrop ridges sits outside the map so the horizon is never empty.
- **Terrain does not cast shadows.** With the sun at 25° the terrain's long self-shadows were cut off in a hard line at the edge of the shadow area that follows the car. Flat-shaded faces already show the relief; trees, rocks, props and the vehicle still cast shadows.

## Vehicle physics (M2)

Rapier's `DynamicRayCastVehicleController` is the base, as §2 asks. A few of its built-in behaviours didn't fit the §6.2 feel targets, so the vehicle wraps it:

- **Rapier's terrain triangulation.** Rapier splits each heightfield cell along the (x+1, z)–(x, z+1) diagonal and stores heights x-major. `Terrain.heightAt`, the render mesh (LOD 0) and the collider all use that split; a test checks they agree to within 1 cm.
- **Suspension rest length = full droop.** The controller's ray only reaches `restLength + radius`, so wheels could never drop below the rest length. The rest length is set to the fully extended length; the car sits 0.12 m below that on its springs, leaving 0.13 m of bump travel (0.25 m total, §6.1). Wheels drop into holes.
- **Bump-stop spheres** sit where each wheel is at full compression, so the car can't drive "through" walls, ledges or logs with its ray-only wheels.
- **Missing roll torque added back.** The controller applies tyre side forces near the centre-of-mass height (a fixed 10% "roll influence" that isn't exposed in the JS API), so the car could never roll. The vehicle adds the missing torque each step (`rollTorqueScale` in `data/vehicle.ts`, 1.0 = physical).
- **Traction and open diffs are computed by the vehicle, not the controller.** Each wheel's drive force is capped at grip × load. Each axle behaves like an open diff — it can only push as hard as its weaker wheel allows, plus a 35% "leak" (`openDiffLeak`). With a textbook open diff (0%), a single lifted wheel stops the car dead, which felt punishing on the Staircase; 35% keeps line choice important without making it a coin toss.
- **Anti-roll bars** shift spring preload between left and right wheels of an axle (only while both touch the ground), so they move load through the tyres like a real bar instead of adding a torque from nowhere.
- **Gears.** A 3-speed automatic with a 2.5:1 low range (§6.1: ~2.5× wheel torque). Engine torque × gearing gives about 5.8 kN at the wheels in high range, which is why high range struggles past ~20° and low range climbs 30°. Top speeds (100 / 25 km/h) are enforced by a soft governor per range, because gearing alone would let the car reach ~160 km/h in high and ~60 km/h in low.
- **Driving model.** S brakes when moving forwards and selects reverse once stopped (like most driving games); W does the same in reverse. A hold brake keeps the car still when stopped with no input, except while winching. Range changes are allowed below 20 km/h.
- **Measured against §6.2** (headless tests in `tests/vehicle.test.ts`): 5 s full throttle on flat dirt ≈ 40 m; low range climbs a 30° ramp from a standstill, high range slides back; high range still creeps up 18°; a hard turn at 50 km/h on a 20° side slope rolls the car; the same turn on flat ground at 40 km/h slides but stays upright; it drives across a 31° slope and rolls across 38°. The roll on a 20° slope happens when turning _down_ the slope (gravity keeps the speed up); turning hard _up_ a 20° slope at 50 km/h lifts the inside wheels but the car slows enough to survive.
- **Debug free camera** toggles with C (debug mode only) or the button in the debug panel.

## World content (M3)

- **Static scatter collides as a few triangle meshes.** Rapier's step time grows with the number of separate colliders (~1 ms per step for 8,000 tree trunks). Trunks, rocks, logs and props are merged into one trimesh per 256 m cell and surface type, which brings the step back to ~0.1 ms. The Staircase ledges and washout walls stay as exact boxes.
- **Every tree inside the playable area has a trunk collider and can be a winch anchor.** The graphics "vegetation density" setting only thins out grass tussocks and shrubs (which don't collide), so invisible trees never block the car on Low.
- **Trees:** four eucalypt types — tall mountain ash in the valley, mid-size candlebark on the slopes, short twisted snow gums on the high plain, and a few dead stags — each with two shapes and a far-away low-detail version. They're drawn with `BatchedMesh`, which culls per tree and switches detail per tree.
- **Marked anchor boulders** carry a pale paint ring and a steel ring bolt so they read as anchors. About a third of the larger scattered boulders are marked, plus hand-placed ones by the Bog Hole and on the Staircase.
- **Washout Gully:** a 3 m trench in the heightfield plus vertical earth walls (static boxes) that leave exactly a 1.2 m gap where the track crosses; the 1 m heightfield can't represent a 1.2 m gap on its own. The gully runs 112 m across the slope so the detour around its top end is the only way past without planks.
- **The Staircase** is a 25–30° rocky climb with granite ledges (0.3 m risers every 5.5 m) as static boxes across the track, and a switchback with some camber.
- **The Fallen Tree** is a 750 kg dynamic log with branch stubs (so it doesn't roll like a pipe), lying across the main track in a small clearing so it can also be driven around slowly.
- **Track ruts** are thin ribbons drawn on top of the terrain; faint tracks are only these two wheel lines over the grass.
- **"Reachable by driving"** is checked headlessly: for each POI the car starts 50 m back along its approach track and an autopilot drives it into the discovery radius (`tests/poi.test.ts`). The M3 screenshots park the car on that approach.
- **Props face their heading** (the front of a hut, the mine entrance, a sign face). Sign lettering is drawn into small canvas textures with the UI font.

## Tools and light damage (M4)

- **Winch** is a spring-damper cable from the front bumper to the anchor (60 kN/m, capped at 1.5× vehicle weight). The motor can't reel in against a full-load pull (it stalls) but can always pay out. The hold brake releases while the winch is attached and pulling, so the car rolls with it. Quick attach scores anchors by distance with a penalty for ones behind the car. Anchors: every tree trunk (strap at ~1 m), marked boulders (ring bolt), the Fallen Tree (hooked at the point on the trunk nearest the winch) and — for future co-op — other vehicles' rear tow point.
- **Wheels push back on what they stand on.** Rapier's ray-cast wheels don't apply forces to dynamic ground, so a plank never "felt" the car and got shoved aside. The vehicle now applies each wheel's load and tyre forces to dynamic bodies under it (planks, the Fallen Tree).
- **Planks** are 45 kg dynamic boards with high friction. The collider is 0.42 m wide (drawn 0.3 m) so a ray-cast wheel — which is a single line, not a tyre — doesn't drop off the edge when it's a few centimetres off. The preview rests each plank on whatever is under its ends (ray cast against terrain, rocks and the gully walls). While placing planks or picking an anchor the car sits on its handbrake and the camera rises to look at the ground ahead.
- **Approach and departure angles.** The body collider is split into a low section between the axles (0.28 m clearance) and raised front and rear overhangs (~37° approach, ~33° departure), like a short-wheelbase 4WD. One full-length box gave only ~21° and the bumper caught on plank ends and ledges. Bumpers and the winch were raised on the model to match.
- **Washout Gully walls follow the ground.** Each wall's top is tilted to match the slope across the gully, so there's no artificial step at the gap and planks lie nearly flat.
- **Engine braking** was doubled: in low range it now holds the car on moderate descents, which is what low range is for (and stops the car creeping into planks while you place them).
- **Jack:** after 2 s tipped past 60° and nearly still, holding J for 1.5 s switches the body to kinematic for a 1.2 s animation (lift, rotate upright keeping the heading, set down ~1 m towards where the roof pointed), then back to dynamic.
- **Engine flooding** follows §6.4 exactly; the sputter (random power cuts from 5 s) uses a per-vehicle seeded random generator so the simulation stays deterministic.
- **Dirt** builds per zone (front, sides, rear, wheels) from the surface's dirt rate times speed — or wheelspin, so a car bogged in mud gets muddy — and water washes it down to 25% of its level (wheels fully). **Dents** come from a sudden velocity change above 3.5 m/s; the hit side is found from the direction of that change, and nearby body vertices are pushed in (max 11 cm, 28 dents kept).
- **Bogged wheelspin:** with the throttle in and the car barely moving on loose ground, the wheels show spin (visual, dirt and sound only) even though the physics model treats mud as extra rolling resistance rather than lost traction.
- **Headless M4 checks** (`tests/tools.test.ts`): 11 s with the intake under water stalls the engine (and it restarts only after 20 s clear); winching in closes the distance to the anchor; the Bog Hole holds the car in high range and the winch pulls it out; the Washout Gully stops the car without planks and it crosses on planks (driven along the planks at a crawl, as a player would steer).

## Exploration UI and saving (M5)

- **Every named feature is a discoverable POI** (14 in total, including both campsites). The campsite you spawn at is discovered straight away, because the car starts inside it.
- **Saving** writes one `localStorage` key holding discovered POIs, the last campsite visited and the settings. It saves when something is discovered, when a campsite is reached and when settings change. If storage is blocked or full the game keeps running with default settings and prints one console warning; nothing is shown on screen.
- **Pausing:** the paper map and the pause menu stop the simulation. The tool menu (hold Q) doesn't pause, but it parks the car (no throttle, steering or brake input) while open, so you can choose a tool without the car wandering off.
- **Context prompts** only show what can be done right now: "Attach winch" appears below about 5 km/h with an anchor in reach, "Pick up planks" next to placed planks, "Hold J — Right vehicle" once the jack is available, and an engine warning while the intake is under water.
- **The compass strip** shows only discovered POIs within 400 m, so undiscovered places stay a surprise.
- **The paper map** is drawn once in the background after loading (relief shading, contour lines, creeks, tracks and forest), split into small chunks so it never freezes the game. Only discovered POIs are labelled. If it's opened before that finishes, it shows blank paper and fills in when ready.
- **Menus count every key press.** On a slow frame several presses can arrive together; menus apply each one instead of dropping all but the first.
- **Return to last campsite** fades to black, places the car at the campsite's parking spot facing its exit, and clears flooding (not dirt or dents).

## Audio (M6)

- **Everything is synthesised at start-up.** A few seconds of noise (white, deep "brown" noise, sparse grains for dirt, dense clicks for gravel, slow wet swells for mud) are generated once from a fixed seed and looped. No audio files.
- **The audio context is created on the first click, tap or key press** (not Escape, which browsers don't count as a gesture). Before that the game is silent and nothing is logged. If the browser has no Web Audio the game runs silently with one console warning. Audio pauses while the tab is hidden.
- **Engine:** a harmonic-rich tone at the firing frequency (rpm ÷ 60 × 2 for a four-cylinder), a rumble at half that, and combustion noise pulsed at the firing rate. Load mixes in distortion and noise and opens the filter, so it gets louder and grittier when working. When flooding cuts the power the sound drops out with it (the vehicle now exposes the power multiplier it applied). Stalling lets the pitch fall with the rpm, then a clunk; a restart plays a starter-motor crank before the engine catches.
- **Horn:** two-tone (H / L3). It's on the controls list, so it needed a sound.
- **Tyres:** one noise layer per surface (dirt, gravel, grass, rock, mud, water, wood planks) plus a "scrub" layer for sideways sliding. Each wheel on the ground adds a quarter of its surface's layer, scaled by speed and wheelspin, so crossing from dirt to gravel cross-fades. Deep water at a wheel switches it to the water layer, and dropping into water at speed splashes.
- **Suspension thumps** come from a new `wheelImpact` sim event: a wheel's suspension compressing faster than 1.2 m/s (`wheelImpactSpeed` in `data/vehicle.ts`). Doing this in the simulation keeps it independent of the frame rate. Cruising on flat ground makes none; rough tracks give roughly one a second. Dents also play a body crunch.
- **Winch:** motor whine whose pitch drops from 560 Hz towards 290 Hz as the pull nears the winch's limit (paying out is lighter), plus random cable creaks that come more often the harder it pulls.
- **Ambience:** wind rises from the valley floor (25 m) to the high plain (130 m) with slow random gusts and a faint whistle up high; creek water within 45 m of the water's edge (read from the precomputed creek-distance grid); a deeper roar within 140 m of The Falls; and bird calls every 9–32 s — a kookaburra-style laugh (low chuckles, a run of alternating "ha-ha" notes, a falling tail) or a magpie-style warble (sliding fluty notes with a fast flutter). Birds are quieter up high. The debug panel has buttons to play each call.
- **UI:** a paper rustle when the map opens (softer when it closes) and a rising four-note chime on discovery.
- **Volumes:** master, engine and ambience sliders map to gain as slider², which sounds more even across the range. Tyres, winch, thumps and horn sit under master only. While paused, vehicle sounds fade out and ambience drops to 60%. A gentle compressor on the master keeps peaks below clipping.
- **Checks** (`e2e/m6-audio.spec.ts`): the context is off until the first key press, then running; engine pitch rises when driving; tyre layers follow the surface; creek water is heard near the creek; master at 0 silences everything; engine at 0 mutes only the engine; a bird call peaks below 1.0; the winch whine plays when reeling in; no audio warnings or console errors; and with Web Audio removed the game still runs.
