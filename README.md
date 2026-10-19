# 4WD Simulator

A relaxed, single-player off-road exploration and rock-crawling game that runs in the browser. Drive a detailed, 1970s Land Cruiser 40 Series-inspired short-wheelbase 4WD (plain, or in Camel Trophy yellow), or the Army green Land Rover 110 Perentie from the _Bush Tucker Man_ TV series, through a patch of Australian high country, round a purpose-built 4WD park or along an RC crawler-style gate trail, using low range, lockers, a winch, planks and careful line choice to get over rough ground. No races — just the drive, what's over the next hill, and optional scored runs on the rock trails if you want them.

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

The game opens on a **welcome screen**: choose the world, the vehicle, the time of day and the weather, then press **Drive** (or Enter; arrow keys or the d-pad move between choices). It starts on whatever you chose last time. Sound starts with that Drive press (browsers only allow sound after a click or key press). **Pause menu → Main menu** comes back to it.

## Time of day and weather

| Choice         | What it does                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Morning        | Low, cool-gold sun from the east-north-east                                                                                                                                                              |
| Midday         | High sun from the north, short shadows                                                                                                                                                                   |
| Late afternoon | Warm low sun from the west-north-west (the original lighting)                                                                                                                                            |
| Dusk           | Sun on the horizon, pink and orange sky, long shadows; the headlights come on as you arrive                                                                                                              |
| Night          | Faint blue moonlight from the north-east and a sky full of stars; you need the headlights. The birds are quiet and crickets chirp                                                                        |
| Clear          | Dry ground and sunshine                                                                                                                                                                                  |
| After rain     | Overcast, soft shadows, dark damp ground; tyres grip less (on dirt about three quarters as well), no dust, the creeks up 5 cm, a few puddles on the tracks                                               |
| Raining        | Rain falling (not inside the cab), heavier haze, wetter ground with less grip still (on dirt about two thirds), the creeks up 12 cm, many more puddles; rain hisses outside and drums on the roof inside |

