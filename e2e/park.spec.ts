import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('changes map to Ironbark 4WD Park from the pause menu, keeps progress, and latches the handbrake', async ({
  page,
}) => {
  // Loads two worlds on the software renderer.
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('high-country');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Location/ }).click();
  const park = page.getByRole('button', { name: /Ironbark 4WD Park/ });
  await expect(park).toBeVisible();
  await Promise.all([page.waitForEvent('load'), park.click()]);
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('ironbark-park');
  // Starts at Park HQ, facing the loop.
  const v = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(v.x, v.z - 208)).toBeLessThan(3);
  expect(await page.evaluate(() => window.__game!.lastCampsite())).toBe('park-hq');

  // Space pulls the handbrake on and leaves it on; the next press lets it off.
  await page.locator('#game-canvas').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.status-park')).toBeVisible();
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.5 }));
  await waitSim(page, 2);
  await expect(page.getByText('Release the handbrake')).toBeVisible();
  const held = await page.evaluate(() => window.__game!.vehicle());
  await page.evaluate(() => window.__game!.setInput(null));
  await page.keyboard.press('Space');
  await expect(page.locator('.status-park')).toBeHidden();
  expect(Math.hypot(held.x - v.x, held.z - v.z)).toBeLessThan(2);
  await shot(page, 'park', 'park-hq');

  // Back to the High Country: its progress was kept.
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.__game!.setMap('high-country'))]);
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('high-country');
  expect(await page.evaluate(() => window.__game!.lastCampsite())).toBe('river-flat-camp');
  expect(errors).toEqual([]);
});
