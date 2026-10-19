import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('swaps to the Bush Tucker Man Land Rover from the pause menu and remembers it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('shortie');
  const before = await page.evaluate(() => window.__game!.vehicle());

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Vehicle/ }).click();
  await expect(page.getByRole('button', { name: /Land Rover 110 Perentie/ })).toBeVisible();
  await page.getByRole('button', { name: /Land Rover 110 Perentie/ }).click();
  await expect.poll(() => page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  await waitSim(page, 1);
  const after = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1.5);
  expect(after.tilt).toBeLessThan(15);

  // It drives, and the choice is saved.
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput({ throttle: 0, brake: 1 }));
  await waitSim(page, 2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'perentie-in-game');
  await page.reload();
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');

  await page.evaluate(() => window.__game!.setVehicle('shortie'));
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('shortie');
  expect(errors).toEqual([]);
});
