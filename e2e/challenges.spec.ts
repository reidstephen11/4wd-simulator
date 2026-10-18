import { expect, test } from '@playwright/test';
import { challengeTrails, challengeTracks } from '../src/data/challenges';
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

test('all six Granite Crawl obstacles have guidance, easy bypasses, and map discovery', async ({ page }) => {
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
  await page.goto('/');
  await waitReady(page);
  await page.evaluate(() => window.__game!.setInput({ handbrake: true }));
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyP');
  const title = page.locator('.course-hint strong');
  for (const trail of challengeTrails) {
    const track = challengeTracks.find((t) => t.id === trail.trackId)!;
    const poly = densify(
      track.points.map((p) => [p[0], p[1]] as const),
      1,
    );
    // Stop short of the first rock; a terrain-only teleport onto one would start the
    // chassis inside the solid granite.
    const p = pointAt(poly, 2);
    await page.evaluate(
      (p) => window.__game!.teleport(p.x, p.z, (Math.atan2(p.dx, -p.dz) * 180) / Math.PI),
      p,
    );
    await expect(title).toHaveText(`${trail.name} · ${trail.sections[0].name}`);
    await expect(page.locator('.course-hint span')).toHaveText(trail.sections[0].hint);
    await waitSim(page, 0.15);
    expect(await page.evaluate(() => window.__game!.discovered())).toContain(trail.id);
    await page.keyboard.press('KeyC');
    await waitSim(page, 0.35);
    await shot(page, 'challenges', trail.id);

    const bypass = challengeTracks.find((t) => t.id === trail.bypassTrackId)!;
    const bypassPoly = densify(
      bypass.points.map((p) => [p[0], p[1]] as const),
      1,
    );
    const mid = pointAt(bypassPoly, bypassPoly.length / 2);
    await page.evaluate((p) => window.__game!.teleport(p.x, p.z, 0), mid);
    await expect(title).toHaveText(`Easy · ${trail.name} bypass`);
    await expect(page.locator('.course-hint span')).toContainText('no lockers');
  }
  const link = pointAt(
    densify(
      challengeTracks.find((t) => t.id === 'challenge-entry')!.points.map((p) => [p[0], p[1]] as const),
      1,
    ),
    10,
  );
  await page.evaluate((p) => window.__game!.teleport(p.x, p.z, 90), link);
  await expect(title).toHaveText('Granite Crawl');
  await expect(page.locator('.course-hint span')).toContainText('Next: Rock Garden');
  expect((await page.evaluate(() => window.__game!.pois())).length).toBe(22);
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().map)).toBe(true);
  await page
    .locator('.paper-map-sheet')
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  await shot(page, 'challenges', 'discovered-challenges-map');
  await page.keyboard.press('KeyM');
  await page.evaluate(() => {
    const g = window.__game!,
      h = g.heightAt(15, 240);
    g.setCamera(-60, h + 70, 320, 15, h, 240);
  });
  await shot(page, 'challenges', 'challenge-loop-overview');
  expect(errors).toEqual([]);
});
