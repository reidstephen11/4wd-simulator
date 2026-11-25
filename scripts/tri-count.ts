/**
 * Dev helper: triangle counts for each vehicle look (body, four wheels and the two planks it carries),
 * built the same way the studio page builds a model. Usage: npx vite-node scripts/tri-count.ts [ids...]
 */
import type * as THREE from 'three';
import { vehicles } from '../src/data/vehicles';
import type { VehicleId } from '../src/data/vehicle';
import { vehicleLooks } from '../src/render/vehicleLooks';

const tris = (g: THREE.BufferGeometry): number =>
  g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
const k = (n: number): string => `${(n / 1000).toFixed(1)}k`;
const ids = (process.argv.length > 2 ? process.argv.slice(2) : Object.keys(vehicleLooks)) as VehicleId[];
console.log('| vehicle | total | body | per wheel | planks |');
console.log('| --- | --- | --- | --- | --- |');
for (const id of ids) {
  const look = vehicleLooks[id];
  const tuning = vehicles[id].tuning;
  const wheel = look.wheel(tuning);
  const body = look.body(tuning, wheel);
  const planks = [0, 1].map((i) => tris(look.plank(i)));
  const plankSum = planks.reduce((a, b) => a + b, 0);
  const total = tris(body) + 4 * tris(wheel) + plankSum;
  console.log(`| ${id} | ${k(total)} | ${k(tris(body))} | ${k(tris(wheel))} | ${k(plankSum)} |`);
}
