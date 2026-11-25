import { expect, test } from '@playwright/test';
import { openJourney, collectErrors, driveFromBriefing, lowGraphics, shot, waitEngine } from './helpers';

test('the welcome screen offers the level, vehicle, damage and conditions, then the briefing, and remembers them', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/');
  await openJourney(page);
  const drive = page.locator('[data-welcome-drive]');
  await expect(drive).toBeVisible();
  await expect(drive).toHaveText('Load level');
  const on = (group: string) => page.locator(`.welcome-option.on[data-group="${group}"]`);
  // First time: Ironbark Creek in the short-wheelbase 4WD on mild damage, a clear late afternoon.
  await expect(on('episode')).toHaveAttribute('data-value', 'ironbark');
  await expect(on('vehicle')).toHaveAttribute('data-value', 'shortie');
  await expect(on('damage')).toHaveAttribute('data-value', 'mild');
  await expect(on('time')).toHaveAttribute('data-value', 'afternoon');
  await expect(on('weather')).toHaveAttribute('data-value', 'clear');
  // A playground: no story conditions, no packing, and before a camp is saved only one way to start.
  await expect(page.locator('[data-group="time"][data-value="story"]')).toHaveCount(0);
  await expect(page.locator('[data-group="pack"]')).toHaveCount(0);
  await expect(page.locator('[data-group="start"]')).toHaveCount(0);
  await expect(page.locator('.welcome-kicker')).toHaveText('Playground');

  await page.getByRole('button', { name: /Land Rover 110 Perentie/ }).click();
  await page.locator('[data-group="damage"][data-value="realistic"]').click();
  await expect(page.locator('.damage-note')).toContainText('spare');
  await page.locator('[data-group="time"][data-value="morning"]').click();
  await page.locator('[data-group="weather"][data-value="wet"]').click();
  await shot(page, 'welcome', 'welcome-screen');
  await drive.click();

  // The briefing names the level and the conditions while the map builds: no episode, mission or fuel.
  const briefing = page.locator('.briefing');
  await expect(briefing.locator('h2')).toHaveText('Ironbark Creek');
  await expect(briefing).toContainText('Morning · After rain');
  await expect(briefing).not.toContainText('Episode');
  await page.locator('[data-briefing-drive]:not(.hidden)').waitFor({ timeout: 300_000 });
  await expect(page.locator('.briefing-text')).not.toBeVisible();
  const about = page.getByText('About this level', { exact: true });
  await about.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.briefing-text')).toBeVisible();
  await expect(page.locator('.briefing-text')).toContainText('rock climb');
  await expect(page.locator('.briefing-facts')).toContainText('No fuel is used');
  await expect(page.locator('.briefing-facts')).toContainText('a wrecked engine');
  expect(await page.evaluate(() => window.__game?.ready)).not.toBe(true);
  await about.click();
  await shot(page, 'welcome', 'briefing');
  await driveFromBriefing(page);
  expect(await page.evaluate(() => window.__game!.episodeId())).toBe('ironbark');
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  expect(await page.evaluate(() => window.__game!.conditions())).toMatchObject({ weather: 'wet' });
  // No clock, and the spares and plugs on board.
  await expect(page.locator('.mission-clock')).toHaveText('');
  await expect(page.locator('.status-supplies')).toContainText('×3');
  // The Drive click started the sound.
  await expect.poll(async () => (await page.evaluate(() => window.__game!.audio())).state).toBe('running');
  await shot(page, 'welcome', 'level-start');

  // Pause menu: the level's name, no fuel cell and no journal. Main menu: the drive can be carried on.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-episode')).toHaveText('Ironbark Creek');
  await expect(page.locator('.pause-status')).not.toContainText('Fuel');
  await expect(page.locator('[data-act="journal"]')).toHaveCount(0);
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: /^Main menu/ }).click()]);
  await page.locator('[data-title-begin]').click();
  await expect(page.locator('[data-title-continue]')).toBeEnabled();
  await page.locator('[data-title-continue]').click();
  // Continue starts the saved camp without a second Drive press or setup screen, in the same conditions.
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300_000 });
  await waitEngine(page);
  await expect(page.locator('[data-briefing-drive]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  expect(await page.evaluate(() => window.__game!.conditions())).toMatchObject({ weather: 'wet' });
  await page.keyboard.press('Escape');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: /^Main menu/ }).click()]);
  await openJourney(page);
  await expect(drive).toBeVisible();
  await expect(on('start')).toHaveAttribute('data-value', 'resume');
  await expect(on('start')).toContainText('From Ironbark camp');
  await expect(on('vehicle')).toHaveAttribute('data-value', 'perentie');
  await expect(on('damage')).toHaveAttribute('data-value', 'realistic');
  await expect(on('time')).toHaveAttribute('data-value', 'morning');
  await expect(on('weather')).toHaveAttribute('data-value', 'wet');
  expect(errors).toEqual([]);
});
