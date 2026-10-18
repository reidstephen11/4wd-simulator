import { expect, test } from '@playwright/test';
import { challengePois, challengeTrails, challengeTracks } from '../src/data/challenges';
import { densify, pointAt } from '../src/sim/world/polyline';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('clustered challenge discoveries render clearly on the paper map', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(
    (ids) =>
      localStorage.setItem(
        '4wdsim.save.v1',
        JSON.stringify({
          version: 1,
          exploration: { discovered: ids, lastCampsite: 'river-flat-camp' },
          settings: { quality: 'low', masterVolume: 0 },
        }),
      ),
    challengeTrails.map((t) => t.id),
  );
  await page.goto('/');
  await waitReady(page);
  await page.keyboard.press('KeyM');
  await expect(page.locator('.paper-map-sheet')).toBeVisible();
  await page
    .locator('.paper-map-sheet')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.paper-map canvas')!;
    const p = canvas.getContext('2d')!.getImageData(700, 700, 1, 1).data;
    return p[0] !== 243 || p[1] !== 235 || p[2] !== 218;
  });
  await shot(page, 'challenges', 'discovered-challenges-map');
  expect(errors).toEqual([]);
});

test('all eight Granite Spur obstacles and the fire trail have guidance and map discovery', async ({
  page,
}) => {
  test.setTimeout(600_000);
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
  await page.goto('/');
  await waitReady(page);
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyP');
  const title = page.locator('.course-hint strong');
  const line = (id: string) =>
    densify(
      challengeTracks.find((t) => t.id === id)!.points.map((p) => [p[0], p[1]] as const),
      1,
    );
  for (const trail of challengeTrails) {
    // Half a metre in, short of the first rock or hump: a terrain-only teleport onto one
    // would start the chassis inside it.
    const p = pointAt(line(trail.trackId), 0.5);
    await page.evaluate(
      (p) => window.__game!.teleport(p.x, p.z, (Math.atan2(p.dx, -p.dz) * 180) / Math.PI),
      p,
    );
    await expect(title).toHaveText(`${trail.name} · ${trail.sections[0].name}`);
    await expect(page.locator('.course-hint span')).toHaveText(trail.sections[0].hint);
    await page.keyboard.press('KeyC');
    await waitSim(page, 0.35);
    await shot(page, 'challenges', trail.id);
    await page.keyboard.press('KeyV');
    // The long obstacles' places sit mid-way along, beside the fire trail.
    const poi = challengePois.find((q) => q.id === trail.id)!;
    await page.evaluate((p) => window.__game!.teleport(p.x, p.z, 0), poi);
    await waitSim(page, 0.15);
    expect(await page.evaluate(() => window.__game!.discovered())).toContain(trail.id);
  }
  const trail = line('ft-north');
  const mid = pointAt(trail, trail.length / 2);
  await page.evaluate(
    (p) => window.__game!.teleport(p.x, p.z, (Math.atan2(p.dx, -p.dz) * 180) / Math.PI),
    mid,
  );
  await expect(title).toHaveText('Fire trail · Summit');
  await expect(page.locator('.course-hint span')).toContainText('no lockers');
  expect((await page.evaluate(() => window.__game!.pois())).length).toBe(25);
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().map)).toBe(true);
  await page
    .locator('.paper-map-sheet')
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  await shot(page, 'challenges', 'discovered-challenges-map');
  await page.keyboard.press('KeyM');
  await page.evaluate(() => {
    const g = window.__game!,
      h = g.heightAt(15, 225);
    g.setCamera(-55, h + 45, 300, 15, h - 4, 225);
  });
  await shot(page, 'challenges', 'granite-spur-overview');
  expect(errors).toEqual([]);
});