On wet ground hard braking takes longer and can lock the wheels: a locked tyre slides, scrubs and loses most of its steering grip, so ease off the brake to steer. From 60 km/h on dirt the cars stop in about 16–17 m dry, 18–19 m after rain and 20–23 m in the rain. Puddles lie on the flat stretches of the dirt and gravel tracks (never on the park's obstacle lines); driving through one splashes and sounds like the creek, and the muddy bottom is slippery.

The engine starts as you arrive: the starter cranks for about a second (a little longer for the diesel) and the car stays put until the engine catches. The same happens after swapping vehicles and when restarting a flooded engine.

The version number (for example v0.15) is on the loading screen and the pause menu, and goes up by 0.01 with every update merged into `main`. Hover over it to see the exact build.

## Headlights

**N** switches the headlights: off, low beam, high beam, then off again (gamepad: tool menu → Headlights; touch: LIGHTS, top left). At dusk and night they come on, on low beam, as you arrive. Low beam lights the ground for about 20 m ahead and spreads wide, which suits slow work among rocks and trees; high beam reaches the trees about 40 m away, in a narrower beam. The Camel Trophy 4WD's four roof lamps come on with high beam. In daylight the lamps glow but light nothing, as in the real world. A green lamp in the status strip shows the headlights are on, blue for high beam; in the driver's seat the dial needles light up and the dash has a blue high-beam lamp.

## Damage

**Pause menu → Settings → Damage** chooses how much harm hard driving does: Off, Mild (the default) or Realistic. The body dents and gets dirty whatever you choose.

What does damage, with Mild or Realistic:

- **A tyre** is cut when it lands hard on rock: a drop of about a metre or more, or a jump. It goes soft (Mild) or flat (Realistic): less grip, that corner sits lower and the car pulls towards it.
- **A suspension corner** bends on a heavy landing, about a 1.6 m drop. It sags, and a bent front corner pulls the steering towards its side.
- **The engine** is hurt by a crash on the nose (from about 25 km/h into something solid), a heavy knock underneath (a drop onto the belly, not the scrapes of crawling) or running upside down. It loses power and, badly hurt, smokes from under the bonnet. With Mild it keeps at least 70% of its power; with Realistic it can be wrecked, after which it cranks but won't run, and water drawn in through the air intake damages it too.

Crawling up, over and down the trails' rocks does no damage: every trail and park line has been driven with Realistic damage on without a scratch.

| Setting   | Repairs                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Mild      | Tool menu → **Field repair**: stopped, about 6 s, and everything is put right                                          |
| Realistic | Tool menu → **Fit the spare**: stopped, about 8 s, for one tyre; there's one spare. Everything else is fixed at a camp |

Driving into any campsite, or **pause menu → Return to last campsite**, repairs everything and puts the spare back. A small car outline in the status strip shows what's damaged, amber then red, and a prompt tells you when a repair can be done. Changing the setting to Off puts everything right.

## Vehicles

Pick one on the welcome screen, or from **pause menu → Vehicle** while driving. The new vehicle appears where you are, with the winch and planks back on board, and the game remembers your choice.

| Vehicle                 | Based on                                                                  | Engine and gearbox                                                | Notes                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Short-wheelbase 4WD     | 1970s Land Cruiser 40 Series                                              | 4.2 L petrol six, three-speed automatic                           | 2.3 m wheelbase, lifted on leaf springs, roof rack                                                     |
| Camel Trophy 4WD        | The short-wheelbase 4WD in Camel Trophy dress                             | Same as the short-wheelbase 4WD                                   | Sandglow yellow, door and bonnet decals, four roof lamps, snorkel                                      |
| Land Rover 110 Perentie | Les Hiddins' Army Land Rover 48-001 in the first _Bush Tucker Man_ series | 3.9 L Isuzu four-cylinder diesel, LT95A four-speed with low range | 2.79 m wheelbase, coil springs, 7.50R16 tyres, canvas tilt, bull bar, spare wheel under the rear floor |

The Camel Trophy 4WD drives exactly like the short-wheelbase 4WD. The only difference you'll feel is its snorkel: the engine breathes from the top of the left windscreen pillar, about 2 m off the ground, so it wades much deeper water before it floods. (The real Camel Trophy cars were Land Rovers; the 1986 event, run in Australia from Cooktown to Darwin, used Land Rover 90s.)

The Perentie shifts its own gears like the other vehicle (the game has no clutch). Its longer wheelbase makes it steadier on the fire trail and harder on crests: it climbs The Chute, but coming down it the chassis grounds on a rock step.

## Maps

Pick one on the welcome screen, or from **pause menu → Location** while driving. The game reloads into the new map at its last campsite, in the vehicle you're driving, and each map keeps its own progress.

**High Country** is the original open map: creeks, an escarpment, the high plain and Granite Spur's eight obstacles, described below.

**Ironbark 4WD Park** is a purpose-built park. A gravel loop (green markers) rings Ironbark Hill, a flat-topped hill with steep faces, and eleven numbered, signposted stations hang off it. Each station has an easier and a harder line that leave the loop and rejoin it (or the ring track on the hilltop), so the loop is always the way round. Start at Park HQ on the south side.

| Station           | Easier line                                        | Harder line                                                                |
| ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Mud Pits       | Two shallow bog holes (easy)                       | Three deep bog holes with churned ruts; much slower without lockers (hard) |
| 2. Axle Twisters  | Shallow holes under alternate wheels (moderate)    | Holes beside mounds that lift diagonal tyres; needs a locker (hard)        |
| 3. Log Crossing   | Small logs at an angle (easy)                      | Logs as tall as the chassis rails, and a doubled pair (hard)               |
| 4. Ditch Crossing | Two broad dips (moderate)                          | Three short, steep ditches that test approach and departure angles (hard)  |
| 5. Rock Garden    | Scattered stones (easy)                            | Tyre-high boulders packed tight; needs both lockers (extreme)              |
| 6. Water Crossing | A wide gravel ford (easy)                          | A deep hole between steep banks; mind the air intake (hard)                |
| 7. Hill Climb     | Slanting up the north face at about 18° (moderate) | Straight up it at 30° (hard). One way, uphill                              |
| 8. Steep Descent  | Slanting down the south face (moderate)            | Straight down 28° through erosion ruts (hard). One way, downhill           |
| 9. Side Slope     | Low on an earth bank, leaning about 15° (moderate) | High on it, leaning about 25° (hard)                                       |
| 10. Rock Steps    | Low steps slanting up the west face (moderate)     | Tall split ledges straight up it (hard). One way, uphill                   |
| 11. Whoa-boys     | Low drainage humps (moderate)                      | Tall humps with ditches behind, some angled (hard)                         |

Every line is drive-tested with both vehicles. The scored runs work on every line, and the paper map labels each station once you've found it.

**Crawler Creek** is an RC crawler-style trail at full size: one 1.3 km loop from the Trailhead, marked by 52 numbered gates. Each gate is a pair of flags, red on your left and blue on your right, with its number on a board on the red flag's stake. Drive through them in number order. The trail crosses Crawler Creek twice and climbs Knuckle Ridge, an escarpment north of the creek. The gates don't score anything yet (they're laid out so that a later version can count gates passed and flags hit); the scored runs work on every section.

| Section           | Gates | Grade    | What it is                                                                |
| ----------------- | ----- | -------- | ------------------------------------------------------------------------- |
| 1. Start Chute    | 1–6   | easy     | A slalom between boulders north of the Trailhead                          |
| 2. Mud Holes      | 7–10  | moderate | Three mud holes in a row, each deeper than the last                       |
| 3. Creek Bridge   | 11–13 | easy     | A 14 m timber bridge with kerbs over the creek, gated narrow at both ends |
| 4. Log Run        | 14–17 | moderate | Five logs across the track at the foot of the ridge                       |
| 5. Switchbacks    | 18–27 | hard     | Five legs and four tight hairpins up the ridge face, gated at every turn  |
| 6. Summit Rocks   | 28–31 | moderate | Granite ledges, boulders and slabs along the top of the ridge             |
| 7. The Drop       | 32–33 | hard     | Down the ridge's steep east end at 24°, nearer 30° over the ruts. One way |
| 8. Skinny Bridge  | 34–36 | hard     | Two planks over a bog, one under each wheel track                         |
| 9. Water Crossing | 37–40 | moderate | A wide gravel ford, gated mid-stream                                      |
| 10. Ramp Bridge   | 41–42 | moderate | An up-and-over timber ramp, 1.2 m high                                    |
| 11. Rock Garden   | 43–48 | hard     | Two fields of tyre-high boulders in a dry creek bed; needs lockers        |
| 12. Last Splash   | 49–52 | easy     | A last mud hole and the finish gate back at the Trailhead                 |

Every section is drive-tested with both vehicles in low range, the hard ones with both lockers, and the Camel Trophy 4WD drives the whole loop without stopping. The switchbacks' hairpins are tight enough that you may need to stop, back up and turn again, especially in the Land Rover. The paper map shows the bridges and every gate's flags.

## Controls

| Action                         | Keyboard                                              | Gamepad                                              |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| Accelerate                     | W / ↑                                                 | RT                                                   |
| Brake / reverse                | S / ↓ (hold when stopped to reverse)                  | LT                                                   |
| Steer                          | A D / ← →                                             | Left stick                                           |
| Handbrake on / off             | Space (press again to let it off)                     | X / Square                                           |
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
| Cycle crawler / driver views   | C, or the View button                                 | Hold LB + click right stick                          |
| Crawl gauges: auto / on / off  | I                                                     | Shown in low range                                   |
| Horn                           | H                                                     | Left stick click                                     |
| Headlights: off / low / high   | N                                                     | Hold LB → headlights                                 |
| Map                            | M                                                     | View / Select                                        |
| Pause                          | Esc                                                   | Start / Options                                      |

Placing planks: choose **Place planks** in the tool menu, move them with W/S, turn them with A/D, place with E, cancel with Esc. Prompts on screen switch between keyboard and gamepad glyphs depending on what you last touched.

### Phones and tablets

On a touch screen the game shows on-screen controls. They work held sideways (landscape) or upright (portrait).

| Action                                | Touch                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Steer                                 | Joystick, bottom left (push part way for part lock)                                                    |
| Accelerate / brake and reverse        | GAS / BRAKE, bottom right (hold BRAKE when stopped to reverse)                                         |
| Handbrake on / off                    | HAND                                                                                                   |
| High / low range                      | LOW                                                                                                    |
| Precision crawl, diff locks           | CRAWL, F LOCK, R LOCK                                                                                  |
| Winch attach / detach, pick up planks | USE                                                                                                    |
| Winch in / out                        | Hold IN / OUT (shown while the winch is attached)                                                      |
| Right vehicle                         | Hold UPRIGHT (shown when needed)                                                                       |
| Tool menu                             | TOOLS, then tap an option (tap the space around it to close)                                           |
| Placing planks / choosing anchor      | Joystick, then USE to confirm or BACK to cancel                                                        |
| Orbit camera                          | Drag a finger on the view                                                                              |
| Camera distance                       | Pinch with two fingers on the view                                                                     |
| Cycle views / recenter camera         | View and Reset view, top right                                                                         |
| Map / pause                           | MAP and II, top left (tap outside the map to close it); ⛶ goes full screen where the browser allows it |
| Headlights                            | LIGHTS, top left: off, low beam, high beam                                                             |

The controls appear on phones and tablets, and whenever the screen is touched; pressing a key or using a gamepad hides them. A phone or tablet with no saved settings starts on the Low graphics preset. Add `?touch` to the address to show the touch controls on a desktop browser.

## Rock crawling

The **Camp Rock Course** is about 40 m east of River Flat Camp; follow the sign beside camp. Three marked lines progress from low warm-up steps to cross-axle rocks and a harder ledge line. Each line has entrance and exit markers, a difficulty sign and nearby driving hints. The course also appears on the map once discovered.

Select **low range (L)**, then toggle **precision crawl (P)**. It works like a crawl-control system: hold W for a forward target of 6 km/h; S still brakes normally while moving forwards, then targets 5 km/h in reverse once stopped. Precision mode adjusts throttle and brakes to control descents while retaining full engine effort for climbing. Analogue triggers vary the target speed; half input targets 3 km/h forwards or 2.5 km/h in reverse. Use lighter trigger input or feather W on taller ledges to avoid catching the belly. Release the controls and it brakes to a stop; press P again for normal driving.

The drivetrain behaves like a real automatic. The throttle sets how hard the engine pulls, so a light, steady pedal settles at a steady speed (in low range about 7 km/h at 10% throttle) and the revs build over a moment. A torque converter sits between engine and gearbox: in gear the car creeps at idle (about 4 km/h in low range), so brake to stop when precision crawl is off. Engine braking comes through the converter and rises with the revs, and the gearbox holds its gear when you coast downhill. Pulling away on a slope, hill-start assist holds the brakes until the drive has built up. If the car slips back down a rock, W still drives forwards, fighting the roll, instead of braking.

Toggle the **rear locker with X** and **front locker with Z**. A locked axle keeps using the grounded tyre when its partner lifts. Engage below 5 km/h; unlocking is always allowed. Front lock increases the turning radius, so unlock it for tight manoeuvres. The status buttons show each axle's state and can also be clicked. On gamepad, hold LB, point the left stick at the front locker, rear locker or precision crawl option, then release LB to select it.

Low range also softens the springs and anti-roll bars, adds 6 cm of suspension droop and adjusts the dampers. The tyres can stay loaded over diagonal rocks while parked body height and bump clearance stay the same. Returning to high range restores the normal suspension support.

Press **C** or click **View** to cycle Follow → Front left → Front right → Rear close → Driver. The front views look low across the tyres for placing a wheel on a rock; the rear view helps judge the belly and rear axle. The driver view sits in the right-hand seat and tilts with the body; drag (or the right stick) turns your head. The steering wheel turns with the front wheels, and the dash works: speedometer, tachometer and oil pressure, plus lamps for low range, each locker, crawl control, a stalled engine and the handbrake. The handbrake lever (or the pull handle under the 40 Series-style dash) moves when you pull it on. In the driver's seat the on-screen panels shrink, turn partly see-through and sit low in the corners, clear of the windscreen and mirrors. Mouse drag, right-stick orbit and zoom still work. **V / R3 / Reset view** returns to follow and restores its previous zoom. On gamepad, hold **LB and click R3** to cycle views without choosing a tool.

The **handbrake** stays on once pulled (Space or X/Square), until you press it again. A red **P** shows in the status strip while it's on; it ratchets on and clunks off, and if you try to drive away with it on, a prompt tells you to let it off.

**Crawl gauges** appear at the bottom right in low range, with precision crawl or in the driver view (**I** cycles auto / always / off). The inclinometer shows pitch and roll and turns red near tipping angles (about 32° pitch, 28° roll). The tyre diagram shades each tyre by how much weight it carries, draws a lifted tyre as a dashed outline and a spinning one in orange, and marks locked axles. It warns when the belly is on a rock, and shows gear (L1, H2, R…), speed and revs.

**Scored runs (optional):** drive into either end of a crawl trail's technical line (Granite Link or any Granite Spur obstacle) and a clock starts under the compass. Each time the car backs up costs 1 point, each time the chassis knocks a rock 1 point, and hooking up the winch 5 points. Reach the far end to see your time and points; your best per trail (fewest points, then quickest) is saved. Leaving the line or rolling ends the run; drifting past an entrance just cancels it.

**Sound** follows what the car is doing: the inline six's burble changes with revs and load, low range adds transfer-case whine, tyres chirp when they spin on rock, the springs squeak as the axles flex, and the chassis grinds and knocks when it touches rock. Range changes clunk, the air lockers click and hiss, and selecting drive or reverse clunks. In rain there is a broad hiss and a closer patter outside, and the rain drums on the roof in the driver's seat.

The **Granite Link** starts just east of the camp course. Follow the amber markers through about 70 m of split rocks, an off-camber shelf and granite ledges. Marked boulders beside the trail provide winch anchors. The wider, green-marked gravel bypass connects the same entrance and exit, making a loop back to camp. Both routes work in either direction; section hints explain the obstacle nearby. The rocks' chamfered surfaces use the same vertices for rendering and collision.

Continue past Granite Link to **Granite Spur**, a granite hill with eight obstacles modelled on real tracks: the clay climbs, rock steps, shale sidlings and washouts of the Victorian High Country (Billy Goat Bluff, Blue Rag Range), and the boulder gullies and chutes of the Rubicon and Moab. A gravel **fire trail** (green markers) climbs the north face to the summit and rings the foot of the hill, so you can reach both ends of every obstacle without lockers. Marker colours show the grade: blue easy, amber moderate, red hard, black extreme.

- **Creek Bed — easy:** a dry creek cut a metre into the foot of the hill, floored with rounded stones that rock the car. Open diffs in low range will do.
- **Whoa-boys — moderate:** a 17° clay climb over three earth drainage humps, each with a ditch dug behind it. Take them square and slow so the belly doesn't hang on a crest; the angled ones lift diagonal wheels.
- **Rock Steps — moderate:** granite ledges up the steep pinch onto the summit, two of them split so one front tyre climbs first. Low range gets up with open diffs; high range stalls. Coming down is harder.
- **Log Step — moderate:** three fallen snow gums across the summit, about as tall as the chassis rails. Cross at a slight angle so one wheel climbs at a time.
- **The Sidling — hard:** a narrow side-cut on loose shale above a gully, leaning the car 20–25° towards the drop. A washout under the low-side tyres and a rock shelf under the high side add to it. Never turn downhill.
- **Boulder Gully — hard:** a gully cut up to 3 m into the south face and choked with boulders bigger than the tyres. Both lockers get through; a rear locker alone takes nearly three times as long; open diffs and high range stall.
- **The Chute — extreme:** a granite V-notch that climbs about 10 m in 20 m onto the summit. Its walls swap high and low every wheelbase, so one front and the opposite rear tyre are always lifting. It needs both lockers and low range.
- **Washout Ruts — hard:** a steep clay descent gouged by erosion ruts up to half a metre deep. Straddle the middle rut, and cross the others at an angle one wheel at a time.

The suggested order runs round the hill from Granite Link: Creek Bed, Whoa-boys, Rock Steps and Log Step to the summit, down The Sidling, along the foot of the hill, up Boulder Gully and The Chute, and down Washout Ruts. Every obstacle also works the other way. Signs at both ends and nearby hints name the obstacle and how to drive it, and the summit and all eight obstacles appear on the paper map once found. Ruts and drainage humps are fine ground detail (0.25 m) laid over the 1 m terrain; like the rocks and logs, what you see is exactly what the car collides with.

## Debug mode

Add `?debug` to the URL (for example `http://localhost:5173/?debug` or `https://reidstephen11.github.io/4wd-simulator/?debug`). You get:

- An overlay with FPS, a frame-time graph, draw calls, triangles, main-thread time (simulation and rendering), vehicle state (speed, gear, rpm, surface and load per wheel), winch, flooding, dirt, sound levels and particle counts.
- A panel with: free-fly camera (also the **backtick key**), physics collider wireframes and wheel contact points, a teleport button for every place on the map, buttons to play each bird call, and live sliders for the main vehicle tuning values (including the torque converter). The overlay's audio line names the engine sound in use (`synth` = the AudioWorklet engine) and the chassis scrape level.

## What to test

The v0.1 checklist (SPEC §16), plus things that can only be judged by playing:

- [ ] It loads from the Pages link in current Chrome, Firefox and Edge.
- [ ] Starting at River Flat Camp, you can drive to every place on the map using only the vehicle and its tools (25 places; the map fills in as you find them).
- [ ] **Camp logs:** select low range (L) and crawl over both logs without a run-up. Try reverse and a line with only one wheel on each axle crossing the log; the tyres should climb before the body touches.
- [ ] **Granite Link:** follow the amber trail through all three rock sections, then return on the green gravel bypass. Try C / View at a diagonal obstacle to see the axle flex; confirm V restores follow. Try the loop in the opposite direction.
- [ ] **Granite Spur:** from Granite Link, drive the obstacles in order (Creek Bed, Whoa-boys, Rock Steps, Log Step, The Sidling, Boulder Gully, The Chute, Washout Ruts), then the fire trail up and round the hill with open diffs. Try Boulder Gully and The Chute with open diffs, then the rear locker, then both. Watch the roll gauge on The Sidling (C → Driver), and try straddling the ruts versus dropping a wheel in.
- [ ] **Deep Crossing:** drive into the deep channel and sit there — the engine sputters after about 5 s under water and stalls at 10 s. It restarts on throttle once the air intake has been clear for 20 s.
- [ ] **The Staircase:** the rocky climb needs low range (press L while slow); high range shouldn't make it.
- [ ] **Washout Gully:** the car can't cross the 1.2 m gap on its own. Lay both planks across it (tool menu → Place planks) or take the detour around the top end.
- [ ] **Bog Hole:** in high range the car gets stuck; attach the winch to a nearby tree or marked boulder (E) and reel in (R) to get out.
- [ ] Roll the car on a steep side slope, then right it by holding J.
- [ ] The compass shows discovered places within 400 m; the paper map (M) labels only what you've found; both survive a page reload, and you restart at the last campsite you visited.
- [ ] Pause menu → Return to last campsite works; settings (graphics quality, volumes, units) apply straight away and are remembered.
- [ ] Frame rate on Medium: open `?debug` and check the overlay holds 60 fps while driving around (the target is a 2022 laptop with integrated graphics).
- [ ] Feel: steering response, how much the body leans, braking distance, how easily it rolls, how hard the Staircase and Bog Hole are, camera distance and lag. The main numbers are in `src/data/vehicle.ts` and `src/data/camera.ts`, and the vehicle ones can be changed live in the debug panel.
- [ ] Sound: the engine cranks and catches on your first key press; idle lopes; revs and load change the note (try a full-throttle stall against a rock in low range, then lift off at high revs for the overrun burble). Low range adds a gear whine that rises with speed. Tyre noise changes between dirt, gravel, mud and water; tyres chirp when spinning on rock; springs squeak while articulating; the chassis grinds and knocks on rock in the Boulder Field. Range changes, lockers and selecting reverse each make their own clunk. Winch whine, wind up high, creek water, bird calls, the map rustle and the discovery chime. Check the three volume sliders.
- [ ] Driving feel: in low range with precision crawl off, a light steady throttle should settle at a steady crawl; releasing W creeps rather than stopping (brake with S); a 20–25° climb from a standstill pulls away without rolling back; coasting down a steep slope in low range holds the speed back.
- [ ] Crawl gauges and driver view: pitch/roll and lifted tyres match what you see (try C → Driver on the Off-camber Slab); I cycles the gauges.
- [ ] Scored runs: complete a Granite Spur obstacle, then try to beat your points or time; back up once and check it costs a point.
- [ ] **Welcome screen:** on launch, choose each world, vehicle, time of day and weather in turn; check the light and weather look right, rain stays out of the cab (C → Driver), the ground looks wet and the tyres slip more. Pause menu → Main menu should come back to the welcome screen with your choices kept.
- [ ] **Engine start:** hold W from the moment the game loads; the car should stay put until the starter has finished cranking and the engine has caught.
- [ ] **Pitch gauge:** drive up a slope in low range (I shows the gauges); the side-view outline's nose should point up.
- [ ] **Ironbark 4WD Park:** pause menu → Location → Ironbark 4WD Park. Drive the loop from Park HQ, then try the easier and harder line at each station. The harder Axle Twisters and Rock Garden should stop you with open diffs; Side Slope should lean about 15° and 25°. Change back to the High Country and check your progress there is kept.
- [ ] **Handbrake:** press Space; the red P and dash lamp come on and stay on. Try to drive off (the car drags and a prompt appears), then press Space again.
- [ ] **Driver's seat panels:** C → Driver in both vehicles; the windscreen and mirrors should be clear.
- [ ] **Crawler Creek:** choose it on the welcome screen. From the Trailhead, drive the gates in number order all the way round. Check the hairpins on the Switchbacks (can you make each one in one go?), that both bridges' boards feel solid and the tyres sound like timber on them, that slipping a wheel off the Skinny Bridge drops it into the bog, and that the Rock Garden stops you with open diffs. Open the paper map to see the gates.
- [ ] **Night and headlights:** choose Night on the welcome screen. The headlights should be on (green lamp in the status strip) as you arrive. Press N for high beam (blue lamp; the beam reaches the trees) and again for off; with them off you should only just make out the track by moonlight. In the driver's seat (C) the needles glow and the blue lamp lights on high beam. In the Camel Trophy 4WD the four roof lamps light with high beam. Listen for crickets instead of birds.
- [ ] **Damage:** pause menu → Settings → Damage → Realistic. Drive off a ledge of a metre or more onto rock, or into a tree at 30 km/h; check the message, the car outline in the status strip, the sagging corner or flat tyre, the pull to one side and the smoke. Fit the spare from the tool menu (stopped), then drive into a campsite and check everything is put right. Then drive a trail carefully with Realistic on and check nothing breaks. Try Mild too: nothing should stop you.
- [ ] **Signs and messages:** every sign should read straight from both sides, with no second board crossing it (Crawler Creek's section signs show it best). Messages, "Discovered" cards and run results should appear in the top right corner, not over the track ahead; on a phone, below the View and Reset view buttons.
- [ ] **Camel Trophy 4WD:** pause menu → Vehicle → Camel Trophy 4WD. Check the yellow paint and decals, the roof lamps and the snorkel, and that it drives through deep water (the High Country's Deep Crossing) that stalls the plain short-wheelbase 4WD.
- [ ] **Land Rover 110:** pause menu → Vehicle → Land Rover 110 Perentie. Check the look against the _Bush Tucker Man_ vehicle, the diesel clatter at idle and its starter (no turbo-like whistle as it speeds up), the driver's view (C → Driver), and the Granite Spur loop. Reload the page and it should still be the Land Rover.

## Project layout

```
src/
  core/    game loop (fixed 60 Hz physics + interpolated rendering), game orchestration, test hook
  data/    every tuning number: palette, environment, map, vehicle, surfaces, tools, camera, quality, audio, particles
  sim/     headless simulation (no rendering, UI or audio imports): world generation, physics, vehicle, tools, saving
  render/  Three.js: terrain, vegetation, water, sky, vehicle model, particles, chase camera
  ui/      HUD, compass, paper map, menus, tool menu
  audio/   Web Audio synthesis (engine/ holds the AudioWorklet engine synthesiser)
  debug/   overlay, free camera, debug panel
scripts/   dev helpers: engine-lab (renders the engine to WAV with levels and spectra), drivetrain-lab, crawl-lab, obstacle-lab and drive-lab (headless measurements), shoot and vehicle-shots (screenshots)
tests/     Vitest unit and headless physics tests
e2e/       Playwright browser tests (one file per milestone)
docs/      DECISIONS.md (choices made where the spec was open) and screenshots per milestone
```

## Deployment

`.github/workflows/deploy.yml` runs lint, unit tests and the production build on every pull request and on every push to `main`. A push to `main` then deploys `dist/` to GitHub Pages. Deploy stays on `main` only: the Pages environment rejects other branches, and the Pages setup step fails the job until the site exists (that missing site is what turned the 16–17 Oct 2026 runs red after a successful build). Pages has to be switched on once in the repository settings: **Settings → Pages → Source: GitHub Actions**. The build uses relative asset paths, so it works under the repository's Pages URL.
