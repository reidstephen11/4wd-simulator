import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitEngine, waitSim } from './helpers';

test('winches the GQ Patrol up Hut Spur on Stringybark Range', async ({ page }) => {
  // Loads the 2 km map on the software renderer and winches up a clay pitch.
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const drive = page.locator('[data-welcome-drive]');
  await expect(drive).toBeVisible();
  await page.getByRole('button', { name: /Stringybark Range/ }).click();
  await page.getByRole('button', { name: /GQ Patrol/ }).click();
  await shot(page, 'stringybark', 'welcome');
  await drive.click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 300_000 });
  await waitEngine(page);
  // Simulate up to a second per frame: the software renderer takes seconds per frame.
  await page.evaluate(() => window.__game!.setCatchUp(true));
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('stringybark-range');
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('patrol');
  expect(await page.evaluate(() => window.__game!.lastCampsite())).toBe('river-camp');
  await shot(page, 'stringybark', 'river-camp');

  // In the bay at the foot of Hut Spur, facing up the first pitch.
  await page.evaluate(() => window.__game!.teleportPoi('hut-spur'));
  await waitSim(page, 2);
  const start = await page.evaluate(() => window.__game!.vehicle());
  // Low range, both lockers and crawl control, then quick attach to the marked boulder.
  for (const key of ['KeyL', 'KeyZ', 'KeyX', 'KeyP']) await page.keyboard.press(key);
  await waitSim(page, 1);
  await page.keyboard.press('KeyE');
  await waitSim(page, 0.5);
  const anchor = await page.evaluate(
    () =>
      (window.__game!.state() as { vehicles: { winch: { anchor: string | null } }[] }).vehicles[0].winch
        .anchor,
  );
  expect(anchor).toMatch(/^rock:/);
  const p = await page.evaluate(() => window.__game!.vehicle());
  expect(p.range).toBe('low');
  expect(p.precisionCrawl).toBe(true);
  // Reel in with a little throttle: the Patrol climbs the greasy pitch on the cable.
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.3, winchIn: true }));
  await waitSim(page, 6);
  const mid = await page.evaluate(() => window.__game!.vehicle());
  await page.evaluate(
    (v) => window.__game!.setCamera(v.x + 9, v.y + 4, v.z + 6, v.x - 4, v.y + 2, v.z - 6),
    mid,
  );
  await page.waitForTimeout(1500);
  await shot(page, 'stringybark', 'hut-spur-winching');
  await waitSim(page, 8);
  await page.evaluate(() => window.__game!.setInput({ throttle: 0, brake: 1 }));
  await waitSim(page, 1);
  await page.evaluate(() => window.__game!.setInput(null));
  const up = await page.evaluate(() => window.__game!.vehicle());
  expect(up.y - start.y, 'height gained').toBeGreaterThan(2.5);
  expect(up.tilt).toBeLessThan(40);
  await page.evaluate(() => window.__game!.useChaseCamera());

  // Eagle Rock stands on cliffs above the range.
  await page.evaluate(() => window.__game!.showPoi('eagle-rock'));
  await page.waitForTimeout(2500);
  await shot(page, 'stringybark', 'eagle-rock');
  await page.evaluate(() => window.__game!.useChaseCamera());

  // The paper map shows the fire trails and the climbs.
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(2500);
  await shot(page, 'stringybark', 'paper-map');
  await page.keyboard.press('KeyM');
  expect(errors).toEqual([]);
});
