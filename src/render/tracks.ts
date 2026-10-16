import * as THREE from 'three';
import type { World } from '../sim/world/world';
import { hash2 } from '../sim/world/rng';
import { pal, varyColor } from './colors';
import { patchFog } from './fog';

const CELL = 256;
const RUT_OFFSET = 0.74;

/**
 * Wheel ruts drawn as thin ribbons on top of the terrain (SPEC §5 "worn ruts", and the
 * only visible sign of faint tracks). Batched per 256 m cell and hidden far away.
 */
export class TrackRuts {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private readonly cells: { mesh: THREE.Mesh; cx: number; cz: number }[] = [];

  constructor(world: World) {
    this.material = patchFog(
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
      'ruts',
    );
    this.group.name = 'ruts';
    const buckets = new Map<string, { pos: number[]; col: number[] }>();
    const t = world.terrain;
    const tmp = new THREE.Color();
    for (const track of world.features.tracks) {
      const def = track.def;
      if (def.surface !== 'dirt') continue;
      const faint = !!def.faint;
      const width = faint ? 0.42 : 0.34;
      const base = faint ? pal('grassDry').clone().lerp(pal('dirtTrack'), 0.6) : pal('dirtDark');
      const poly = track.poly;
      for (let k = 0; k < poly.count - 1; k++) {
        const x0 = poly.xs[k];
        const z0 = poly.zs[k];
        const x1 = poly.xs[k + 1];
        const z1 = poly.zs[k + 1];
        if (t.waterDepthAt(x0, z0) > 0 || t.waterDepthAt(x1, z1) > 0) continue;
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz) || 1;
        // Left normal.
        const nx = -dz / len;
        const nz = dx / len;
        const key = `${Math.floor(x0 / CELL)}:${Math.floor(z0 / CELL)}`;
        let bucket = buckets.get(key);
        if (!bucket) buckets.set(key, (bucket = { pos: [], col: [] }));
        for (const side of [-1, 1]) {
          const o = side * RUT_OFFSET;
          const corner = (x: number, z: number, w: number) => {
            const px = x + nx * (o + w);
            const pz = z + nz * (o + w);
            return [px, t.heightAt(px, pz) + 0.035, pz];
          };
          const a = corner(x0, z0, -width / 2);
          const b = corner(x0, z0, width / 2);
          const c = corner(x1, z1, width / 2);
          const d = corner(x1, z1, -width / 2);
          bucket.pos.push(...a, ...c, ...b, ...a, ...d, ...c);
          varyColor(base, hash2(k, side, 7), hash2(side, k, 9), tmp);
          for (let i = 0; i < 6; i++) bucket.col.push(tmp.r, tmp.g, tmp.b);
        }
      }
    }
    for (const [key, b] of buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      const [cx, cz] = key.split(':').map(Number);
      this.cells.push({ mesh, cx: (cx + 0.5) * CELL, cz: (cz + 0.5) * CELL });
      this.group.add(mesh);
    }
  }

  update(eye: THREE.Vector3, maxDistance: number): void {
    for (const c of this.cells)
      c.mesh.visible = Math.hypot(c.cx - eye.x, c.cz - eye.z) < maxDistance + CELL * 0.7;
  }
}
