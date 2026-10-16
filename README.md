# 4WD Simulator

A relaxed, single-player off-road exploration game that runs in the browser. Drive a classic short-wheelbase 4WD through a patch of Australian high country, using a winch, planks and careful line choice to get over rough ground. No races, no scores — just the drive and what's over the next hill.

Built with Three.js, Rapier physics and TypeScript. Everything (including the sound) is generated in code; there are no asset files.

## Play

**Online:** https://reidstephen11.github.io/4wd-simulator/ (deployed from the `claude/quirky-cori-b7b0s8` branch by GitHub Actions).

**Locally:**

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (static site in `dist/`), `npm run preview`, `npm run lint`, `npm test` (Vitest), `npm run test:e2e` (Playwright).

## Debug mode

Add `?debug` to the URL (e.g. `http://localhost:5173/?debug`) for the debug overlay: FPS and frame-time graph, draw calls and triangle count.
