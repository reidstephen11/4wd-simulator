/**
 * Dev helper: the heights the Ironbark Creek lines are pinned to where they join the knoll
 * loop. Builds the map with the loop alone and prints the loop's graded height at every
 * `joinLoop(x, z, h)` in src/data/levels, beside the height written there.
 * Usage: npx vite-node scripts/level-heights.ts
 */
import { readFileSync } from 'node:fs';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { generateTerrain } from '../src/sim/world/terrainGen';

const loop = ironbarkMap.tracks.filter((t) => t.id === 'knoll-loop' || t.id === 'west-bank');
const { terrain } = generateTerrain({ ...ironbarkMap, tracks: loop });
const bare = generateTerrain({ ...ironbarkMap, tracks: [] }).terrain;
for (const file of ['ironbarkKnoll', 'ironbarkCreek']) {
  const src = readFileSync(`src/data/levels/${file}.ts`, 'utf8');
  for (const m of src.matchAll(/joinLoop\((-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\)/g)) {
    const [x, z, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
    console.log(`${file} joinLoop(${x}, ${z}): written ${h}, loop ${terrain.heightAt(x, z).toFixed(2)}`);
  }
}
for (const [name, x, z] of process.argv.slice(2).map((a) => a.split(',')))
  console.log(
    `${name} (${x}, ${z}): loop-only ${terrain.heightAt(+x, +z).toFixed(2)}, bare ${bare.heightAt(+x, +z).toFixed(2)}`,
  );
