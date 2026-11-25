import { expect, test } from '@playwright/test';
import { openJourney, collectErrors, lowGraphics, shot, waitReady } from './helpers';

test('damage: a setting, shown on the HUD; fit a spare for a torn sidewall, camps fix the engine', async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);

  // Pause menu → Settings → Damage: Mild by default, then Realistic.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-damage="mild"]')).toHaveClass(/on/);
  await page.locator('[data-damage="realistic"]').click();
  await expect(page.locator('.damage-note')).toContainText('Plug punctures');
  await shot(page, 'damage', 'settings');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Away from camp (a camp mends the engine), a puncture and a hurt engine.
  await page.evaluate(() => window.__game!.teleport(-2, 2130, 40));
  await page.evaluate(() => window.__game!.setParkBrake(true));
  // setHealth marks a lowered tyre as a torn sidewall.
  await page.evaluate(() => window.__game!.setHealth({ engine: 0.4, tyres: [0.6, 1, 1, 1] }));
  expect((await page.evaluate(() => window.__game!.health())).tyreFault[0]).toBe('sidewall');
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.__game!.vehicle())).speed), {
      timeout: 120_000,
    })
    .toBeLessThan(0.3);
  await expect(page.locator('.status-damage')).toHaveClass(/shown/);
  await expect(page.locator('.prompts')).toContainText('Fit a spare');
  await shot(page, 'damage', 'torn-sidewall');

  // Tool menu → Fit a spare: the tyre is mended, the engine isn't, one of the two spares is used.
  await page.keyboard.down('KeyQ');
  await page.getByRole('button', { name: 'Fit a spare', exact: true }).click();
  await page.keyboard.up('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__game!.health().repairing)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__game!.health()), { timeout: 900_000 })
    .toMatchObject({ tyres: [1, 1, 1, 1], spares: 1, engine: 0.4, repairing: false });
  await expect(page.locator('.status-supplies [title="Spare wheels"]')).toHaveText('×1');

  // Back at the start camp the engine is put right; the spare stays used.
  await page.evaluate(() => window.__game!.teleportPoi('ironbark-camp'));
  await expect
    .poll(() => page.evaluate(() => window.__game!.health()), { timeout: 120_000 })
    .toMatchObject({ engine: 1, spares: 1 });
  await expect(page.locator('.status-damage')).not.toHaveClass(/shown/);
  expect(errors).toEqual([]);
});
