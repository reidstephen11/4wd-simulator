import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot, waitFrames, waitReady } from './helpers';

type Stats = Awaited<ReturnType<NonNullable<Window['__game']>['stats']>>;

const stats = (page: Page) => page.evaluate(() => window.__game!.stats());
const vehicle = (page: Page) => page.evaluate(() => window.__game!.vehicle());

/** Write a JSON report next to the screenshots when SCREENSHOTS names M7. */
function report(name: string, data: unknown): void {
  const wanted = (process.env.SCREENSHOTS ?? '').split(',').includes('M7');
  const dir = wanted ? 'docs/screenshots/M7' : 'test-results/screenshots/M7';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2) + '\n');
}

function summary(values: number[]): { min: number; median: number; max: number } {
  const s = [...values].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { min: r(s[0]), median: r(s[s.length >> 1]), max: r(s[s.length - 1]) };
}

test('M7: dust, mud spray, splash and wake', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/?debug');
  await waitReady(page);
  // Simulate up to a second per frame: the software renderer takes seconds per frame.
  await page.evaluate(() => window.__game!.setCatchUp(true));

  // Dust on the dry main track.
  await page.evaluate(() => window.__game!.teleport(-262, 152, 323));
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await expect.poll(async () => (await vehicle(page)).speed, { timeout: 200_000 }).toBeGreaterThan(9);
  await expect.poll(async () => (await stats(page)).particles).toBeGreaterThan(10);
  await shot(page, 'M7', 'dust-trail');

  // Mud spray in the Bog Hole.
  await page.evaluate(() => window.__game!.teleport(174, 3, 95));
  await expect.poll(async () => (await stats(page)).particles).toBe(0);
  await expect.poll(async () => (await stats(page)).particles, { timeout: 60_000 }).toBeGreaterThan(10);
  await page.waitForTimeout(2000);
  await shot(page, 'M7', 'mud-spray');

  // Splash and wake at the Deep Crossing.
  await page.evaluate(() => window.__game!.teleport(4, 100, 17));
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await expect.poll(async () => (await vehicle(page)).z, { timeout: 200_000 }).toBeLessThan(66);
  await shot(page, 'M7', 'splash-and-wake');
  await page.evaluate(() => window.__game!.setInput(null));
  expect(errors).toEqual([]);
});

test('M7: quality presets and rendering load across the map', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await page.goto('/?debug');
  await waitReady(page);

  // The same view on each preset.
  const presets: Record<string, Stats> = {};
  await page.evaluate(() => window.__game!.teleport(-170, 236, 320));
  for (const q of ['low', 'medium', 'high'] as const) {
    await page.evaluate((q) => window.__game!.setQuality(q), q);
    await page.waitForTimeout(3000);
    await waitFrames(page);
    presets[q] = await stats(page);
    await shot(page, 'M7', `quality-${q}`);
  }
  expect(presets.low.triangles).toBeLessThan(presets.high.triangles);
  await page.evaluate(() => window.__game!.setQuality('medium'));

  // Rendering load on a grid over the whole playable area (Medium).
  const grid: Array<{ x: number; z: number } & Stats> = [];
  for (let z = -600; z <= 600; z += 200)
    for (let x = -600; x <= 600; x += 200) {
      await page.evaluate(([x, z]) => window.__game!.teleport(x, z, 0), [x, z]);
      await page.waitForTimeout(1200);
      await waitFrames(page);
      grid.push({ x, z, ...(await stats(page)) });
    }
  const load = {
    drawCalls: summary(grid.map((g) => g.calls)),
    triangles: summary(grid.map((g) => g.triangles)),
  };
  report('render-load', { presets, mediumAcrossMap: load, grid });
  console.log('Medium across the map:', JSON.stringify(load));
  // Budgets that keep Medium within reach of a 2022 integrated GPU. They were 180 calls
  // and 650k triangles until the detailed vehicle (docs/DECISIONS.md, v0.21).
  expect(load.drawCalls.max).toBeLessThan(210);
  expect(load.triangles.max).toBeLessThan(760_000);
  expect(errors).toEqual([]);
});

