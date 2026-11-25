import { expect, test } from '@playwright/test';
import { openJourney, collectErrors, lowGraphics, shot, waitReady, waitSim } from './helpers';

test('M2: keyboard drives the car and the chase camera follows', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?debug&surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
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

  // Range toggle. Range only changes below 20 km/h, so stop on the park brake first:
  // holding S brakes and then reverses, and could leave the car above it.
  await page.keyboard.press('Space');
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.__game!.vehicle())).speed))
    .toBeLessThan(0.5);
  await page.keyboard.press('KeyL');
  await waitSim(page, 0.3);
  expect((await page.evaluate(() => window.__game!.vehicle())).range).toBe('low');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__game!.parkBrake())).toBe(false);

  // Up Big Red's red clay in low range, and along the range through the rainforest.
  await page.evaluate(() => window.__game!.teleport(7, 1262, 330));
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await waitSim(page, 6);
  await shot(page, 'M2', 'big-red-low-range');
  await page.evaluate(() => window.__game!.setInput(null));
  await page.evaluate(() => window.__game!.teleport(-16, 727, 310));
  await page.waitForTimeout(1500);
  await shot(page, 'M2', 'rainforest-chase');
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
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
  const a = await page.evaluate(() => window.__game!.vehicle());
  await waitSim(page, 4);
  const b = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(2);
});
