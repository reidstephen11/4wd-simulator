import { expect, test } from '@playwright/test';
import { lowGraphics, waitReady, waitSim } from './helpers';

test.use({ viewport: { width: 960, height: 540 } });

test('transfer case, phone status, timed hubs and full-time centre lock', async ({ page }) => {
  test.setTimeout(600_000);
  await lowGraphics(page);
  await page.goto('/?touch');
  await waitReady(page);
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await expect.poll(() => page.evaluate(() => Math.abs(window.__game!.vehicle().speed))).toBeLessThan(0.5);
  await expect(page.locator('.status-range')).toHaveText('4H');
  await page.locator('.touch-pile-toggle').click();
  const range = page.locator('[data-tap="range"]');
  await range.click();
  await expect(range).toHaveText('4L');
  await range.click();
  await expect(range).toHaveText('2H');
  await page.locator('.touch-pile-toggle').click();
  await page.locator('[data-tap="toolMenu"]').click();
  await page.getByRole('button', { name: 'Unlock front hubs (20 s)' }).click();
  await expect(page.locator('.prompt').filter({ hasText: 'Working the front hubs' })).toBeVisible();
  await waitSim(page, 21);
  await expect.poll(() => page.evaluate(() => window.__game!.vehicle().transfer.hubsLocked)).toBe(false);
  await page.locator('.touch-pile-toggle').click();
  await range.click();
  await waitSim(page, 0.5);
  await expect(range).toHaveText('2H');
  await page.screenshot({ path: '/tmp/cape-transfer-hubs.png' });
  await page.locator('.touch-pile-toggle').click();
  await page.evaluate(() => window.__game!.setVehicle('perentie'));
  await expect.poll(() => page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  await page.locator('[data-tap="toolMenu"]').click();
  await page.getByRole('button', { name: 'Unlock centre diff' }).click();
  await expect.poll(() => page.evaluate(() => window.__game!.vehicle().transfer.centreLocked)).toBe(false);
  await page.screenshot({ path: '/tmp/cape-transfer-fulltime.png' });
});
