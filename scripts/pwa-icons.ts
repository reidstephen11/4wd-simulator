import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png';

/** Same mountain mark as the favicon in index.html (32×32 viewBox). */
const PAPER = { r: 0xd8, g: 0xd0, b: 0xc0 };
const MOUNTAIN = { r: 0x54, g: 0x61, b: 0x4b };
const PATH: ReadonlyArray<readonly [number, number]> = [
  [3, 25],
  [12, 7],
  [19, 18],
  [23, 12],
  [29, 25],
];

function inside(x: number, y: number): boolean {
  let n = 0;
  for (let i = 0, j = PATH.length - 1; i < PATH.length; j = i++) {
    const [xi, yi] = PATH[i];
    const [xj, yj] = PATH[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n++;
  }
  return n % 2 === 1;
}

/** Rasterise the favicon mountain. Maskable icons keep the mark in the centre 80%. */
function icon(size: number, maskable: boolean): Buffer {
  const rgb = new Uint8Array(size * size * 3);
  const pad = maskable ? 0.1 : 0;
  const span = 1 - pad * 2;
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          const px = ((u - pad) / span) * 32;
          const py = ((v - pad) / span) * 32;
          if (inside(px, py)) hits++;
        }
      }
      const t = hits / (samples * samples);
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(PAPER.r + (MOUNTAIN.r - PAPER.r) * t);
      rgb[i + 1] = Math.round(PAPER.g + (MOUNTAIN.g - PAPER.g) * t);
      rgb[i + 2] = Math.round(PAPER.b + (MOUNTAIN.b - PAPER.b) * t);
    }
  }
  return encodePng(size, size, rgb);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'pwa-192x192.png'), icon(192, false));
writeFileSync(join(outDir, 'pwa-512x512.png'), icon(512, false));
writeFileSync(join(outDir, 'pwa-512x512-maskable.png'), icon(512, true));
writeFileSync(join(outDir, 'apple-touch-icon.png'), icon(180, false));
