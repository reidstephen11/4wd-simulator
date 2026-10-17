import { expect, test } from '@playwright/test';
import { challengeTrails, challengeTracks } from '../src/data/challenges';
import { densify, pointAt } from '../src/sim/world/polyline';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('all four 4WD challenges have obstacle guidance, easy bypasses, and map discovery', async ({ page }) => {
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
    const at = trail.id === 'log-steps' ? 6 : trail.id === 'boulder-gates' ? 7 : 12;
    const p = pointAt(poly, at);
    await page.evaluate(
      (p) => window.__game!.teleport(p.x, p.z, (Math.atan2(p.dx, -p.dz) * 180) / Math.PI),
      p,
    );
    await expect(title).toHaveText(
      `${trail.name} · ${trail.difficulty === 'hard' ? 'Hard challenge' : 'Moderate challenge'}`,
    );
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
  await expect(title).toHaveText('4WD Challenge Loop');
  await expect(page.locator('.course-hint span')).toContainText('Next: V-Notch');
  expect((await page.evaluate(() => window.__game!.pois())).length).toBe(20);
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().map)).toBe(true);
  await shot(page, 'challenges', 'discovered-challenges-map');
  await page.keyboard.press('KeyM');
  await page.evaluate(() => {
    const g = window.__game!,
      h = g.heightAt(-5, 238);
    g.setCamera(-92, h + 75, 323, -5, h, 238);
  });
  await shot(page, 'challenges', 'challenge-loop-overview');
  expect(errors).toEqual([]);
});
