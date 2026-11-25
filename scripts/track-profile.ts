/**
 * Dev helper: print one track's graded profile against the bare ground every few metres,
 * with the grade, water and surface. Usage: npx vite-node scripts/track-profile.ts <track id> [step] [from] [to] [map id]
 */
import { isMapId, maps } from '../src/data/maps';
import { generateTerrain } from '../src/sim/world/terrainGen';
import { trailPoint } from '../src/sim/world/crawlTrail';

const [id, step = '5', from = '0', to = '1e9', mapId = 'ironbark'] = process.argv.slice(2);
if (!isMapId(mapId)) throw new Error(`Unknown map ${mapId}`);
const map = maps[mapId].def;
const bare = generateTerrain({ ...map, tracks: [] }).terrain;
const { terrain, features } = generateTerrain(map);
const t = features.tracks.find((x) => x.def.id === id);
if (!t) throw new Error(`Unknown track ${id}`);
const deg = (r: number) => (Math.atan(r) * 180) / Math.PI;
for (let s = Number(from); s <= Math.min(Number(to), t.poly.length); s += Number(step)) {
  const p = trailPoint(t, s);
  const q = trailPoint(t, Math.min(t.poly.length, s + 4));
  const h = terrain.heightAt(p.x, p.z);
  const grade = deg((terrain.heightAt(q.x, q.z) - h) / 4);
  const water = terrain.waterDepthAt(p.x, p.z);
  console.log(
    `${s.toFixed(0).padStart(5)} m  (${p.x.toFixed(0)}, ${p.z.toFixed(0)})  track ${h.toFixed(1).padStart(6)}  ground ${bare.heightAt(p.x, p.z).toFixed(1).padStart(6)}  grade ${grade.toFixed(1).padStart(6)}°${water > 0 ? `  water ${water.toFixed(2)}` : ''}  surface ${terrain.surfaceAt(p.x, p.z)}`,
  );
}
