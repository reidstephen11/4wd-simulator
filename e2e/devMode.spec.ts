import { expect, test } from '@playwright/test';
import { openJourney, collectErrors, driveFromBriefing, lowGraphics, shot } from './helpers';

test('test mode sets the weather, the clock, the place and the vehicle', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?dev&surprises=off&track=reopened');
  await openJourney(page);
  await expect(page.locator('[data-group="episode"][disabled]')).toHaveCount(0);
  await expect(page.locator('[data-group="time"]').first()).toBeVisible();
  await expect(page.locator('.welcome-card')).toContainText('Test mode');
  await page.locator('[data-welcome-drive]').click();
  await driveFromBriefing(page);

  const panel = page.locator('.dev-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Heavy storm' }).click();
  const storm = await page.evaluate(() => window.__game!.conditions());
  expect(storm.rain).toBe(1);
  expect(storm.wetness).toBe(1);
  expect(storm.creekRise).toBeGreaterThan(0.3);
  await panel.getByRole('button', { name: 'Clear', exact: true }).click();
  const clear = await page.evaluate(() => window.__game!.conditions());
  expect(clear.rain).toBe(0);
  expect(clear.creekRise).toBe(0);

  // The clock slider sets the time; stopped, it stays put.
  await panel.locator('[data-in="hour"]').fill('18');
  await panel.getByRole('button', { name: 'Stop the clock' }).click();
  const stopped = (await page.evaluate(() => window.__game!.episode())).hour;
  expect(stopped).toBeCloseTo(18, 1);
  await page.waitForTimeout(1500);
  expect((await page.evaluate(() => window.__game!.episode())).hour).toBe(stopped);

  // Jump to another place and change vehicle on the spot.
  const before = await page.evaluate(() => window.__game!.vehicle());
  await panel.locator('.debug-teleports button').nth(3).click();
  const after = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(20);
  await panel.getByRole('button', { name: /Perentie/ }).click();
  await expect.poll(() => page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  await shot(page, 'dev', 'test-panel');

  // A box trailer with two drums goes on the back and comes along.
  await panel.getByRole('button', { name: 'With two drums of diesel' }).click();
  const hitched = await page.evaluate(() => window.__game!.trailer());
  expect(hitched?.hitched).toBe(true);
  // The HUD says what's on the back.
  await expect(page.locator('.status-trailer')).toBeVisible();
  await expect(page.locator('.status-trailer')).toContainText('2 drums');
  const start = await page.evaluate(() => window.__game!.vehicle());
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.5 }));
  await expect
    .poll(async () => {
      const v = await page.evaluate(() => window.__game!.vehicle());
      return Math.hypot(v.x - start.x, v.z - start.z);
    })
    .toBeGreaterThan(8);
  await page.evaluate(() => window.__game!.setInput(null));
  const towed = await page.evaluate(() => window.__game!.trailer());
  expect(towed?.hitched).toBe(true);
  expect(Math.hypot(towed!.x - hitched!.x, towed!.z - hitched!.z)).toBeGreaterThan(5);
  await shot(page, 'dev', 'trailer');
  // Behind the Land Rover, the Army's No. 5 goes on the pintle hook by its ring.
  await panel.getByRole('button', { name: 'No. 5 with two drums' }).click();
  expect((await page.evaluate(() => window.__game!.trailer()))?.hitched).toBe(true);
  await expect(page.locator('.status-trailer')).toContainText('2 drums');
  await shot(page, 'dev', 'trailer-no5');
  await panel.getByRole('button', { name: 'No trailer' }).click();
  expect(await page.evaluate(() => window.__game!.trailer())).toBeNull();
  await expect(page.locator('.status-trailer')).toBeHidden();

  // Nothing is saved in test mode.
  const saved = await page.evaluate(() => localStorage.getItem('4wdsim.save.v2'));
  expect(saved).not.toContain('"episode"');
  expect(errors).toEqual([]);
});
