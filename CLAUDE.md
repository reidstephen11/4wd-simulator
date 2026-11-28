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

## Running the full tests

The full unit suite takes about 25 minutes and reads the source files as it goes, so editing while it runs can give a result that matches neither version. Run it in a separate checkout of the code you mean to test (`git worktree add --detach ../<repo>-verify origin/main`, then link `node_modules` across), and keep working in the main one. For screenshots, `scripts/shoot.ts` has a `start` step that starts the engine before a scripted drive, and fails if a shader does not compile.

## Agent skills

Matt Pocock's skills (https://github.com/mattpocock/skills) are in `.claude/skills`, copied unchanged; `/ask-matt` says which one fits a situation. The usual path for an idea is `/grill-with-docs`, then `/to-spec`, `/to-tickets`, `/implement` for each ticket, and `/retro`.

### Issue tracker

Specs and tickets are GitHub issues on `reidstephen11/4wd-simulator`; the "What's next" list in `README.md` stays the list of ideas not yet started. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root, written as terms are settled, and decisions in `docs/DECISIONS.md`. See `docs/agents/domain.md`.

### Where this repo's rules come first

- **Grilling:** the owner wants one question at a time, each with a recommended answer that "yes" accepts. Do not ask a whole round at once.
- **Shipping:** a ticket that changes the game is one update and ships by "Shipping every update" above.
- **Engine and vehicles:** a ticket that changes the engine or a vehicle belongs in Over the Cape first and is carried across.
- **Docs-only changes** (specs, glossary, these settings) need no version number.