test('M7: 5-minute scripted drive across the map with no console errors', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await page.goto('/?debug');
  await waitReady(page);
  // Simulate up to a second per frame: the software renderer takes seconds per frame.
  await page.evaluate(() => window.__game!.setCatchUp(true));
  await page.keyboard.press('KeyH'); // start audio so it is part of the run

  // Legs along long tracks in different parts of the map.
  const legs = ['old-mine', 'granite-tors', 'gravel-ford', 'dingo-gap', 'mountain-hut'];
  const samples: Array<{ t: number; leg: string; x: number; z: number; speed: number } & Stats> = [];
  const start = Date.now();
  const simStart = await page.evaluate(() => window.__game!.simTime());
  // Legs are timed in simulated seconds: a slow renderer must not cut them short.
  const simNow = async () => (await page.evaluate(() => window.__game!.simTime())) - simStart;
  let leg = -1;
  let legStart = 0;
  let lastMove = { t: 0, x: 0, z: 0 };
  let distance = 0;
  let prev: { x: number; z: number } | null = null;
  const shots = new Set<number>();
  while (Date.now() - start < 5 * 60_000) {
    const now = (Date.now() - start) / 1000;
    const sim = await simNow();
    const ap = await page.evaluate(() => window.__game!.autopilotState());
    const v = await vehicle(page);
    if (Math.hypot(v.x - lastMove.x, v.z - lastMove.z) > 2) lastMove = { t: sim, x: v.x, z: v.z };
    const stuck = sim - lastMove.t > 20;
    if (leg < 0 || ap.done || sim - legStart > 75 || stuck) {
      leg = (leg + 1) % legs.length;
      legStart = sim;
      lastMove = { t: sim, x: Infinity, z: Infinity };
      prev = null;
      await page.evaluate((id) => window.__game!.autopilot(id, 320, 9), legs[leg]);
      continue;
    }
    if (prev) distance += Math.hypot(v.x - prev.x, v.z - prev.z);
    prev = { x: v.x, z: v.z };
    samples.push({
      t: Math.round(now),
      leg: legs[leg],
      x: v.x,
      z: v.z,
      speed: v.speed,
      ...(await stats(page)),
    });
    if (sim - legStart > 25 && !shots.has(leg) && shots.size < 4) {
      shots.add(leg);
      await shot(page, 'M7', `drive-${legs[leg]}`);
    }
    await page.waitForTimeout(3000);
  }
  await page.evaluate(() => window.__game!.autopilot(null));
  // Judge the distance against simulated time, which can still fall behind real time.
  const simSeconds = await simNow();
  const run = {
    seconds: 300,
    simulatedSeconds: Math.round(simSeconds),
    distanceDriven: Math.round(distance),
    fps: summary(samples.map((s) => s.fps)),
    frameMs: summary(samples.map((s) => s.frameMs)),
    simMs: summary(samples.map((s) => s.simMs)),
    drawCalls: summary(samples.map((s) => s.calls)),
    triangles: summary(samples.map((s) => s.triangles)),
  };
  report('scripted-drive', { ...run, samples });
  console.log('Scripted drive:', JSON.stringify(run));
  expect(errors).toEqual([]);
  // Average at least 3 m/s including leg starts (the autopilot cruises at 9 m/s).
  expect(distance).toBeGreaterThan(3 * simSeconds);
});

test('M7: ground cover stays drawn after driving away from camp', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await waitReady(page);
  const cover = () =>
    page.evaluate(() => window.__game!.breakdown()['vegetation/ground-cover']?.triangles ?? 0);
  await expect.poll(cover).toBeGreaterThan(0);
  // About 380 m east of camp, facing away from it.
  await page.evaluate(() => window.__game!.teleport(196, 340, 60));
  await expect.poll(cover, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
