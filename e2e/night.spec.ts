import { expect, test } from '@playwright/test';
import { openJourney, collectErrors, lowGraphics, shot, waitReady, waitSim } from './helpers';

test('night: the storm comes in, dusk turns the headlights on, N cycles them, and they light the ground ahead', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
  expect((await page.evaluate(() => window.__game!.vehicle())).lights).toBe('off');
  // The clock runs on into the evening: at dusk the lamps come on by themselves.
  await page.evaluate(() => window.__game!.setHour(17.7));
  // By then the storm has come in, with a note on screen (shown for a few seconds).
  await expect(page.locator('.toast', { hasText: 'Rain coming in' })).toHaveCount(1);
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('low');
  await expect(page.locator('.status-lights')).toHaveClass(/shown/);
  // Rain, soaked ground and risen creeks.
  const storm = await page.evaluate(() => window.__game!.conditions());
  expect(storm.rain).toBeGreaterThan(0.9);
  expect(storm.wetness).toBeGreaterThan(0.95);
  expect(storm.creekRise).toBeGreaterThan(0.2);
  // Past the deadline the episode ends.
  await page.evaluate(() => window.__game!.setHour(19.6));
  await expect.poll(() => page.evaluate(() => window.__game!.result().open)).toBe(true);
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.__game!.pickResult('menu'))]);
  await openJourney(page);

  // Driving at night is a replay of a finished episode: the clock stands at night.
  await page.evaluate(() => {
    const key = '4wdsim.save.v2';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.episodes = { creb: { completed: true } };
    save.replay = { time: 'night', weather: 'clear' };
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();
  await openJourney(page);
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.episode())).toMatchObject({ replay: { time: 'night' } });
  expect((await page.evaluate(() => window.__game!.vehicle())).lights).toBe('low');
  // A replay keeps the weather chosen: no storm.
  expect(await page.evaluate(() => window.__game!.conditions())).toMatchObject({ rain: 0, creekRise: 0 });
  await waitSim(page, 0.5);

  // The ground in front of the car, above it on the screen in the chase view.
  const ahead = () => page.evaluate(() => window.__game!.brightness(0.3, 0.3, 0.7, 0.45));
  await page.evaluate(() => window.__game!.setLights('low'));
  await waitSim(page, 0.3);
  const lowBeam = await ahead();
  await shot(page, 'night', 'low-beam');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('high');
  await expect(page.locator('.status-lights')).toHaveClass(/high/);
  await expect.poll(() => page.evaluate(() => window.__game!.beams().head)).toBeGreaterThan(0);
  await shot(page, 'night', 'high-beam');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).lights).toBe('off');
  const dark = await ahead();
  await shot(page, 'night', 'lights-off');
  expect(lowBeam).toBeGreaterThan(dark * 1.3);
  expect(errors).toEqual([]);
});
