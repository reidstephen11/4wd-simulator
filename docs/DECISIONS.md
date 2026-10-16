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
