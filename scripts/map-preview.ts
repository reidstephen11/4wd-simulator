/**
 * Dev helper: render a top-down preview of the generated map to a PNG.
 * Usage: npx vite-node scripts/map-preview.ts [out.png] [scale]
 */
import { writeFileSync } from 'node:fs';
import { highCountryMap } from '../src/data/map';
import { palette } from '../src/data/palette';
import { generateTerrain } from '../src/sim/world/terrainGen';
import { GroundTint, NO_WATER } from '../src/sim/world/terrain';
import { encodePng } from './png';

const out = process.argv[2] ?? 'map-preview.png';
const scale = Number(process.argv[3] ?? 1);
const t0 = performance.now();
const { terrain, features } = generateTerrain(highCountryMap);
console.log(`generated in ${(performance.now() - t0).toFixed(0)} ms`);

const hex = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const tintCols: Record<number, number[]> = {
  [GroundTint.GrassDry]: hex(palette.grassDry),
  [GroundTint.GrassSage]: hex(palette.grassSage),
  [GroundTint.DirtTrack]: hex(palette.dirtTrack),
  [GroundTint.DirtEdge]: hex(palette.dirtDark),
  [GroundTint.Rock]: hex(palette.rock),
  [GroundTint.Scree]: hex(palette.rockDark),
  [GroundTint.Mud]: hex(palette.mud),
  [GroundTint.Gravel]: hex('#A8876A'),
  [GroundTint.CreekBed]: hex(palette.rockDark),
  [GroundTint.ForestFloor]: hex(palette.foliageDark),
  [GroundTint.FaintTrack]: hex('#BE8A55'),
};
const size = terrain.size;
const W = Math.floor(size / scale);
const img = new Uint8Array(W * W * 3);
const res = terrain.res;
let minH = Infinity;
let maxH = -Infinity;
for (const h of terrain.heights) {
  minH = Math.min(minH, h);
  maxH = Math.max(maxH, h);
}
for (let py = 0; py < W; py++) {
  for (let px = 0; px < W; px++) {
    const ix = Math.min(res - 2, Math.floor(px * scale));
    const iz = Math.min(res - 2, Math.floor(py * scale));
    const i = iz * res + ix;
    const h = terrain.heights;
    const dx = h[i + 1] - h[i];
    const dz = h[i + res] - h[i];
    // Light from the north-west.
    const nx = -dx;
    const nz = -dz;
    const ny = 1;
    const len = Math.hypot(nx, ny, nz);
    const lx = -0.6;
    const ly = 0.6;
    const lz = -0.5;
    const ll = Math.hypot(lx, ly, lz);
    const shade = Math.max(0.25, (nx * lx + ny * ly + nz * lz) / (len * ll));
    let c = tintCols[terrain.tint[i]] ?? [255, 0, 255];
    if (terrain.water[i] > NO_WATER) {
      const depth = terrain.water[i] - h[i];
      c = depth > 0.6 ? hex(palette.waterDeep) : hex(palette.waterShallow);
    }
    const contour =
      Math.floor(h[i] / 10) !== Math.floor(h[i + 1] / 10) ||
      Math.floor(h[i] / 10) !== Math.floor(h[i + res] / 10);
    const o = (py * W + px) * 3;
    for (let k = 0; k < 3; k++) img[o + k] = Math.min(255, c[k] * (0.55 + 0.6 * shade) * (contour ? 0.8 : 1));
  }
}
const mark = (x: number, z: number, col: number[], r = 3) => {
  const cx = Math.floor((x + size / 2) / scale);
  const cz = Math.floor((z + size / 2) / scale);
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx;
      const py = cz + dz;
      if (px < 0 || py < 0 || px >= W || py >= W) continue;
      const o = (py * W + px) * 3;
      img[o] = col[0];
      img[o + 1] = col[1];
      img[o + 2] = col[2];
    }
};
for (const p of highCountryMap.pois)
  mark(p.x, p.z, p.kind === 'campsite' ? [255, 255, 255] : [200, 30, 30], 4);
for (const b of features.boxes) mark(b.x, b.z, [40, 40, 40], 0);
writeFileSync(out, encodePng(W, W, img));
console.log(`wrote ${out} (${W}x${W}); height range ${minH.toFixed(1)}..${maxH.toFixed(1)}`);
for (const p of highCountryMap.pois)
  console.log(
    `${p.id.padEnd(18)} h=${terrain.heightAt(p.x, p.z).toFixed(1).padStart(6)} slope=${terrain.slopeDegAt(p.x, p.z).toFixed(1)}`,
  );
