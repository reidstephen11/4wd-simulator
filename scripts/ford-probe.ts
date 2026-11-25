/** Dev probe: ground, water and creek distance along a track (npx vite-node scripts/ford-probe.ts <track> [from] [to]). */
import { maps } from '../src/data/maps';
import { buildWorld } from '../src/sim/world/world';
import { trailPoint } from '../src/sim/world/crawlTrail';

const world = buildWorld(maps.ironbark.def);
const t = world.terrain;
const id = process.argv[2] ?? 'creek-ford';
const track = world.features.tracks.find((tr) => tr.def.id === id)!;
const from = Number(process.argv[3] ?? 0);
const to = Number(process.argv[4] ?? track.poly.length);
for (let s = from; s <= Math.min(to, track.poly.length); s += 1) {
  const p = trailPoint(track, s);
  const i = t.index(p.x, p.z);
  const cd = world.features.creekDistance[i];
  const h = t.heightAt(p.x, p.z);
  const w = t.waterSurfaceAt(p.x, p.z);
  const d = t.waterDepthAt(p.x, p.z);
  const line = [
    `s=${s.toFixed(0).padStart(4)}`,
    `x=${p.x.toFixed(1)} z=${p.z.toFixed(1)}`,
    `creekD=${cd.toFixed(1)}`,
    `h=${h.toFixed(2)}`,
    `w=${w === null ? '-' : w.toFixed(2)}`,
    `depth=${d.toFixed(2)}`,
  ];
  // Wheel tracks 0.75 m either side.
  for (const side of [-0.75, 0.75]) {
    const q = trailPoint(track, s, side);
    line.push(`d${side > 0 ? 'R' : 'L'}=${t.waterDepthAt(q.x, q.z).toFixed(2)}`);
  }
  console.log(line.join('  '));
}
