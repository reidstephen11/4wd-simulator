import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, shot, waitReady } from './helpers';

test('vehicle instruments show fuel, temperature, pressure setting and the damaged tyre', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await waitReady(page);

  // The HUD style draws the dials; the older gauge panel stays in the page, hidden, and
  // keeps the readings these checks look at.
  await expect(page.locator('.inst-cluster')).toBeVisible();
  const instruments = page.getByRole('group', { name: 'Vehicle instruments', includeHidden: true });
  const temperature = instruments.getByRole('meter', { name: 'TEMP', includeHidden: true });
  const fuel = instruments.getByRole('meter', { name: 'FUEL', includeHidden: true });
  await expect(temperature).toBeAttached();
  await expect(temperature).toHaveAttribute('aria-valuetext', /Engine temperature: normal/);
  const health = await page.evaluate(() => window.__game!.health());
  await expect(fuel).toHaveAttribute('aria-valuetext', /^Fuel: /);
  await expect(fuel.locator('.dial-value')).toHaveText(`${Math.round(health.fuel)} L`);
  await expect(instruments.locator('.tyre-mode')).toHaveText('36 psi');
  await expect(instruments.locator('.tyre-gauge')).toHaveCount(4);
  await expect(
    instruments.getByRole('meter', { name: 'Front left tyre', includeHidden: true }),
  ).toHaveAttribute('aria-valuenow', '36');

  // Pressure changes are timed and preserve the health of each tyre.
  await page.evaluate(() => {
    window.__game!.setParkBrake(true);
    window.__game!.setStepsPerFrame(120);
  });
  await page.keyboard.down('KeyQ');
  await page.getByRole('button', { name: 'Tyres: 36 psi', exact: true }).hover();
  await page.keyboard.up('KeyQ');
  await page.getByRole('button', { name: '18 psi · rock / mud', exact: true }).click();
  await expect(instruments.locator('.tyre-mode')).toHaveText('18 psi', { timeout: 120_000 });
  await expect(
    instruments.getByRole('meter', { name: 'Front left tyre', includeHidden: true }),
  ).toHaveAttribute('aria-valuenow', '18');

  // Away from camp, a torn front-left tyre must only mark that corner.
  await page.evaluate(() => {
    window.__game!.teleport(-2, 2130, 40);
    window.__game!.setHealth({ tyres: [0.6, 1, 1, 1] });
  });
  const frontLeft = instruments.getByRole('meter', { name: 'Front left tyre', includeHidden: true });
  await expect(frontLeft).toHaveAttribute('aria-valuetext', /10.8 psi, torn sidewall/);
  await expect(frontLeft.locator('.tyre-value')).toHaveText('11 psi');
  await expect(page.locator('.inst-lamps')).toContainText(/TYRE FL \d+%/);
  await expect(
    instruments.getByRole('meter', { name: 'Rear right tyre', includeHidden: true }),
  ).toHaveAttribute('aria-valuenow', '18');
  await shot(page, 'gauges', 'vehicle-instruments');
  expect(errors).toEqual([]);
});
