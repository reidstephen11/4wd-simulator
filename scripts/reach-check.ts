/**
 * Reach check: what changes on one fixed stretch of ground as the car comes nearer to it.
 * A free camera stands still over a point on a track, looking along it, and the car is put
 * down further and further up the track behind the camera, out of the picture. The camera
 * does not move, so anything that differs between two pictures is drawn according to how far
 * the car is: shadows, and anything else that follows the car. The player sees those appear
 * on the ground ahead while driving. `scripts/reach-diff.py` measures the pictures.
 *
 * Usage (against `npx vite build && npx vite preview --port 4173`):
 *   npx vite-node scripts/reach-check.ts <outDir> [track=knoll-loop] [at=100,300] [quality=low]
 *     [distances=120,90,70,55,45,35,25,10] [hour=] [url=http://localhost:4173/]
 * `at` is how far along the track each watched point is (m); each distance is how far short
 * of it the car stands. PW_CHROMIUM names another Chromium than the pinned Playwright's own.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: reach-check.ts <outDir> [key=value...]');
const arg = (key: string, fallback: string) =>
  rest.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const track = arg('track', 'knoll-loop');
const ats = arg('at', '200').split(',').map(Number);
const quality = arg('quality', 'low');
const distances = arg('distances', '120,90,70,55,45,35,25,10').split(',').map(Number);
const hour = arg('hour', '');
const url = arg('url', 'http://localhost:4173/');

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300_000);
await page.addInitScript((quality) => {
  localStorage.setItem(
    '4wdsim.save.v2',
    JSON.stringify({
      version: 1,
      settings: { quality, mirrors: false, headMotion: false },
      unlocked: ['perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'lc79', 'sooty80'],
    }),
  );
}, quality);
await page.goto(url);
await page.locator('.welcome').waitFor({ state: 'visible' });
const begin = page.locator('[data-title-begin]');
if (await begin.isVisible()) await begin.click();
const journey = page.locator('[data-title-journey]');
if (await journey.isVisible()) await journey.click();
await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
const briefing = page.locator('[data-briefing-drive]:not(.hidden)');
await briefing.waitFor({ timeout: 600_000 });
await briefing.click();
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 600_000 });
if (hour) await page.evaluate((h) => window.__game!.setHour(h), Number(hour));
// The interface is not the ground, and its cards and prompts come and go between pictures.
await page.addStyleTag({ content: '#ui { visibility: hidden !important; }' });

const frames = (n: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
const pts = await page.evaluate((id) => window.__game!.trackPoints(id), track);
const along: number[] = [0];
for (let k = 1; k < pts.length; k++)
  along.push(along[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
/** The track's point and heading (degrees) a distance along it. */
const place = (d: number) => {
  const k = Math.max(
    1,
    Math.min(
      pts.length - 6,
      along.findIndex((a) => a >= d),
    ),
  );
  const [x, z] = pts[k];
  const dx = pts[k + 5][0] - x;
  const dz = pts[k + 5][1] - z;
  const l = Math.hypot(dx, dz);
  return { x, z, dx: dx / l, dz: dz / l, heading: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360 };
};
const park = async (d: number) => {
  const p = place(d);
  await page.evaluate((p) => {
    const g = window.__game!;
    g.teleport(p.x, p.z, p.heading);
    // The handbrake alone: the brake pedal held at a standstill selects reverse.
    g.setInput({ throttle: 0, brake: 0, handbrake: true });
    g.setStepsPerFrame(6);
  }, p);
  await frames(8);
  return page.evaluate(() => window.__game!.vehicle().y);
};

const shots: { at: number; distance: number; file: string }[] = [];
for (const at of ats) {
  // The camera: 10 m short of the watched point and 4.4 m above the road, looking 30 m beyond it.
  const eye = place(at - 10);
  const eyeY = (await park(at - 10)) + 4.4;
  const look = place(at + 30);
  const lookY = await park(at + 30);
  const aim = [eye.x, eyeY, eye.z, look.x, lookY, look.z] as const;
  for (const d of distances) {
    await park(Math.max(2, at - d));
    await page.evaluate((a) => window.__game!.setCamera(a[0], a[1], a[2], a[3], a[4], a[5]), aim);
    await frames(8);
    const file = `reach-${String(at).padStart(4, '0')}-${String(d).padStart(3, '0')}m.png`;
    await page.screenshot({ path: `${outDir}/${file}` });
    shots.push({ at, distance: d, file });
    console.log(`watching ${at} m along, car ${d} m short of it: ${file}`);
  }
}
writeFileSync(`${outDir}/reach.json`, JSON.stringify({ track, quality, hour, shots }, null, 2));
await browser.close();
