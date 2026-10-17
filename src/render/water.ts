import * as THREE from 'three';
import { NO_WATER, type Terrain } from '../sim/world/terrain';
import { pal } from './colors';
import { patchFog } from './fog';

const TILE = 128;

/**
 * Creek water surface built from the terrain's water grid: reflective, animated and translucent,
 * coloured from shallow to deep, with pale foam where the surface is steep (the Falls).
 */
export class WaterMesh {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly time = { value: 0 };

  constructor(terrain: Terrain, _seed: number, levelOffset = 0) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      roughness: 0.22,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = this.time;
      shader.vertexShader = `varying vec3 vWaterPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWaterPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
      shader.fragmentShader =
        `uniform float waterTime; varying vec3 vWaterPosition;\n${shader.fragmentShader}`
          .replace(
            '#include <normal_fragment_maps>',
            `
          #include <normal_fragment_maps>
          vec2 p = vWaterPosition.xz;
          float waveX = cos(p.x * 3.1 + p.y * 1.8 + waterTime * 1.3) * 0.045
                      + cos(p.x * 8.0 - p.y * 3.0 - waterTime * 2.1) * 0.018;
          float waveZ = sin(p.y * 4.2 - p.x * 1.2 + waterTime * 1.6) * 0.04;
          normal = normalize(normal + mat3(viewMatrix) * vec3(waveX, 0.0, waveZ));
        `,
          )
          .replace(
            '#include <opaque_fragment>',
            `
          float fresnel = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
          outgoingLight = mix(outgoingLight, vec3(0.39, 0.51, 0.52), fresnel * 0.35);
          diffuseColor.a = 0.68 + fresnel * 0.29;
          #include <opaque_fragment>
        `,
          );
    };
    patchFog(this.material, 'flowing-water-v1');
    this.group.name = 'water';
    const res = terrain.res;
    const half = terrain.half;
    const W = terrain.water;
    const H = terrain.heights;
    const shallow = pal('waterShallow');
    const deep = pal('waterDeep');
    const foam = pal('barkPale');
    const tmp = new THREE.Color();
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
            tmp.copy(shallow).lerp(deep, Math.min(1, Math.max(0, (depth - 0.2) / 0.6)));
            if (steep > 0.35) tmp.lerp(foam, Math.min(0.85, (steep - 0.35) * 0.6));
            const x0 = ix - half;
            const z0 = iz - half;
            const tri = (a: number[], b: number[], c: number[]) => {
              pos.push(...a, ...b, ...c);
              for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
            };
            const p00 = [x0, w00, z0];
            const p10 = [x0 + 1, w10, z0];
            const p01 = [x0, w01, z0 + 1];
            const p11 = [x0 + 1, w11, z0 + 1];
            tri(p00, p11, p10);
            tri(p00, p01, p11);
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
  update(dt: number): void {
    this.time.value += dt;
  }
}
