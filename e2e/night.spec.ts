import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitEngine } from './helpers';

test('night: the headlights are on as you arrive, N cycles them, and they light the ground ahead', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.welcome-note')).toContainText('headlights');
  await page.locator('[data-welcome-drive]').click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
  await waitEngine(page);
  expect((await page.evaluate(() => window.__game!.vehicle())).lights).toBe('low');
  await expect(page.locator('.status-lights')).toHaveClass(/shown/);

  // The ground in front of the car, above it on the screen in the chase view.
  const ahead = () => page.evaluate(() => window.__game!.brightness(0.3, 0.3, 0.7, 0.45));
  const lowBeam = await ahead();
  await shot(page, 'night', 'low-beam');

  // N: high beam, then off.
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('high');
  await expect(page.locator('.status-lights')).toHaveClass(/high/);
  await expect.poll(() => page.evaluate(() => window.__game!.beams().head)).toBeGreaterThan(0);
  await shot(page, 'night', 'high-beam');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('off');
  await expect(page.locator('.status-lights')).not.toHaveClass(/shown/);
  const dark = await ahead();
  await shot(page, 'night', 'lights-off');
  expect(lowBeam).toBeGreaterThan(dark * 1.5);
  expect(lowBeam - dark).toBeGreaterThan(8);

  // The Camel Trophy car's roof lamps come on with high beam.
  await page.evaluate(() => window.__game!.setVehicle('camel'));
  await waitEngine(page);
  await page.evaluate(() => window.__game!.setLights('high'));
  await expect.poll(() => page.evaluate(() => window.__game!.beams().roof)).toBeGreaterThan(0);
  await page.evaluate(() => window.__game!.cameraPreset('cockpit'));
  await page.waitForTimeout(1000);
  await shot(page, 'night', 'camel-high-beam-driver');
  expect(errors).toEqual([]);
});
