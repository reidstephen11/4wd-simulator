import { expect, test, type Page } from '@playwright/test';
import { openJourney, collectErrors, lowGraphics, shot, waitReady, waitSim } from './helpers';

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
  await lowGraphics(page);
  await page.goto('/?debug&surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);

  // --- Winch up the deep crossing's west bank to the marked boulder at its top ---
  await page.evaluate(() => window.__game!.teleport(-128, -61, 270));
  await page.evaluate(() => window.__game!.setParkBrake(false));
  await waitSim(page, 2);
  await page.keyboard.press('KeyE');
  await waitSim(page, 0.5);
  // With more than one anchor in reach, E opens the chooser and a second E hooks on (v1.18).
  if ((await vstate(page)).winch.anchor === null) {
    await page.keyboard.press('KeyE');
    await waitSim(page, 0.5);
  }
  const attached = await vstate(page);
  expect(attached.winch.anchor).not.toBeNull();
  const p0 = await page.evaluate(() => window.__game!.vehicle());
  await page.evaluate((p) => window.__game!.setCamera(p.x - 6, p.y + 5, p.z + 12, p.x + 6, p.y, p.z - 4), p0);
  await page.waitForTimeout(1000);
  await shot(page, 'M4', 'winch-attached-to-tree');
  await page.evaluate(() => window.__game!.useChaseCamera());
  await page.keyboard.down('KeyR');
  await waitSim(page, 12);
  await page.keyboard.up('KeyR');
  const reeled = await vstate(page);
  expect(reeled.winch.length).toBeLessThan(attached.winch.length - 1);
  await shot(page, 'M4', 'winch-pulled-up-the-bank');
  await page.keyboard.press('KeyE');

  // --- Planks on the west bank track ---
  await page.evaluate(() => window.__game!.teleport(-171, -30, 0));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__game!.tool('planks'))).toBe(true);
  await page.waitForTimeout(800);
  await shot(page, 'M4', 'plank-preview');
  await page.evaluate(() => window.__game!.tool('confirm'));
  await waitSim(page, 1.5);
  expect((await vstate(page)).planks.placed.length).toBe(2);
  const pp = await page.evaluate(() => window.__game!.vehicle());
  await page.evaluate((p) => window.__game!.setCamera(p.x + 8, p.y + 6, p.z + 6, p.x, p.y, p.z - 4), pp);
  await page.waitForTimeout(1000);
  await shot(page, 'M4', 'planks-placed');
  await page.evaluate(() => window.__game!.useChaseCamera());

  // --- Jack ---
  await page.evaluate(() => window.__game!.teleport(-171, 0, 0));
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

  // --- Engine flooding in the middle of the deep crossing ---
  // The FJ40 breathes through its snorkel since v0.33 and wades this; the code-built 40 has
  // only the wing intake and floods.
  await page.evaluate(() => window.__game!.setVehicle('forty'));
  await waitSim(page, 1);
  await page.evaluate(() => window.__game!.teleport(-116, -61, 270));
  await page.waitForFunction(
    () =>
      (window.__game!.state() as { vehicles: { flood: { stalled: boolean } }[] }).vehicles[0].flood.stalled,
    null,
    { timeout: 120_000 },
  );
  await shot(page, 'M4', 'engine-flooded-deep-crossing');

  // --- Back at camp the flooding is cleared and the planks recalled ---
  await page.evaluate(() => window.__game!.returnToCampsite('ironbark-camp'));
  await page.waitForTimeout(1500);
  const back = await vstate(page);
  expect(back.flood.stalled).toBe(false);
  expect(back.planks.carried).toBe(2);
  await shot(page, 'M4', 'back-at-camp-dirty');
  expect(errors).toEqual([]);
});
