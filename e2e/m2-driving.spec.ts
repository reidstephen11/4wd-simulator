import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('M2: keyboard drives the car and the chase camera follows', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/?debug');
  await waitReady(page);
  // Simulate up to a second per frame: the software renderer takes seconds per frame.
  await page.evaluate(() => window.__game!.setCatchUp(true));
  await page.waitForTimeout(1000);
  await shot(page, 'M2', 'spawn-chase-camera');
  const start = await page.evaluate(() => window.__game!.vehicle());
  await page.keyboard.down('KeyW');
  await waitSim(page, 5);
  await shot(page, 'M2', 'driving');
  await page.keyboard.down('KeyD');
  await waitSim(page, 1.5);
  await shot(page, 'M2', 'turning');
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(3);

  // Range toggle.
  await page.keyboard.down('KeyS');
  await waitSim(page, 3);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyL');
  await waitSim(page, 0.3);
  expect((await page.evaluate(() => window.__game!.vehicle())).range).toBe('low');

  // The Staircase in low range, and the view from the ridge.
  await page.evaluate(() => window.__game!.teleport(48, -86, 340));
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await waitSim(page, 6);
  await shot(page, 'M2', 'staircase-low-range');
  await page.evaluate(() => window.__game!.setInput(null));
  await page.evaluate(() => window.__game!.teleport(-300, 110, 230));
  await page.waitForTimeout(1500);
  await shot(page, 'M2', 'valley-chase');
  expect(errors).toEqual([]);
});

test('M2: a gamepad drives the car', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    buttons[7] = { pressed: true, touched: true, value: 1 }; // RT
    const pad = {
      id: 'mock',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: 0,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await page.goto('/');
  await waitReady(page);
  const a = await page.evaluate(() => window.__game!.vehicle());
  await waitSim(page, 4);
  const b = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(2);
});
