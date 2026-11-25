import { expect, test } from '@playwright/test';
import {
  openJourney,
  collectErrors,
  driveFromBriefing,
  lowGraphics,
  shot,
  waitReady,
  waitSim,
} from './helpers';

test('night: a clear afternoon starts with the lamps off, dusk and night with them on; N cycles them, and they light the ground ahead', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/');
  await openJourney(page);
  // The default conditions: a clear late afternoon, lamps off.
  await waitReady(page);
  expect((await page.evaluate(() => window.__game!.vehicle())).lights).toBe('off');
  expect(await page.evaluate(() => window.__game!.conditions())).toMatchObject({ rain: 0, creekRise: 0 });

  // Night, picked on the New drive page: the lamps are on as you arrive, and the weather stays as chosen.
  await page.keyboard.press('Escape');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: /^Main menu/ }).click()]);
  await page.locator('[data-title-begin]').click();
  await page.locator('[data-title-journey]').click();
  await page.locator('[data-group="time"][data-value="night"]').click();
  await page.locator('[data-welcome-drive]').click();
  await driveFromBriefing(page);
  expect(await page.evaluate(() => window.__game!.episode())).toMatchObject({ replay: { time: 'night' } });
  expect((await page.evaluate(() => window.__game!.vehicle())).lights).toBe('low');
  await expect(page.locator('.status-lights')).toHaveClass(/shown/);
  expect(await page.evaluate(() => window.__game!.conditions())).toMatchObject({ rain: 0, creekRise: 0 });
  await waitSim(page, 0.5);

  // The ground in front of the car, above it on the screen in the chase view.
  const ahead = () => page.evaluate(() => window.__game!.brightness(0.3, 0.3, 0.7, 0.45));
  await page.evaluate(() => window.__game!.setLights('low'));
  await waitSim(page, 0.3);
  const lowBeam = await ahead();
  await shot(page, 'night', 'low-beam');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('high');
  await expect(page.locator('.status-lights')).toHaveClass(/high/);
  await expect.poll(() => page.evaluate(() => window.__game!.beams().head)).toBeGreaterThan(0);
  await shot(page, 'night', 'high-beam');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('off');
  const dark = await ahead();
  await shot(page, 'night', 'lights-off');
  expect(lowBeam).toBeGreaterThan(dark * 1.3);
  expect(errors).toEqual([]);
});
