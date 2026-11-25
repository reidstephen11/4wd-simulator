/**
 * Vehicle audit: every vehicle named, photographed in the studio page large and close, for a
 * reviewer who compares each with its reference photographs. Unlike `studio-shots.ts` (seven
 * fixed cameras, the car a third of the picture), each camera here is placed from the
 * vehicle's own size so the car fills the frame, and the set covers both sides, all four
 * corners, above, low at each end, every wheel, each corner close up and again from above, the
 * roof, the driver's
 * seat, and the axles crossed up on full lock.
 *
 * Usage (needs `npm run dev`):
 *   npx vite-node scripts/studio-audit.ts <outDir> <vehicleId> [vehicleId...] [url=http://localhost:5173/]
 * Pictures go to <outDir>/<vehicleId>/NN-name.png. STUDIO_CHROMIUM names another Chromium.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const url = rest.find((a) => a.startsWith('url='))?.slice(4) ?? 'http://localhost:5173/';
const ids = rest.filter((a) => !a.startsWith('url='));
if (!outDir || ids.length === 0) throw new Error('Usage: studio-audit.ts <outDir> <vehicleId>... [url=]');
const SIZE = { width: 1600, height: 1000 };
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

const browser = await chromium.launch({
  executablePath: process.env.STUDIO_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const id of ids) {
  const dir = `${outDir}/${id}`;
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: SIZE });
  page.on('pageerror', (e) => console.log(`[pageerror] ${id}: ${e.message}`));
  await page.goto(`${url}scripts/studio/?vehicle=${id}`);
  await page.waitForFunction(() => window.studio?.ready === true, null, { timeout: 180_000 });
  const b = await page.evaluate(() => window.studio.bounds());
  const min = b.min as V3;
  const max = b.max as V3;
  // A whip aerial would shrink the car in every frame: the box stops a little above the hubs' roofline.
  const hubY = b.hubs[0][1];
  const top = Math.min(max[1], hubY + 2.4);
  const lo: V3 = [min[0], b.ground, min[2]];
  const hi: V3 = [max[0], top, max[2]];
  const centre: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const corners: V3[] = [];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
  let n = 0;
  const shoot = async (name: string, eye: V3, look: V3, fov: number) => {
    await page.evaluate(
      (a) => window.studio.view(a[0], a[1], a[2], a[3], a[4], a[5], a[6]),
      [...eye, ...look, fov],
    );
    await page.screenshot({ path: `${dir}/${String(++n).padStart(2, '0')}-${name}.png` });
  };
  /** A camera looking at the car's middle from direction `from`, as near as keeps the whole car in frame. */
  const fit = async (name: string, from: V3, fov = 24) => {
    const d = unit(from);
    const right = unit(cross([0, 1, 0], d));
    const up = cross(d, right);
    const tv = Math.tan((fov * Math.PI) / 360) * 0.9;
    const th = tv * (SIZE.width / SIZE.height);
    let dist = 0;
    for (const c of corners) {
      const v = sub(c, centre);
      dist = Math.max(dist, dot(v, d) + Math.abs(dot(v, right)) / th, dot(v, d) + Math.abs(dot(v, up)) / tv);
    }
    await shoot(
      name,
      [centre[0] + d[0] * dist, centre[1] + d[1] * dist, centre[2] + d[2] * dist],
      centre,
      fov,
    );
  };
  // Vehicle frame: x right, y up, z back (the nose is at −z).
  await fit('side-left', [-1, 0.03, 0]);
  await fit('side-right', [1, 0.03, 0]);
  await fit('front', [0, 0.05, -1]);
  await fit('rear', [0, 0.05, 1]);
  await fit('front-left', [-0.75, 0.22, -1]);
  await fit('front-right', [0.75, 0.22, -1]);
  await fit('rear-left', [-0.75, 0.22, 1]);
  await fit('rear-right', [0.75, 0.22, 1]);
  await fit('top', [0.001, 1, 0.03]);
  await fit('high-front-left', [-0.7, 0.9, -1]);
  await fit('high-rear-right', [0.7, 0.9, 1]);
  // Low at each end and from the side, for what hangs under the body.
  const g = b.ground;
  await shoot('low-front', [-1.5, g + 0.25, lo[2] - 2.8], [0, hubY, lo[2] + 0.9], 42);
  await shoot('low-rear', [1.5, g + 0.25, hi[2] + 2.8], [0, hubY, hi[2] - 0.9], 42);
  await shoot('low-side-left', [lo[0] - 3.4, g + 0.18, 0.4], [0, hubY, 0], 44);
  // Each corner close up: the bar, lamps, guard and wheel at that corner.
  const midY = (g + top) / 2;
  await shoot(
    'corner-front-left',
    [lo[0] - 1.5, midY + 0.5, lo[2] - 2.0],
    [lo[0] * 0.3, midY, lo[2] + 0.7],
    40,
  );
  await shoot(
    'corner-front-right',
    [hi[0] + 1.5, midY + 0.5, lo[2] - 2.0],
    [hi[0] * 0.3, midY, lo[2] + 0.7],
    40,
  );
  await shoot(
    'corner-rear-left',
    [lo[0] - 1.5, midY + 0.5, hi[2] + 2.0],
    [lo[0] * 0.3, midY, hi[2] - 0.7],
    40,
  );
  await shoot(
    'corner-rear-right',
    [hi[0] + 1.5, midY + 0.5, hi[2] + 2.0],
    [hi[0] * 0.3, midY, hi[2] - 0.7],
    40,
  );
  // Each upper corner from above and outside, close: where the cab meets the body below it and
  // the roof above. A lower body that stands out past a round cab corner shows only from here
  // (the FJ40's rear corners, found by the owner in v1.88, not by the 24 pictures above).
  for (const [fz, zEdge, zOut] of [
    ['front', lo[2], -1],
    ['rear', hi[2], 1],
  ] as const)
    for (const [fx, xEdge, xOut] of [
      ['left', lo[0], -1],
      ['right', hi[0], 1],
    ] as const)
      await shoot(
        `shoulder-${fz}-${fx}`,
        [xEdge + xOut * 1.1, top + 0.35, zEdge + zOut * 1.1],
        [xEdge * 0.85, top - 0.8, zEdge - zOut * 0.25],
        34,
      );
  // One front and one rear wheel in its arch.
  for (const [name, i] of [
    ['wheel-front-left', 0],
    ['wheel-rear-right', b.hubs.length - 1],
  ] as const) {
    const h = b.hubs[i] as V3;
    const sx = Math.sign(h[0]) || -1;
    const sz = h[2] < 0 ? -1 : 1;
    await shoot(name, [h[0] + sx * 2.3, h[1] + 0.35, h[2] + sz * 0.9], [h[0], h[1] + 0.2, h[2]], 34);
  }
  await shoot('roof', [lo[0] - 2.2, top + 1.5, 1.2], [0, top - 0.25, 0], 44);
  // Axles crossed up on full lock: tyres against guards, springs and bars.
  await page.evaluate(() => window.studio.articulate(0.16, 0.55));
  await fit('crossed-front-left', [-0.75, 0.15, -1]);
  await fit('crossed-rear-right', [0.75, 0.15, 1]);
  await page.evaluate(() => window.studio.articulate(0, 0));
  await page.evaluate(() => window.studio.cockpit());
  await page.screenshot({ path: `${dir}/${String(++n).padStart(2, '0')}-cockpit.png` });
  console.log(`${id}: ${n} pictures`);
  await page.close();
}
await browser.close();
