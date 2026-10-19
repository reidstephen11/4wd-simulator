import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitEngine } from './helpers';

test('the welcome screen chooses the world, vehicle, time of day and weather, and remembers them', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const drive = page.locator('[data-welcome-drive]');
  await expect(drive).toBeVisible();
  const on = (group: string) => page.locator(`.welcome-option.on[data-group="${group}"]`);
  // First time: the High Country in the short-wheelbase 4WD on a clear late afternoon.
  await expect(on('map')).toHaveAttribute('data-value', 'high-country');
  await expect(on('vehicle')).toHaveAttribute('data-value', 'shortie');
  await expect(on('time')).toHaveAttribute('data-value', 'afternoon');
  await expect(on('weather')).toHaveAttribute('data-value', 'clear');

  await page.getByRole('button', { name: /Ironbark 4WD Park/ }).click();
  await page.getByRole('button', { name: /Land Rover 110 Perentie/ }).click();
  await page.getByRole('button', { name: 'Dusk' }).click();
  await page.getByRole('button', { name: 'Raining' }).click();
  await expect(page.locator('.welcome-note')).toContainText('Rain');
  await shot(page, 'welcome', 'welcome-screen');
  await drive.click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
  await waitEngine(page);
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('ironbark-park');
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  expect(await page.evaluate(() => window.__game!.conditions())).toEqual({
    time: 'dusk',
    weather: 'rain',
    wetness: 1,
    rain: 1,
  });
  // The Drive click started the sound, and it is raining.
  await expect.poll(async () => (await page.evaluate(() => window.__game!.audio())).state).toBe('running');
  await shot(page, 'welcome', 'dusk-rain-park');

  // Pause menu → Main menu returns to the welcome screen with the same choices.
  await page.keyboard.press('Escape');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: /^Main menu/ }).click()]);
  await expect(drive).toBeVisible();
  await expect(on('map')).toHaveAttribute('data-value', 'ironbark-park');
  await expect(on('vehicle')).toHaveAttribute('data-value', 'perentie');
  await expect(on('time')).toHaveAttribute('data-value', 'dusk');
  await expect(on('weather')).toHaveAttribute('data-value', 'rain');
  // Drive has the focus, so Enter goes straight back in.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('ironbark-park');
  expect(errors).toEqual([]);
});
