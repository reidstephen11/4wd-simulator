/**
 * Playtest drive: the real game in headless Chromium, driven along named tracks by the
 * autopilot, saving what the player sees every few metres with a log of how the drive went.
 * The pictures are for a reviewer to read (road edges, ground detail changing ahead, the
 * vehicle's shape from the driving camera, the HUD's size and what it covers); the log's
 * numbers say how hard the section was.
 *
 * Usage (against `npx vite build && npx vite preview --port 4173`):
 *   npx vite-node scripts/playtest.ts <outDir> [view=desktop|phone|portrait] [quality=low|medium|high]
 *     [tracks=camp-spur,creek-ford] [every=20] [speed=8] [vehicle=<id>]
 *     [steps=30] [max=0] [url=http://localhost:4173/]
 * view=phone is a phone held sideways (844x390), view=portrait one held upright (390x844).
 * PW_CHROMIUM names another Chromium than the pinned Playwright's own.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: playtest.ts <outDir> [key=value...]');
const arg = (key: string, fallback: string) =>
  rest.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const view = arg('view', 'desktop');
const quality = arg('quality', 'medium');
const tracks = arg('tracks', 'camp-spur,creek-ford').split(',');
const every = Number(arg('every', '20'));
const speed = Number(arg('speed', '8'));
const url = arg('url', 'http://localhost:4173/');
/** Stop after this many metres (0: drive to the end), for a short close-spaced run of frames. */
const maxMetres = Number(arg('max', '0'));
/** Sim seconds without 2 m of progress before the drive is called stuck. */
const STUCK_AFTER = 45;
/** Physics steps per drawn frame: the software renderer is far slower than real time. */
const STEPS_PER_FRAME = Number(arg('steps', '30'));

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage(
  view === 'phone'
    ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }
    : view === 'portrait'
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1280, height: 720 } },
);
await page.addInitScript((quality) => {
  localStorage.setItem(
    '4wdsim.save.v2',
    JSON.stringify({
      version: 1,
      settings: { quality },
      unlocked: ['perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'lc79', 'sooty80'],
    }),
  );
}, quality);
// A frame on the software renderer can take seconds, and a screenshot waits for one.
page.setDefaultTimeout(180_000);
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url);
await page.locator('.welcome').waitFor({ state: 'visible' });
const begin = page.locator('[data-title-begin]');
if (await begin.isVisible()) await begin.click();
const journey = page.locator('[data-title-journey]');
if (await journey.isVisible()) await journey.click();
await page.screenshot({ path: `${outDir}/00-setup.png` });
await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
const briefing = page.locator('[data-briefing-drive]:not(.hidden)');
await briefing.waitFor({ timeout: 300_000 });
await page.screenshot({ path: `${outDir}/01-briefing.png` });
await briefing.click();
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 300_000 });
await page.screenshot({ path: `${outDir}/02-arrived.png` });
await page.evaluate(() => {
  if (window.__game!.vehicle().engineOff) window.__game!.startEngine();
});
await page.waitForFunction(
  () => {
    document.querySelector<HTMLElement>('.history-card.reading')?.click();
    return window.__game!.vehicle().engineRunning;
  },
  null,
  { timeout: 300_000, polling: 100 },
);
await page.evaluate(
  ({ tracks, speed, steps }) => {
    window.__game!.setStepsPerFrame(steps);
    window.__game!.autopilotTracks(tracks, speed);
  },
  { tracks, speed, steps: STEPS_PER_FRAME },
);

interface Sample {
  shot: string;
  t: number;
  travelled: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  range: string;
  lockers: string;
  tilt: number;
  terrainLod: number[];
}
const samples: Sample[] = [];
const read = () =>
  page.evaluate(() => {
    document.querySelector<HTMLElement>('.history-card.reading')?.click();
    const g = window.__game!;
    return { v: g.vehicle(), t: g.simTime(), a: g.autopilotState(), lod: g.stats().terrainLod };
  });
let last = await read();
const t0 = last.t;
let travelled = 0;
let nextShot = 0;
let slowTime = 0;
let lowRangeTime = 0;
let maxTilt = 0;
// Progress is getting nearer the end of the path: a car afloat in a river moves without it.
let progressAt = { t: last.t, remaining: last.a.remaining };
let outcome = 'finished';
for (;;) {
  const now = await read();
  const dt = now.t - last.t;
  travelled += Math.hypot(now.v.x - last.v.x, now.v.z - last.v.z);
  if (Math.abs(now.v.speed) < 0.5) slowTime += dt;
  if (now.v.range === 'low') lowRangeTime += dt;
  maxTilt = Math.max(maxTilt, now.v.tilt);
  if (now.a.remaining < progressAt.remaining - 2) progressAt = { t: now.t, remaining: now.a.remaining };
  const stuck = now.t - progressAt.t > STUCK_AFTER;
  if (travelled >= nextShot || now.a.done || stuck) {
    const shot = `${String(samples.length).padStart(3, '0')}-${Math.round(travelled)}m${stuck ? '-stuck' : ''}.png`;
    await page.screenshot({ path: `${outDir}/${shot}` });
    samples.push({
      shot,
      t: +(now.t - t0).toFixed(1),
      travelled: +travelled.toFixed(1),
      x: +now.v.x.toFixed(1),
      y: +now.v.y.toFixed(1),
      z: +now.v.z.toFixed(1),
      speed: +now.v.speed.toFixed(2),
      range: now.v.range,
      lockers: `${now.v.frontLocked ? 'F' : '-'}${now.v.rearLocked ? 'R' : '-'}`,
      tilt: +now.v.tilt.toFixed(1),
      terrainLod: now.lod,
    });
    console.log(JSON.stringify(samples[samples.length - 1]));
    nextShot = travelled + every;
  }
  last = now;
  if (now.a.done) break;
  if (maxMetres > 0 && travelled >= maxMetres) {
    outcome = `stopped at ${maxMetres} m as asked`;
    break;
  }
  if (stuck) {
    outcome = `stuck ${Math.round(now.a.remaining)} m short of the end`;
    break;
  }
  await page.waitForTimeout(100);
}
const seconds = last.t - t0;
const summary = {
  view,
  quality,
  tracks,
  outcome,
  seconds: +seconds.toFixed(1),
  metres: +travelled.toFixed(1),
  averageSpeed: +(travelled / seconds).toFixed(2),
  /** Seconds at under 0.5 m/s: stopped, spinning or bogged. */
  slowSeconds: +slowTime.toFixed(1),
  lowRangeSeconds: +lowRangeTime.toFixed(1),
  maxTiltDeg: +maxTilt.toFixed(1),
  errors,
};
writeFileSync(`${outDir}/log.json`, JSON.stringify({ summary, samples }, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
