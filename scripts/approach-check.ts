/**
 * Approach check: what the ground ahead will redraw as the car drives up to it. Parks the car
 * at points along named tracks and saves the driver's view three times from the same spot:
 * twice as the game draws it (`-a1`, `-a2`: whatever differs between those is wind, water
 * and dust, not the ground), then once with every terrain chunk in sight at its finest
 * detail (`-b`), which is how that ground will look once the car is on it. Where `a2` and
 * `b` differ, the player sees the ground change shape or colour ahead of the car.
 * `scripts/approach-diff.py` measures the difference and lays the pictures side by side.
 *
 * Usage (against `npx vite build && npx vite preview --port 4173`):
 *   npx vite-node scripts/approach-check.ts <outDir> [tracks=knoll-loop] [every=150] [max=10]
 *     [quality=low] [view=desktop|tv|portrait] [url=http://localhost:4173/]
 * PW_CHROMIUM names another Chromium than the pinned Playwright's own.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: approach-check.ts <outDir> [key=value...]');
const arg = (key: string, fallback: string) =>
  rest.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const tracks = arg('tracks', 'knoll-loop').split(',');
const every = Number(arg('every', '150'));
const max = Number(arg('max', '10'));
const quality = arg('quality', 'low');
const view = arg('view', 'desktop');
const url = arg('url', 'http://localhost:4173/');
/** Far enough that every chunk the camera can make out is at its finest. */
const FULL_DETAIL: [number, number, number] = [450, 600, 800];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage(
  view === 'portrait'
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: view === 'tv' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 } },
);
page.setDefaultTimeout(300_000);
await page.addInitScript((quality) => {
  localStorage.setItem(
    '4wdsim.save.v2',
    JSON.stringify({
      version: 1,
      // Mirrors and head motion off: neither is the ground, and both move between frames.
      settings: { quality, mirrors: false, headMotion: false },
      unlocked: ['perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'lc79', 'sooty80'],
    }),
  );
}, quality);
await page.goto(url);
await page.locator('.welcome').waitFor({ state: 'visible' });
const begin = page.locator('[data-title-begin]');
if (await begin.isVisible()) await begin.click();
const journey = page.locator('[data-title-journey]');
if (await journey.isVisible()) await journey.click();
await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
const briefing = page.locator('[data-briefing-drive]:not(.hidden)');
await briefing.waitFor({ timeout: 600_000 });
await briefing.click();
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 600_000 });

const frames = (n: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
/** Wait until the car has settled on its springs and the camera behind it has stopped moving. */
async function settle(): Promise<void> {
  let last = [0, 0, 0];
  for (let i = 0; i < 80; i++) {
    await frames(2);
    const p = await page.evaluate(() => window.__game!.camera().position);
    if (i > 3 && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.002) return;
    last = p;
  }
}

const samples: Record<string, unknown>[] = [];
for (const id of tracks) {
  const pts = await page.evaluate((id) => window.__game!.trackPoints(id), id);
  let run = 0;
  let next = 40;
  let taken = 0;
  for (let k = 1; k < pts.length - 4 && taken < max; k++) {
    run += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (run < next) continue;
    next += every;
    taken++;
    const [x, z] = pts[k];
    const heading = ((Math.atan2(pts[k + 4][0] - x, -(pts[k + 4][1] - z)) * 180) / Math.PI + 360) % 360;
    await page.evaluate(
      ({ x, z, heading }) => {
        const g = window.__game!;
        g.teleport(x, z, heading);
        // The handbrake alone: the brake pedal held at a standstill selects reverse.
        g.setInput({ throttle: 0, brake: 0, handbrake: true });
        g.setStepsPerFrame(6);
      },
      { x, z, heading },
    );
    await settle();
    const name = `${id}-${String(Math.round(run)).padStart(4, '0')}m`;
    await page.evaluate(() => window.__game!.terrainLod(null));
    await frames(4);
    await page.screenshot({ path: `${outDir}/${name}-a1.png` });
    await frames(3);
    await page.screenshot({ path: `${outDir}/${name}-a2.png` });
    const normal = await page.evaluate(() => window.__game!.stats().terrainLod);
    await page.evaluate((d) => window.__game!.terrainLod(d), FULL_DETAIL);
    await frames(4);
    await page.screenshot({ path: `${outDir}/${name}-b.png` });
    const full = await page.evaluate(() => window.__game!.stats().terrainLod);
    await page.evaluate(() => window.__game!.terrainLod(null));
    samples.push({
      name,
      track: id,
      along: Math.round(run),
      x,
      z,
      heading: Math.round(heading),
      chunks: { normal, full },
    });
    console.log(`${name}: chunks by level ${normal.join('/')} → ${full.join('/')}`);
    writeFileSync(`${outDir}/approach.json`, JSON.stringify({ quality, view, samples }, null, 2));
  }
}
await browser.close();
