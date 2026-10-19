import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitEngine } from './helpers';

test('damage: a setting, shown on the HUD, fixed with the spare and at camp', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-welcome-drive]').click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
  await waitEngine(page);

  // Pause menu → Settings → Damage: Mild by default, then Realistic.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-damage="mild"]')).toHaveClass(/on/);
  await page.locator('[data-damage="realistic"]').click();
  await expect(page.locator('.damage-note')).toContainText('spare');
  await shot(page, 'damage', 'settings');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Away from camp (a campsite puts everything right), a flat tyre and a hurt engine.
  await page.evaluate(() => window.__game!.teleportPoi('gravel-ford'));
  await page.evaluate(() => window.__game!.setHealth({ engine: 0.4, tyres: [0, 1, 1, 1] }));
  await expect(page.locator('.status-damage')).toHaveClass(/shown/);
  await expect(page.locator('.prompts')).toContainText('Fit the spare');
  await shot(page, 'damage', 'flat-tyre');

  // Tool menu → Fit the spare: the flat tyre is fixed, the engine isn't, the spare is used.
  await page.keyboard.down('KeyQ');
  await page.locator('.tool-option', { hasText: 'Fit the spare' }).click();
  await page.keyboard.up('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__game!.health().repairing)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__game!.health()), { timeout: 300_000 })
    .toMatchObject({ tyres: [1, 1, 1, 1], spare: false, engine: 0.4, repairing: false });

  // Back to camp: everything put right and the spare back on.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Return to last campsite/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__game!.health()), { timeout: 60_000 })
    .toMatchObject({ engine: 1, spare: true });
  await expect(page.locator('.status-damage')).not.toHaveClass(/shown/);
  expect(errors).toEqual([]);
});
