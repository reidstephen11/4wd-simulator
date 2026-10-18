import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot, waitReady } from './helpers';

const audio = (page: Page) => page.evaluate(() => window.__game!.audio());

test('M6: audio starts on first input, follows the car, and the volume settings work', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  const audioWarnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && /audio/i.test(m.text())) audioWarnings.push(m.text());
  });
  await page.goto('/?debug');
  await waitReady(page);

  // Nothing plays before the first input (browser autoplay rules).
  await page.waitForTimeout(1500);
  expect((await audio(page)).state).toBe('off');
  await page.keyboard.press('KeyH');
  await expect.poll(async () => (await audio(page)).state).toBe('running');
  await expect.poll(async () => (await audio(page)).level).toBeGreaterThan(0.002);
  // The inline-six synthesiser runs in an AudioWorklet; idle fires at about 40 Hz.
  await expect.poll(async () => (await audio(page)).engineVoice).toBe('synth');
  await expect.poll(async () => (await audio(page)).engineHz).toBeGreaterThan(30);
  const idle = await audio(page);
  expect(idle.engineHz).toBeLessThan(50);

  // Driving: engine pitch rises, tyre noise follows the surface.
  await page.evaluate(() => window.__game!.teleport(-212, 228, 320));
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.7 }));
  await expect
    .poll(async () => (await page.evaluate(() => window.__game!.vehicle())).speed, { timeout: 120_000 })
    .toBeGreaterThan(3);
  const driving = await audio(page);
  expect(driving.engineHz).toBeGreaterThan(idle.engineHz * 1.3);
  expect(Math.max(0, ...Object.values(driving.tyres))).toBeGreaterThan(0.1);
  await shot(page, 'M6', 'driving-with-audio-readout');

  // Near the creek the water ambience comes in.
  await expect.poll(async () => (await audio(page)).water, { timeout: 180_000 }).toBeGreaterThan(0.2);
  await shot(page, 'M6', 'creek-water-audio');
  await page.evaluate(() => window.__game!.setInput({ brake: 1 }));

  // Volume settings.
  await page.keyboard.press('Escape');
  await page.locator('[data-act="settings"]').click();
  await page.locator('[data-key="masterVolume"]').fill('0');
  await expect.poll(async () => (await audio(page)).master).toBeLessThan(0.001);
  await expect.poll(async () => (await audio(page)).level).toBeLessThan(0.0005);
  await shot(page, 'M6', 'settings-master-volume-zero');
  await page.locator('[data-key="masterVolume"]').fill('1');
  await page.locator('[data-key="engineVolume"]').fill('0');
  await expect.poll(async () => (await audio(page)).engine).toBeLessThan(0.001);
  await expect.poll(async () => (await audio(page)).master).toBeGreaterThan(0.7);
  await expect.poll(async () => (await audio(page)).level).toBeGreaterThan(0.001);
  await page.locator('[data-key="masterVolume"]').fill('0.8');
  await page.locator('[data-key="engineVolume"]').fill('0.8');
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-act="resume"]').click();
  await page.evaluate(() => window.__game!.setInput(null));

  // Bird call; the mix doesn't clip.
  await page.evaluate(() => window.__game!.bird('kookaburra'));
  let peak = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(250);
    peak = Math.max(peak, (await audio(page)).peak);
  }
  expect((await audio(page)).lastBird).toBe('kookaburra');
  expect(peak).toBeGreaterThan(0.01);
  expect(peak).toBeLessThan(1);

  // Winch whine while reeling in.
  await page.evaluate(() => window.__game!.teleport(174, 3, 95));
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__game!.setInput(null));
  await page.keyboard.press('KeyE');
  await page.keyboard.down('KeyR');
  await expect.poll(async () => (await audio(page)).winchHz, { timeout: 30_000 }).toBeGreaterThan(200);
  await shot(page, 'M6', 'winch-audio');
  await page.keyboard.up('KeyR');

  expect(errors).toEqual([]);
  expect(audioWarnings).toEqual([]);
});

test('M6: without Web Audio the game still runs, silently', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    // @ts-expect-error simulate a browser without Web Audio
    delete window.AudioContext;
  });
  await page.goto('/');
  await waitReady(page);
  await page.keyboard.press('KeyW');
  await expect.poll(async () => (await audio(page)).state).toBe('unavailable');
  const t0 = await page.evaluate(() => window.__game!.simTime());
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__game!.simTime())).toBeGreaterThan(t0);
  expect(errors).toEqual([]);
});
