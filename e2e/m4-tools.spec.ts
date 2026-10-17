import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

type VState = {
  position: { x: number; y: number; z: number };
  flood: { timer: number; stalled: boolean };
  dirt: { sides: number };
  dents: number;
  winch: { anchor: string | null; length: number };
  planks: { carried: number; placed: unknown[] };
};
const vstate = (page: Page) =>
  page.evaluate(() => (window.__game!.state() as { vehicles: unknown[] }).vehicles[0]) as Promise<VState>;

test('M4: winch, planks, jack, flooding, dirt and dents', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await page.goto('/?debug');
  await waitReady(page);

  // --- Winch out of the Bog Hole ---
  await page.evaluate(() => window.__game!.teleport(174, 3, 95));
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await waitSim(page, 9);
  await page.evaluate(() => window.__game!.setInput(null));
  await page.keyboard.press('KeyE');
  await waitSim(page, 0.5);
  const attached = await vstate(page);
  expect(attached.winch.anchor).not.toBeNull();
  const p0 = await page.evaluate(() => window.__game!.vehicle());
  await page.evaluate((p) => window.__game!.setCamera(p.x - 6, p.y + 5, p.z + 12, p.x + 6, p.y, p.z - 4), p0);
  await page.waitForTimeout(1000);
  await shot(page, 'M4', 'winch-attached-in-bog');
  await page.evaluate(() => window.__game!.useChaseCamera());
  await page.keyboard.down('KeyR');
  await waitSim(page, 12);
  await page.keyboard.up('KeyR');
  const reeled = await vstate(page);
  expect(reeled.winch.length).toBeLessThan(attached.winch.length - 1);
  await shot(page, 'M4', 'winch-pulled-out-muddy');
  await page.keyboard.press('KeyE');

  // --- Planks over the Washout Gully ---
  await page.evaluate(() => window.__game!.teleport(84.4, 314.6, 104));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__game!.tool('planks'))).toBe(true);
  await page.waitForTimeout(800);
  await shot(page, 'M4', 'plank-preview');
  await page.evaluate(() => window.__game!.tool('confirm'));
  await waitSim(page, 1.5);
  expect((await vstate(page)).planks.placed.length).toBe(2);
  await page.evaluate(() => window.__game!.setCamera(82, 27, 309, 90.5, 21.8, 316));
  await page.waitForTimeout(1000);
  await shot(page, 'M4', 'planks-over-gully');
  await page.evaluate(() => window.__game!.useChaseCamera());

  // --- Jack ---
  await page.evaluate(() => window.__game!.teleport(-150, 238, 315));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__game!.flip());
  await page.waitForFunction(
    () => {
      const g = window.__game!;
      return g.vehicle().tilt > 90;
    },
    null,
    { timeout: 30_000 },
  );
  const jackState = () =>
    page.evaluate(() => (window.__game!.state() as { vehicles: { jack: string }[] }).vehicles[0].jack);
  await expect.poll(jackState, { timeout: 60_000 }).toBe('available');
  await shot(page, 'M4', 'rolled-over');
  await page.keyboard.down('KeyJ');
  await expect.poll(jackState, { timeout: 60_000 }).toBe('righting');
  await page.keyboard.up('KeyJ');
  await expect.poll(jackState, { timeout: 60_000 }).toBe('idle');
  await waitSim(page, 2);
  expect((await page.evaluate(() => window.__game!.vehicle())).tilt).toBeLessThan(20);
  await shot(page, 'M4', 'righted-by-jack');

  // --- Engine flooding at the Deep Crossing ---
  await page.evaluate(() => window.__game!.teleport(19, 63, 20));
  await page.waitForFunction(
    () =>
      (window.__game!.state() as { vehicles: { flood: { stalled: boolean } }[] }).vehicles[0].flood.stalled,
    null,
    { timeout: 120_000 },
  );
  await shot(page, 'M4', 'engine-flooded-deep-crossing');

  // --- Return to campsite clears flooding and recalls planks ---
  await page.evaluate(() => window.__game!.returnToCampsite('river-flat-camp'));
  await page.waitForTimeout(1500);
  const back = await vstate(page);
  expect(back.flood.stalled).toBe(false);
  expect(back.planks.carried).toBe(2);
  await shot(page, 'M4', 'back-at-camp-dirty');
  expect(errors).toEqual([]);
});
