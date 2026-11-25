# Working on this repo

The game is a playground of 4WD challenges: small levels (`src/data/levels`) with no route, clock or fuel. Since v0.22 it runs on the code of Over the Cape (`reidstephen11/over-the-cape`). The engine keeps that game's names (a level is an `EpisodeDef`; a playground is one with no `goal`) so that engine and vehicle changes there can be carried across: keep engine files close to Over the Cape's, and put this game's own work in the levels, the graphics and the menus. The vehicles are modelled in Over the Cape, where their reference photographs are; do not reshape a body here.

The owner never wants steering-wheel or pedal support, or manual shift buttons on phones. Do not implement or propose either feature.

After changing a level, run `npx vite-node scripts/level-drive.ts` (every line, locked and open) and `npx vitest run tests/ironbark.test.ts`, and look at the changed ground in the browser (`scripts/shoot.ts`) before shipping.

## Shipping every update

The owner wants every finished update merged into `main` and published, without being asked each time. GitHub Actions deploys `main` to GitHub Pages.

For each update:

1. Add 0.01 to `GAME_VERSION` in `src/core/buildInfo.ts`, one step past the version on `main`.
2. Add a section for that version to `docs/DECISIONS.md` and update `README.md` (features, controls and the "What to test" checklist).
3. Run `npm run lint`, `npm test` and `npm run build`, and `npm run test:e2e` when the change touches the page or the HUD. All must pass.
4. Open a pull request into `main`, wait for its checks to pass, then merge it.
5. Tell the owner the new version is live at https://reidstephen11.github.io/4wd-simulator/ once the deploy run has finished.
