# 4WD Simulator

A single-player 4WD playground that runs in the browser and can be installed from Chrome on Android. There is no route and nothing to finish: each level is a small piece of country packed with climbs, creek crossings, bog holes and rock, and you drive whichever lines you like, in whatever order, in any of thirteen vehicles. Low range, diff locks, tyre pressures, a winch and planks are there to get you through.

From v0.22 the game runs on the code of [Over the Cape](https://github.com/reidstephen11/over-the-cape), the Cape York game that grew out of the first 4WD Simulator: its vehicles, physics, HUD, menus, phone controls and headset mode, without its story. Three.js, Rapier physics and TypeScript; the terrain, trees, vehicles and sound are generated in code.

## Play

**Online:** https://reidstephen11.github.io/4wd-simulator/ (deployed from `main` by GitHub Actions). On Android Chrome, Install app / Add to Home screen opens it as a standalone app. A new version downloads in the background; it takes over on the title screen, and during a drive it waits for **Pause → Restart for the new version**. After one visit the game also starts offline.

**Locally** (Node 20 or newer):

```bash
npm install
npm run dev        # then open http://localhost:5173
```

| Script              | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run build`     | Type-checks and builds the static site into `dist/`                              |
| `npm run preview`   | Serves `dist/` at http://localhost:4173                                          |
| `npm run lint`      | ESLint and Prettier check                                                        |
| `npm test`          | Unit and headless physics tests (Vitest); `npm test -- --shard=1/3` runs a third |
| `npm run typecheck` | Type-check everything, tests and scripts included (the build checks only `src`)  |
| `npm run test:e2e`  | Browser tests (Playwright; builds first)                                         |

The game opens on a title screen. **Press any button** (or **Tap to begin**) brings up three choices:

- **Continue** carries on from the last camp you drove into, in the same vehicle and conditions, without another screen. It is greyed out until a drive has been started.
- **New drive** opens the setup page: the level, the vehicle, the damage setting, the time of day and the weather. **Load level** builds the map; a card names the level and the conditions, with **About this level** and **Controls** to open if you want them, then **Drive**.
- **Settings**: graphics, cockpit mirrors and head motion, volume, controller type, speed units, UI size, HUD style and, on a phone, the driving scheme and joystick side.

The engine is off as you arrive: the first press of the accelerator starts it. **Pause → Main menu** goes back to the title.

The version number (v0.28 now) is on the title screen, the loading card and the pause menu, and goes up by 0.01 with every update. Hover over it to see the exact build. Saves from v0.21 and earlier are not read: the game starts fresh.

## Ironbark Creek

The first level is half a kilometre square. A 25 m knoll stands in the middle with the **Knoll track** looping right round it. **Ironbark Creek** runs north to south down the west side in a gully about five metres below the plain, and the **West bank track** follows its far side. You start at **Ironbark camp** on the west bank; **Top paddock camp** is across the knoll, off the loop's north-east corner. Every line is signed at both ends, and the far sign says which way it can be driven. The ground between the lines is open eucalypt woodland and can be driven too. The paper map (M) shows the tracks and the places you have found.

**On the knoll** (each line leaves the Knoll track or comes back down to it):

- **Rock climb**: straight up the south face on rock: broken granite, a staircase of ledges, an off-camber slab, a notch between two whalebacks, then split ledges near half a metre high and a full-width ledge below the top. Up only. Low range, both lockers and precision crawl. It has eight scored gates (below).
- **Switchbacks**: up the east face in four legs joined by three tight hairpins. Swing wide, use full lock, and back up for a second go if you need to. Either way.
- **Side slope**: round the west flank, leaning the car out past 20°. Crawl, steer smoothly and never turn downhill. Either way.
- **The drop**: down the north-west face and off a near-vertical rock lip about three metres high into a mud hole. Low range, wheels straight, crawl off the lip and let the nose drop. Down only.
- **Steep descent**: straight down the north face past 28°, through erosion ruts. Low range, straddle the ruts, never lock the wheels on the clay. Down only.
- **Axle twisters**: fourteen holes under alternate wheels, each with a mound under the other wheel, south-east of the top. Lock the rear diff, or both. Either way.
- **Bog trench**: a long bog sunk a metre and a half between clay walls, north-east of the top. Once in, the only way out is along it; marked rocks on the banks are there to winch from. Either way.

**On the creek** (each crossing runs from the Knoll track's west leg to the West bank track):

- **The ford** (middle): under half a metre of water over gravel, on easy ramps. Any vehicle, any gear. Cross steadily, then give it a little more throttle up the far bank: at a light throttle the car stops on the ramp.
- **The deep crossing** (north): over 1.2 m deep on the straight line. Crawl it: above walking pace the bow wave reaches the air intake and floods the engine. Just downstream (to your left going west) a gravel bar carries about half the depth, with boulders to weave between and two scour holes. The banks are laid back for 40 m, so both lines share the way in.
- **The chute** (south): about eight metres of clay at 30° down to the water, with an erosion rut to straddle, then eleven metres at 26° out with a step of rock at the lip. Marked boulders stand above the climb out to winch from. Going west it can be crawled with both lockers; coming back east, up the chute itself, takes the winch.

**On the west bank:**

- **The bog hole**: a side loop through two deep holes of sticky black mud, end to end, shallower towards their edges, with trees to winch from.
- **The rock garden**: a side loop over granite steps, slabs and boulders. Put a wheel on each rock rather than straddling it.

How hard they are, measured with the autopilot crawling in low range in the short-wheelbase 4WD on a dry day: with both diff locks every line can be driven except back up the chute. With open diffs the car stops on the rock climb, the axle twisters, the bog trench, the deep crossing, the chute, the bog hole and the rock garden (driven clockwise); the ford, the side slope, the drop and the steep descent need no lockers. Rain makes the clay and the mud a good deal harder.

**Scored rock climb.** Drive through gate 1 at the foot of the rock climb to start a run: red flag on the left, blue on the right, eight gates uphill. A run starts with 1000 points; touching a flag costs 25, missing a gate 100, each reverse or knock on the body 5, and hooking the winch 50. Time breaks ties. The best score is kept for each vehicle.

**Tyre marks.** The car's tyres leave their tread on the ground: most in mud, clay and sand, less on dirt, grass and gravel, none on rock. Wet ground marks darker, and so does a spinning or locked wheel. Tyres that have just come out of the creek or a bog leave wet tracks for a few metres, on rock too. The marks stay for the drive (about a kilometre and a half of driving before the oldest go), so a climb shows the lines already tried.

**Ruts you can see (v0.30).** On soft ground the tyre marks look pressed in: a darker, more solid groove, a band along each edge for its walls (the one facing the sun lit, the other in shadow) and a strip of soil pushed up along each side. Each time a wheel goes over the same spot the rut deepens, so a line you have driven five times looks clearly deeper than one driven once. Mud, black soil and sand take a rut wet or dry; clay, dirt and grass only when wet; rock, gravel and timber never, and their marks stay flat. The ground itself is not moved.

**Ruts you can feel (v0.31).** A wheel in a rut sits lower, by up to 8 cm in a full-depth one, and takes that corner of the car down with it: with all four wheels in deep ruts the belly is 8 cm nearer the ground. The rut drags at the tyre a little, and it holds the wheel: steer gently and the car stays in its ruts, steer firmly and it climbs out. So cutting up a soft climb or a bog has a cost on the next attempt, and a well-worn line guides the car along it.

**Ground detail.** Close up, the ground is no longer smooth colour. Gravel, rock steps and the creek bed are separate stones; mud is wet lumps with dark hollows; bare earth has grit in it; boulders and ledges have joints, specks and weathering. It is drawn only: the car drives on the same surface as before.

**Notes.** The first time you reach an obstacle, a small card says what it is and which control helps there, worded for the keyboard, controller or phone you are using. **Pause → Trip journal** keeps the notes you have seen.

**Camps.** Driving into either camp repairs the car, puts the spare wheel and tyre plugs back (one spare and three plugs) and makes that the camp you return to. **Pause → Restart from last camp** goes back to it. No fuel is used in a playground level, so there is no fuel gauge on the screen and no jerry cans in the tool menu.

## Conditions

Chosen on the New drive page, and kept for next time.

| Choice         | What it does                                                                          |
| -------------- | ------------------------------------------------------------------------------------- |
| Morning        | Low, cool-gold sun from the east-north-east                                           |
| Midday         | High sun from the north, short shadows                                                |
| Late afternoon | Warm low sun from the west-north-west (the default)                                   |
| Dusk           | Sun on the horizon, long shadows; the headlights come on as you arrive                |
| Night          | Faint blue moonlight and stars; you need the headlights                               |
| Clear          | Dry ground and sunshine                                                               |
| After rain     | Overcast; the ground is wet, the clay and mud are slippery, puddles lie on the tracks |
| Raining        | Rain falling, heavier haze, wetter ground with less grip still, more puddles          |

Wet clay, mud, track dirt and grass cut up where the wheels spin, and the churned ground shows as dark wet patches: each failed attempt at a climb makes the next one slipperier.

## Damage

**New drive → Damage** (also pause menu → Settings → Damage). The body dents and gets dirty whatever you choose.

| Setting   | Damage                                                                                       | What sends you back to camp                                             |
| --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Off       | None                                                                                         | Nothing                                                                 |
| Mild      | Tyres go soft, corners bend, the engine loses power; tool menu → Field repair fixes it all   | Being swept away by the creek                                           |
| Realistic | Punctures and torn sidewalls, bent corners, the engine can be wrecked; plug or fit the spare | Swept away, a flat with no spare or plug that fits, or a wrecked engine |

Working the engine hard overheats it, fastest when bogged with the wheels spinning; airflow and water cool it. Watch the TEMP gauge: hot, it loses power and starts to be damaged.

## Vehicles

Pick one on the New drive page, or from **pause menu → Vehicle** while driving (the new vehicle starts from your last camp). Every vehicle is open from the start, and each has its own cab, dials and engine sound. Every engine builds as it nears its rev limit and holds its note there; all but the Range Rover's rev about a tenth further than the real one, and each vehicle pulls a little harder at the top of its revs (v0.29).

| Vehicle                    | Based on                                                                           | Engine and gearbox                                                |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| FJ40                       | 1970s Land Cruiser 40 Series                                                       | 4.2 L petrol six, three-speed automatic                           |
| Short-wheelbase 4WD        | The earlier hand-coded 40 Series body, same mechanicals as the FJ40                | 4.2 L petrol six, three-speed automatic                           |
| Camel Trophy Land Rover 90 | The 1986 Camel Trophy Land Rover Ninety, left-hand drive, with a snorkel and winch | 2.5 L diesel four, LT77 five-speed with low range                 |
| Land Rover 110 Perentie    | The Australian Army's Land Rover 110                                               | 3.9 L Isuzu four-cylinder diesel, LT95A four-speed with low range |
| Hilux single cab           | 1979–83 Toyota Hilux 4WD with the styleside tub                                    | 2.0 L petrol four, four-speed manual with low range               |
| Unimog UL1700L             | The Australian Army's Mercedes-Benz Unimog 4-tonne truck                           | 5.7 L turbo-diesel six, four road gears and four field gears      |
| Troop Carrier              | 1990s Toyota LandCruiser 75 Series Troop Carrier                                   | 4.2 L diesel six, five-speed manual with low range                |
| GQ Patrol                  | Late 1980s–90s Nissan GQ Patrol wagon, set up for touring                          | 4.2 L TD42 diesel six, five-speed manual with low range           |
| LC79 V8                    | Current Toyota LandCruiser 79 single cab, built up hard                            | 4.5 L twin-turbo diesel V8, tuned; five-speed with low range      |
| 80 Series — Sooty MkII     | Modified 80 Series inspired by Shaun Whale's MkII                                  | 4.2 L turbo-diesel six, five-speed with low range                 |
| 60 Series wagon            | 1986 Toyota LandCruiser HJ60 Standard wagon, Australian, with a bull bar and rack  | 4.0 L 2H diesel six, five-speed manual with low range             |
| Range Rover two-door       | Early-1980s two-door Range Rover, Australian-delivered, with a roo bar and rack    | 3.5 L Rover V8, LT77 five-speed, full-time 4WD with a centre lock |
| Hilux SR5 Xtra Cab         | 1985 Toyota Pickup (Hilux) SR5 Xtracab 4x4, left-hand drive, black, on 31s         | 2.4 L injected petrol four, five-speed manual with low range      |

## Transfer cases

Every vehicle starts in **4H**, with its front hubs locked and, on full-time vehicles, the centre diff locked. **L** (controller **△ / Y**, or the phone's **4WD → transfer** button) cycles **2H → 4H → 4L → 2H** on the 40, 40 ute, 60, Hilux, Troopy, MQ, GQ and 79. Stop before entering or leaving 4L; 2H → 4H works below 20 km/h with the hubs locked. The HUD and phone button show the current mode. In 2H only the rear wheels drive.

On these part-time vehicles, select 2H and stop on level ground to **Lock / Unlock front hubs** from TOOLS. It takes 20 seconds, with the car held still and progress shown. With the hubs free, a shift into four-wheel drive waits until they are locked. The 79 has automatic hubs. The 80, Perentie, Camel Trophy Land Rover, Unimog and Range Rover have full-time drive: L switches 4H / 4L, and TOOLS offers **Lock / Unlock centre diff**. Stop to engage it. With the centre open, an axle losing grip limits drive at both axles; locking it keeps the other axle pulling.

Part-time 4WD, or a locked centre diff, winds up in tight turns on firm rock, concrete or bridge timber. Steering gets heavier, the tyres scrub and wear, and a creak and **WIND-UP** lamp warn you. Select 2H or unlock the centre; loose ground also releases the strain. Camp saves remember mode, hubs and centre lock for that vehicle. Older saves start in 4H.

## Controls

The table shows PlayStation labels; choose Xbox or Generic in Settings to change the in-game prompts and Controls help. Generic buttons are numbered 1–12 in standard gamepad order.

| Action                                     | Keyboard                                              | PS4 controller                                                                        |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Accelerate (first press starts the engine) | W / ↑                                                 | R2                                                                                    |
| Brake / reverse                            | S / ↓ (hold when stopped to reverse)                  | L2                                                                                    |
| Steer                                      | A D / ← →                                             | Left stick                                                                            |
| Handbrake on / off                         | Space (press again to let it off)                     | □ (Square)                                                                            |
| Cycle transfer case                        | L (stop for low range)                                | △ (Triangle)                                                                          |
| Front / rear diff lock                     | Z / X (below 5 km/h to engage)                        | Hold L1 → front / rear diff                                                           |
| Precision crawl                            | P                                                     | Hold L1 → precision crawl                                                             |
| Winch quick attach / detach                | E                                                     | R1                                                                                    |
| Winch in / out                             | R / F                                                 | D-pad up / down                                                                       |
| Tool menu                                  | Hold Q, point with the mouse, arrows or WASD, release | Hold L1, point with the right stick or d-pad, release                                 |
| Interact (planks, hitch)                   | E (when prompted)                                     | ✕ (Cross)                                                                             |
| Right vehicle                              | Hold J (when prompted)                                | Hold ○ (Circle)                                                                       |
| Orbit camera                               | Mouse drag (left or right button), or Num 4/6/8/2     | Right stick                                                                           |
| Camera distance                            | Scroll                                                | D-pad left/right while driving (Automatic gearbox)                                    |
| Shift up / down (manual gearbox)           | —                                                     | D-pad right / left                                                                    |
| Recenter camera                            | V or Num 5, or the Reset view button                  | Right stick click                                                                     |
| Cycle crawler / driver views               | C, or the View button                                 | Hold L1 + click right stick                                                           |
| Crawl gauges: auto / on / off              | I                                                     | Shown in low range                                                                    |
| Horn                                       | H                                                     | Left stick click                                                                      |
| Headlights: off / low / high               | N                                                     | Hold L1 → headlights                                                                  |
| Map                                        | M (scroll to zoom, drag to move it)                   | SHARE                                                                                 |
| Pause                                      | Esc                                                   | OPTIONS                                                                               |
| Menus                                      | Arrows, Enter to choose, Esc to go back               | D-pad or left stick: up / down a row, left / right change a setting; ✕ choose, ○ back |

**Menus with a controller.** Up and Down move a row at a time; Left and Right change the highlighted setting (or move across buttons that stand side by side); ✕ chooses and ○ goes back.

**Tool menu.** Hold Q (or L1 / LB and aim the right stick), then release to use the selection. It holds the winch (attach, detach, single line or snatch block), the front and rear diff locks, precision crawl, tyre pressures, the planks, the headlights, the hubs or centre diff, and the repair the car needs (Field repair, Plug the tyre or Fit a spare). An option that can't be used now is greyed out; picking it says why.

**Tyre pressures.** Open **Tools → Tyres** while stopped and choose **18 psi** for rock and mud, **24 psi** for trails or **36 psi** for the road. Lower pressures improve off-road grip and protect against sharp stones, but a soft tyre can roll off its rim in a hard corner. Letting down from 36 to 18 takes 12 seconds; the compressor takes 60 seconds to put that air back.

**Planks.** Choose **Place planks** in the tool menu, move them with W/S, turn them with A/D and place them with E; **Recall planks** brings them back.

**Manual gearbox (controller only).** Settings → **Gearbox** picks **Automatic** (the default) or **Manual** (you change gear with D-pad right and left and the clutch is worked for you). The row shows only while a controller is connected on a computer; the keyboard and touch always drive automatic.

**HUD.** A small group of dials (speedometer with the gear in a window, and TEMP), a compass, and warning lamps that show what is on (LOW, F LOCK, R LOCK, CRAWL, BRAKE, lights, WINCH) and what is wrong (STALLED, FLOODING, TEMP HIGH, a flat tyre, engine and body damage). Settings → **HUD style** picks Dash cluster, Edge lines or Field kit; **UI size** scales the whole interface; **Frame rate** picks 60 or the screen's own rate.

### Phones and tablets

On a touch screen the game shows on-screen controls, held sideways or upright. Settings → **Phone driving** chooses **Joystick only** (left and right steer, forward and back are throttle and brake; the default) or **Steer and pedals** (a steering stick plus GAS and BRAKE). **Joystick side** swaps the stick and the buttons. Graphics start on Medium, and Low and High can be chosen in Settings; a choice already saved is kept.

| Action                         | Touch                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| Steer                          | Joystick, bottom left, or right if swapped (part way for part lock) |
| Accelerate / brake and reverse | GAS / BRAKE, or the joystick forward / back in Joystick only        |
| Handbrake on / off             | HAND                                                                |
| Transfer case                  | 4WD, then 2H / 4H / 4L                                              |
| Precision crawl, diff locks    | 4WD, then CRAWL, F LOCK, R LOCK (tap 4WD again to tuck away)        |
| Winch, planks, hitch a trailer | USE (with several anchors: stick or tap to pick one, USE to hook)   |
| Winch in / out                 | Hold IN / OUT (shown while the winch is attached)                   |
| Right vehicle                  | Hold UPRIGHT (shown when needed)                                    |
| Tool menu                      | TOOLS, then tap an option (tap the space around it to close)        |
| Orbit camera / camera distance | Drag a finger on the view / pinch with two fingers                  |
| Cycle views / recenter camera  | View and Reset view, top right (icons when the phone is sideways)   |
| Map / pause / full screen      | MAP, II and ⛶, top left (lights are in TOOLS)                       |

### Headsets

The headset game has its own address: on a headset with its own browser (Meta Quest 3 or 3S), open **https://reidstephen11.github.io/4wd-simulator/vr**. Choose a drive as usual; the **Drive** press on the loading card puts the headset on. You sit in the driver's seat and drive with the hand controllers; menus stay in the browser window. The ordinary address never offers a headset.

| Action                         | Headset controllers                                |
| ------------------------------ | -------------------------------------------------- |
| Accelerate / brake and reverse | Right trigger / left trigger                       |
| Steer                          | Left stick                                         |
| Handbrake on / off             | X                                                  |
| Transfer: 2H / 4H / 4L         | Y                                                  |
| Use (winch, planks, notes)     | A                                                  |
| Right vehicle / back           | Hold B / B                                         |
| Tool menu                      | Hold left grip, point with the right stick, let go |
| Winch attach / detach          | Right grip                                         |
| Winch in / out                 | Right stick up / down                              |
| Horn                           | Right stick click                                  |
| Pause                          | Left stick click                                   |

## Driving tips

- Stop, then select **low range (L)** and **precision crawl (P)** before a climb or a descent: hold the accelerator and the car walks.
- Lock the diffs (Z front, X rear) below 5 km/h, before you need them. Unlock them on firm ground: a locked car does not want to turn.
- Spinning the wheels digs you in and cuts the ground up. Back off, pick another line, let the tyres down.
- **C** cycles the views: the front views look across the tyres to place a wheel, and the driver's seat has working mirrors.
- The winch (E) reaches any tree or marked rock within about 30 m. With more than one in reach, choose the one that pulls you along the line you want.
- Take water slowly. Above walking pace in deep water the bow wave floods the engine through the air intake; a flooded engine has to be cranked clear.
- A flat tyre pulls the car off line. Stop and fix it from the tool menu, or drive into a camp.
- Termite mounds are as hard as rock.

## Test mode

Add `?dev` to the address: https://reidstephen11.github.io/4wd-simulator/?dev. A panel on the right lets you set the clock and the weather, fine-tune the rain, the wet ground and how far the creek is up, start from any place on the map, change vehicle where you are, and hitch a box trailer (empty or with two drums) behind the car. Nothing is saved in test mode.

## Debug mode

Add `?debug` for an overlay (frame rate, draw calls, vehicle state, flooding, sound levels) and a panel with a free-fly camera (also the backtick key), collider wireframes, a teleport button for every place and live vehicle tuning sliders. Add `?bench` for the phone's headroom test: https://reidstephen11.github.io/4wd-simulator/?bench. Start a drive and leave it for about two and a half minutes. The car is parked at three places in turn (the Knoll track, the summit looking west, the ford) and the frame rate is timed while the load is put up step by step: a sharper picture, Medium and High graphics, the screen's full resolution, the whole picture drawn two, three and four times a frame, and High at full resolution drawn two and three times. The step where the frame rate first drops shows how much the phone has in hand. The results stay on screen to be sent as a screenshot.

## What to test

**v0.32**

Fixes from a code review.

- Ruts at speed: drive a muddy line fast, then slowly along it. The rut is a continuous groove, with no gaps where the car went fast; before, a fast pass left a rut with holes in it.
- Planks over a rut: in the bog hole, lay the recovery planks over a rut you have made and drive onto them. The car rides on the planks, not down in the rut below.
- On High graphics, the mud spray from four spinning wheels and the splash in the creek look as full as on Medium.

**v0.31**

Ruts you can feel.

- Pick **After rain** and drive the same line along a flat clay track five or six times, then drive it once more slowly with a light hand on the steering: does the car follow its own ruts? Steer gently to one side: does it resist, and then climb out when you steer more firmly? Is the pull too strong, too weak or about right?
- Look at the car from the side as it drives in deep ruts and then out onto untouched ground: does it sit a little lower in them?
- At the bog hole and in the bog trench: are they harder on the second and third attempt along the same line than on the first, and by about the right amount? Can you still get through each line you could before?
- On rock, gravel and dry clay nothing should feel different.
- Anything that feels like the steering tugging or shaking for no reason, on soft ground, is worth reporting: say where.

**v0.30**

Ruts you can see, and signs you can read (the signs carried over from Over the Cape v2.31).

- Ruts: pick **After rain** and drive the same line along a clay track three or four times (the loop to the bog hole is flat). Each pass, the wheel tracks look deeper: from a tread print to a darker, solid groove with soil pushed up along its edges. Look across them from the side and along them from behind.
- In **Clear** weather, drive through the mud at the edge of the bog hole twice: the same grooves in the mud. On dry clay, rock and gravel the marks stay flat prints, however often you drive them.
- In low sun (Morning or Late afternoon), does one wall of a deep rut look lit and the other shaded? Is the effect too strong, too weak or about right? Do the ruts look pressed in, or painted on?
- The car should drive exactly as before: the ruts are only drawn.
- On your phone on High: still smooth with a lot of ruts laid?
- Signs: drive up to a line's sign from the driver's seat. The lettering is larger, bolder and on up to three lines (**Rock climb / 8 gates / start uphill**); can you read it before you are level with it? From behind, the lettering is there too with the post not standing across it.

**v0.29**

Engines and mud, carried over from Over the Cape v2.28 to v2.30. Listen with headphones or good speakers.

- In any vehicle other than the Range Rover, the 40 Series and the LC79, hold a low gear flat out to the rev limit: the note builds over the last few hundred revs (more intake roar and valve noise) and then holds steady and strong, with no misfiring or cutting out. Try a petrol (the Hilux) and a diesel (the Troop Carrier or the Patrol).
- Camel Trophy Ninety: it revs cleanly to the top, where it used to break up above about 3,600 rpm.
- The tachometer needle runs about a tenth further round before the engine cuts (the 40 Series to 4,700, the Troop Carrier to 4,400, the Unimog to 3,100), and the red zone starts there. In Automatic at full throttle the gearbox holds each gear a little longer.
- Each vehicle feels a little stronger near the top of its revs, and no different crawling in low range at small throttle openings. Drive a line you know well on Ironbark: same line, same throttle.
- Range Rover: same rev limit (5,000) and the same sound, a little stronger at the top.
- 40 Series and LC79: they still bounce at the limit. Would you rather they howled like the rest?
- Mud: get bogged at the Bog Hole or in the bog trench and hold the throttle. The mud comes off as a spray of small flecks with the odd bigger clod, no football-sized lumps, and always flies backwards from each wheel in a forward gear, however the car rocks. In reverse it flies forwards.

**v0.28**

Vehicle fixes carried over from Over the Cape v2.27. Walk round each in the vehicle menu.

- Short-wheelbase 4WD (the code-built 40): the roof rack's legs come down outside the roof to three clamps on each gutter; the boards stop inside the rack's end rails; the jerry can is flat against the right rear door on a small tray, clear of the bumper.
- FJ40: the rear spare has a bar and a tee handle across its centre and a bracket from the body's left rear corner; there is a clear gap between the snorkel's head and the rack's front-left leg.
- Unimog: there is room for legs between the steering wheel and the seat, and the three dials still read through the wheel from the driver's seat. The roof hatch sits on a raised ring with hinges and a latch. The exhaust ends in a short stub ahead of the left rear tyre. The spare on the dropside has a three-armed clamp. The footwells have a wall under the dash, with no ground showing.
- Perentie: from behind, the spare is tucked up under the floor, a little left of centre, with no cradle under it; the exhaust ends under the left sill ahead of the left rear wheel. Backing off a ledge, the tail touches where the spare is drawn (a little sooner than before).
- Troop Carrier: the front wheel arch is dark all round behind the tyre.

**v0.27**

- Neutral: with Settings → Gearbox on Manual (controller), stand on dirt or sand in neutral and hold the throttle. The engine should rev and the wheels stay still, with no dust, no tyre marks and no digging in. In 1st, bogged in the bog hole, they should still spin.
- Seats: look into any vehicle from the side, or look round from the driver's seat. The seat backs should lean back, away from the steering wheel.
- Range Rover: from the side, the roo bar sits closer to the grille than before (14 cm).

**v0.26**

- Finer ground detail, best seen with the cockpit or bonnet camera or by stopping beside something: the stones of the rock garden and the rock climb, the mud of the bog hole, the creek bed at the ford, the faces of the boulders.
- On your phone on High: still smooth? If anything stutters, the headroom test (`?bench`) will show where.
- Tyre marks on grass: a faint darker green line now, not brown tread.

**v0.25**

- Tyre marks: drive off the track onto grass and look back; turn tightly and see four lines separate; spin the wheels on a climb and see the darker marks.
- Out of the ford or the bog hole: wet tracks for a few metres, on rock as well.
- On your phone on Medium or High: the marks should cost nothing you can feel.
- A note without a control now reads "Note" at its top, not "History".

**v0.24**

- On your phone: **Settings → Graphics → High** (your saved Low is kept until you change it). The picture should be much sharper, with smooth edges, and still run smoothly. Try Medium too.
- The headroom test again (`?bench`): two new lines under the summit, "High sharp, twice" and "High sharp, x3".

**v0.23**

- On your phone, the headroom test: open the game with `?bench` added to the address, start a drive, wait about two and a half minutes and send a screenshot of the results.
- The dials in all three HUD styles (Settings → HUD style): speedometer and TEMP, no FUEL.
- The tool menu: no jerry can entry.
- The ford's hint and note: "a little more throttle up the far bank".

**v0.22**

- The title, **New drive** and the loading card: they should say nothing about episodes, missions, fuel or packing.
- Each vehicle loads and drives, with its own cab (C cycles the views).
- The ford, in high range with open diffs.
- The deep crossing on the straight line, crawling; then the bar downstream.
- The chute going west with both lockers, then back east with the winch.
- The bog hole on a clear day, then **After rain**: it should need the winch.
- The rock climb's eight gates: a score shows at the top and the best is kept per vehicle.
- The drop, the steep descent and the side slope.
- Damage on Realistic: cut a tyre, then drive into a camp: it should be repaired and the spare and plugs restocked.
- **Pause → Restart from last camp** returns to the camp you last drove into.
- The note on first reaching an obstacle: small, top right, and kept under **Pause → Trip journal**.
- On a phone: the on-screen controls, the 4WD buttons, TOOLS, and Install app.
- Night and Dusk: the headlights (N).

## Project layout

| Path                | What is in it                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `src/core`          | The game loop, launch, saving, the HUD's state and the test hook                                  |
| `src/sim`           | The simulation: vehicle, drivetrain, tyres, damage, tools (winch, planks, jack), world generation |
| `src/render`        | Three.js drawing: terrain, water, vegetation, every vehicle body, cameras, particles, tyre marks  |
| `src/ui`            | Title and setup screens, loading card, HUD, pause menu, tool menu, paper map, touch controls      |
| `src/audio`         | Engine synthesis, tyres, winch, ambience                                                          |
| `src/data`          | Tuning and content: vehicles, surfaces, controls, environment, and `levels/` (the maps)           |
| `src/data/levels`   | Ironbark Creek: `ironbarkKnoll.ts`, `ironbarkCreek.ts`, `ironbarkMap.ts`, `ironbark.ts`           |
| `src/debug`         | Test mode panel, debug overlay, free camera, the phone benchmark                                  |
| `tests`             | Unit and headless physics tests; `tests/ironbark.test.ts` drives every line of the level          |
| `e2e`               | Browser tests (Playwright)                                                                        |
| `scripts`           | Dev helpers, run with `npx vite-node scripts/<name>.ts` (below)                                   |
| `docs/DECISIONS.md` | What was asked for and decided, version by version                                                |

Level-building helpers: `level-drive.ts` drives each line with the autopilot, locked and open, and prints how it went; `level-heights.ts` prints the heights where lines join the loop; `track-profile.ts` prints a track's grade, water and surface every few metres; `map-preview.ts` draws the map from above; `shoot.ts` and `flow-shots.ts` take screenshots of the game and of the screens on the way into a drive.

The engine keeps Over the Cape's names: a level is an `EpisodeDef` (`src/data/episodes.ts`), and a playground is one with no `goal`. This keeps engine changes easy to carry across from that game.

## Deployment

GitHub Actions builds and deploys `main` to GitHub Pages (`.github/workflows/deploy.yml`). Every update adds 0.01 to `GAME_VERSION` in `src/core/buildInfo.ts`.

## What's next

- Pushing the graphics further: finer plants.
- More playground levels.
