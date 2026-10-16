import * as THREE from 'three';
import { NO_WATER, type Terrain } from '../sim/world/terrain';
import { hash2 } from '../sim/world/rng';
import { pal, varyColor } from './colors';
import { patchFog } from './fog';

const TILE = 128;

/**
 * Creek water surface built from the terrain's water grid: flat-shaded, see-through,
 * coloured from shallow to deep, with pale foam where the surface is steep (the Falls).
 */
export class WaterMesh {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;

  constructor(terrain: Terrain, seed: number, levelOffset = 0) {
    this.material = patchFog(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        roughness: 0.35,
        metalness: 0.0,
        depthWrite: false,
        flatShading: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      }),
    );
    this.group.name = 'water';
    const res = terrain.res;
    const half = terrain.half;
    const W = terrain.water;
    const H = terrain.heights;
    const shallow = pal('waterShallow');
    const deep = pal('waterDeep');
    const foam = pal('barkPale');
    const tmp = new THREE.Color();
    const tmp2 = new THREE.Color();
    const tiles = terrain.size / TILE;
    for (let tz = 0; tz < tiles; tz++)
      for (let tx = 0; tx < tiles; tx++) {
        const pos: number[] = [];
        const col: number[] = [];
        for (let iz = tz * TILE; iz < (tz + 1) * TILE; iz++)
          for (let ix = tx * TILE; ix < (tx + 1) * TILE; ix++) {
            const i00 = iz * res + ix;
            const i10 = i00 + 1;
            const i01 = i00 + res;
            const i11 = i01 + 1;
            const w = [W[i00], W[i10], W[i01], W[i11]];
            let maxW = NO_WATER;
            for (const x of w) if (x > maxW) maxW = x;
            if (maxW <= NO_WATER) continue;
            for (let k = 0; k < 4; k++) if (w[k] <= NO_WATER) w[k] = maxW;
            const [w00, w10, w01, w11] = w.map((x) => x + levelOffset);
            const bed = (H[i00] + H[i10] + H[i01] + H[i11]) / 4;
            const depth = (w00 + w10 + w01 + w11) / 4 - bed;
            const steep = Math.max(Math.abs(w10 - w00), Math.abs(w01 - w00), Math.abs(w11 - w00));
            tmp.copy(shallow).lerp(deep, Math.min(1, Math.max(0, (depth - 0.25) / 0.8)));
            if (steep > 0.35) tmp.lerp(foam, Math.min(0.85, (steep - 0.35) * 0.6));
            const x0 = ix - half;
            const z0 = iz - half;
            const tri = (a: number[], b: number[], c: number[], salt: number) => {
              pos.push(...a, ...b, ...c);
              varyColor(tmp, hash2(ix * 2 + salt, iz, seed + 9), 0.5, tmp2);
              for (let k = 0; k < 3; k++) col.push(tmp2.r, tmp2.g, tmp2.b);
            };
            const p00 = [x0, w00, z0];
            const p10 = [x0 + 1, w10, z0];
            const p01 = [x0, w01, z0 + 1];
            const p11 = [x0 + 1, w11, z0 + 1];
            tri(p00, p11, p10, 0);
            tri(p00, p01, p11, 1);
          }
        if (pos.length === 0) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.renderOrder = 10;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
  }
}
