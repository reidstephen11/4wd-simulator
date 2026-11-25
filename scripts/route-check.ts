/**
 * Dev helper: generate a map and report each track's length, height range and steepest
 * grades, and the ground under each waypoint before the tracks were graded.
 * Usage: npx vite-node scripts/route-check.ts [map id]
 */
import { isMapId, maps } from '../src/data/maps';
import { generateTerrain } from '../src/sim/world/terrainGen';
import { NO_WATER } from '../src/sim/world/terrain';

const mapId = process.argv[2] ?? 'ironbark';
if (!isMapId(mapId)) throw new Error(`Unknown map ${mapId}`);
const map = maps[mapId].def;
const t0 = performance.now();
const bare = generateTerrain({ ...map, tracks: [] }).terrain;
const { terrain, features } = generateTerrain(map);
console.log(`generated twice in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const deg = (r: number) => (Math.atan(r) * 180) / Math.PI;
let total = 0;
for (const t of features.tracks) {
  const p = t.profile;
  const s = t.poly.s;
  let worst = 0;
  let worstAt = 0;
  let wet = 0;
  for (let k = 0; k + 4 < p.length; k++) {
    const g = Math.abs(p[k + 4] - p[k]) / Math.max(0.1, s[k + 4] - s[k]);
    if (g > worst) {
      worst = g;
      worstAt = s[k];
    }
    const i = terrain.index(t.poly.xs[k], t.poly.zs[k]);
    if (terrain.water[i] > NO_WATER) wet = Math.max(wet, terrain.water[i] - terrain.heights[i]);
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of p) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  total += t.poly.length;
  console.log(
    `${t.def.id.padEnd(22)} ${t.poly.length.toFixed(0).padStart(5)} m  h ${lo.toFixed(1)}..${hi.toFixed(1)}  steepest ${deg(worst).toFixed(1)}° at ${worstAt.toFixed(0)} m${wet ? `  water ${wet.toFixed(2)} m` : ''}`,
  );
  const pts = t.def.points
    .map((q) => `${bare.heightAt(q[0], q[1]).toFixed(0)}${q.length === 3 ? `→${q[2]}` : ''}`)
    .join(' ');
  console.log(`   ground under waypoints: ${pts}`);
}
console.log(`total ${(total / 1000).toFixed(2)} km`);
for (const c of map.creeks)
  console.log(
    `${c.id.padEnd(14)} water/ground: ${c.points.map((p) => `${p.water}/${bare.heightAt(p.x, p.z).toFixed(0)}`).join(' ')}`,
  );
const args = process.argv.slice(3);
if (args[0] === 'grid') {
  // grid x0 x1 z0 z1 step: a table of bare ground heights (rows run north to south).
  const [x0, x1, z0, z1, step] = args.slice(1).map(Number);
  console.log(
    '      ' +
      Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) =>
        String(x0 + i * step).padStart(5),
      ).join(''),
  );
  for (let z = z0; z <= z1; z += step) {
    let row = String(z).padStart(5) + ' ';
    for (let x = x0; x <= x1; x += step) row += bare.heightAt(x, z).toFixed(0).padStart(5);
    console.log(row);
  }
} else {
  const probe = args.map(Number);
  for (let k = 0; k + 1 < probe.length; k += 2)
    console.log(`ground at ${probe[k]},${probe[k + 1]}: ${bare.heightAt(probe[k], probe[k + 1]).toFixed(1)}`);
}
