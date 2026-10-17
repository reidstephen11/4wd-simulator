import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot, waitReady } from './helpers';

async function bearing(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = window.__game!.camera().position;
    const v = window.__game!.vehicle();
    return Math.atan2(c[0] - v.x, c[2] - v.z);
  });
}

test('orbit camera: mouse, zoom, recenter button and menu isolation', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = collectErrors(page);
  // This project has no favicon; avoid Chromium's unrelated automatic 404 request.
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() =>
    localStorage.setItem(
      '4wdsim.save.v1',
      JSON.stringify({
        version: 1,
        exploration: { discovered: [], lastCampsite: '' },
        settings: { quality: 'low', masterVolume: 0 },
      }),
    ),
  );
  await page.goto('/');
  await waitReady(page);
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await expect(page.locator('.camera-help')).toBeVisible();
  const start = await bearing(page);
  const changed = async () => Math.abs(Math.sin((await bearing(page)) - start));

  // Right drag: keep capturing motion even after leaving the original canvas point.
  await page.mouse.move(200, 180);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(420, 230, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(changed, { timeout: 90_000 }).toBeGreaterThan(0.65);
  await expect(page.locator('#game-canvas')).not.toHaveClass(/orbiting/);
  await shot(page, 'camera', 'orbit');
  const zoom = await page.evaluate(() => window.__game!.camera().distance);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.evaluate(() => window.__game!.camera().distance)).toBeLessThan(zoom);

  await page.getByRole('button', { name: /Reset view/ }).click();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
  await expect.poll(changed, { timeout: 90_000 }).toBeLessThan(0.05);

  // Left drag also works for trackpads; V restores the normal follow view.
  await page.mouse.move(200, 180);
  await page.mouse.down();
  await page.mouse.move(400, 180, { steps: 4 });
  await page.mouse.up();
  await expect.poll(changed, { timeout: 90_000 }).toBeGreaterThan(0.65);
  await page.keyboard.press('KeyV');
  await expect.poll(changed, { timeout: 90_000 }).toBeLessThan(0.05);

  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-card h2')).toHaveText('Paused');
  await expect(page.locator('.camera-help')).toBeHidden();
  const pausedCamera = await page.evaluate(() => window.__game!.camera());
  await page.mouse.move(200, 180);
  await page.mouse.wheel(0, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(420, 260);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('KeyV');
  // Let the paused loop consume input; it must leave camera and zoom unchanged.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  expect(await page.evaluate(() => window.__game!.camera())).toEqual(pausedCamera);
  await page.keyboard.press('Escape');
  await expect(page.locator('.camera-help')).toBeVisible();
  expect(await page.evaluate(() => window.__game!.camera().distance)).toBe(pausedCamera.distance);
  expect(errors).toEqual([]);
});
