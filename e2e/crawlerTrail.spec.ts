import { expect, test } from '@playwright/test';
import { graniteLinkTracks } from '../src/data/crawlTrail';
import { densify, pointAt } from '../src/sim/world/polyline';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('wheel-placement views, controller shortcut, and technical/bypass guidance', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
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
  // C must select crawler views even when the debug tools are available.
  await page.goto('/?debug');
  await waitReady(page);
  await page.evaluate(() => {
    window.__game!.teleportPoi('granite-link');
    window.__game!.setInput({ handbrake: true });
  });
  await expect(page.locator('.course-hint strong')).toContainText('Granite Link');
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyC');
  const view = page.getByRole('button', { name: 'Camera view', exact: true });
  await expect(view).toContainText('Front left');
  await expect.poll(() => page.evaluate(() => window.__game!.camera().preset)).toBe('frontLeft');

  const track = densify(
    graniteLinkTracks[0].points.map((p) => [p[0], p[1]] as const),
    1,
  );
  const rock = pointAt(track, 15);
  await page.evaluate(
    (p) => window.__game!.teleport(p.x, p.z, (Math.atan2(p.dx, -p.dz) * 180) / Math.PI),
    rock,
  );
  await page.keyboard.press('KeyC');
  await waitSim(page, 0.8);
  await shot(page, 'crawler-trail', 'front-left-wheel-placement');
  await view.click();
  await expect(view).toContainText('Front right');
  await waitSim(page, 0.3);
  await shot(page, 'crawler-trail', 'front-right-wheel-placement');
  await page.keyboard.press('KeyC');
  await expect(view).toContainText('Rear close');

  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-card h2')).toHaveText('Paused');
  await page.keyboard.press('KeyC');
  await page.keyboard.press('Escape');
  await expect(view).toContainText('Rear close');

  // LB + R3 cycles without selecting a recovery tool, toggling a locker, or resetting the view.
  await page.evaluate(() => {
    const pad = {
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    pad.buttons[4] = pad.buttons[11] = { pressed: true, value: 1 };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    Object.assign(window, { trailPad: pad });
  });
  // Rear close → Driver (the right-hand seat), then on to Follow.
  await expect(view).toContainText('Driver');
  await page.evaluate(() => {
    const pad = (window as unknown as { trailPad: { buttons: { pressed: boolean; value: number }[] } })
      .trailPad;
    pad.buttons[11] = { pressed: false, value: 0 };
  });
  await waitSim(page, 0.1);
  await page.evaluate(() => {
    const pad = (window as unknown as { trailPad: { buttons: { pressed: boolean; value: number }[] } })
      .trailPad;
    pad.buttons[11] = { pressed: true, value: 1 };
  });
  await expect(view).toContainText('Follow');
  expect((await page.evaluate(() => window.__game!.ui())).toolMenu).toBe(false);
  expect((await page.evaluate(() => window.__game!.vehicle())).frontLocked).toBe(false);
  await page.evaluate(() => {
    const pad = (window as unknown as { trailPad: { buttons: { pressed: boolean; value: number }[] } })
      .trailPad;
    pad.buttons[4] = pad.buttons[11] = { pressed: false, value: 0 };
  });

  const shelf = pointAt(track, 30);
  await page.evaluate((p) => window.__game!.teleport(p.x, p.z, 0), shelf);
  await expect(page.locator('.course-hint strong')).toHaveText('Granite Link · Off-camber shelf');
  await expect(page.locator('.course-hint span')).toContainText('winch anchor');
  const bypass = pointAt(
    densify(
      graniteLinkTracks[1].points.map((p) => [p[0], p[1]] as const),
      1,
    ),
    40,
  );
  await page.evaluate((p) => window.__game!.teleport(p.x, p.z, 0), bypass);
  await expect(page.locator('.course-hint strong')).toHaveText('Easy · Granite Link bypass');
  await page.evaluate(() => {
    const g = window.__game!,
      y = g.heightAt(-78, 240);
    g.setCamera(-127, y + 44, 293, -78, y, 240);
  });
  await shot(page, 'crawler-trail', 'granite-link-and-bypass');
  expect(errors).toEqual([]);
});
