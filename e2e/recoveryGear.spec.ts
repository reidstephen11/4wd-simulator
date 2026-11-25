import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, waitReady, waitSim } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('phone psi controls, timed adjustments, recovery rigging and desktop submenu keys', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?touch&track=reopened&surprises=off');
  await waitReady(page);
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await waitSim(page, 2);
  const tools = page.locator('[data-tap="toolMenu"]');
  await tools.click();
  await page.getByRole('button', { name: 'Tyres: 36 psi', exact: true }).click();
  const choices = page.locator('.tool-menu .tool-option');
  await expect(choices).toHaveCount(4);
  for (const button of await choices.all()) {
    const box = await button.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  await page.screenshot({ path: '/workspace/scratch/recovery-psi-phone.png' });
  await page.getByRole('button', { name: '18 psi · rock / mud', exact: true }).click();
  await expect(page.locator('.prompt').filter({ hasText: 'Setting tyres to 18 psi' })).toBeVisible();
  await expect(page.locator('.tyre-mode')).toHaveText('18 psi', { timeout: 120_000 });
  await expect(page.locator('.tyre-value')).toHaveText(['18 psi', '18 psi', '18 psi', '18 psi']);
  await tools.click();
  await page.getByRole('button', { name: 'Tyres: 18 psi', exact: true }).click();
  await page.getByRole('button', { name: '24 psi · trail', exact: true }).click();
  await expect(page.locator('.tyre-mode')).toHaveText('24 psi', { timeout: 120_000 });
  await tools.click();
  await page.getByRole('button', { name: 'Recovery gear', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Shovel: clear the wheels (20 s)', exact: true }),
  ).toHaveClass(/disabled/);
  await page.screenshot({ path: '/workspace/scratch/recovery-gear-phone.png' });
  await page.getByRole('button', { name: 'Snatch block (double line, 14 m)', exact: true }).click();
  await tools.click();
  await page.getByRole('button', { name: 'Recovery gear', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Single-line winch (30 m)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to tools', exact: true }).click();
  await page.getByRole('button', { name: 'Tyres: 24 psi', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: '/workspace/scratch/recovery-psi-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.tool-menu')).toHaveClass(/hidden/);
  await page.keyboard.down('q');
  await page.getByRole('button', { name: 'Tyres: 24 psi', exact: true }).hover();
  await page.keyboard.up('q');
  await expect(page.getByRole('button', { name: '36 psi · road', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '36 psi · road', exact: true }).hover();
  await page.keyboard.press('Enter');
  await expect(page.locator('.prompt').filter({ hasText: 'Setting tyres to 36 psi' })).toBeVisible();
  // Software rendering at desktop size can take seconds per frame. Job timing is
  // checked in physics tests; advance this parked UI check by simulation time.
  await page.evaluate(() => window.__game!.setStepsPerFrame(120));
  await waitSim(page, 41);
  await expect(page.locator('.tyre-mode')).toHaveText('36 psi');
  expect(errors).toEqual([]);
});
