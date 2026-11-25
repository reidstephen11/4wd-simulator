import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, openJourney, waitReady } from './helpers';
import { mkdirSync } from 'node:fs';

// fj40-blender-test: the shortie drawn from public/models/fj40.glb loads and drives cleanly.
test('Blender FJ40 GLB is the shortie, with no console errors', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=dry');
  await openJourney(page);
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('shortie');
  expect(logs.some((l) => l.includes('[fj40] Blender GLB loaded'))).toBe(true);
  const dir = 'test-results/fj40';
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/chase.png` });
  // Orbit round to the front quarter.
  await page.mouse.move(300, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 320, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => window.__game!.setInput({ steer: 1, handbrake: true }));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/orbit-steer.png` });
  // Drive a little: wheels spin.
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6, steer: 0, handbrake: false }));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${dir}/driving.png` });
  expect(errors).toEqual([]);
});

test('Blender FJ40 takes another paint colour', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=dry&fj40paint=b22d1f');
  await openJourney(page);
  await waitReady(page);
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await page.mouse.move(300, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(650, 320, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(3000);
  mkdirSync('test-results/fj40', { recursive: true });
  await page.screenshot({ path: 'test-results/fj40/paint-red.png' });
  expect(errors).toEqual([]);
});
