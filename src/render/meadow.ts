import * as THREE from 'three';
import type { QualityPreset } from '../data/quality';
import { SurfaceId } from '../data/surfaces';
import type { World } from '../sim/world/world';
import { GroundTint } from '../sim/world/terrain';
import { hash2 } from '../sim/world/rng';
import { pal } from './colors';
import { patchFog } from './fog';

/** Fine, short grass between the larger tussocks. One instanced draw, no shadow pass. */
export class Meadow {
  readonly mesh: THREE.InstancedMesh;
  private readonly wind = { value: 0 };
  private cellX = Infinity;
  private cellZ = Infinity;
  private quality: QualityPreset;

  constructor(
    private readonly world: World,
    quality: QualityPreset,
  ) {
    this.quality = quality;
    const positions: number[] = [],
      colors: number[] = [];
    const root = pal('grassSage').clone().lerp(pal('foliageDark'), 0.25);
    const tip = pal('grassDry').clone().multiplyScalar(1.15);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4;
      const x = Math.cos(angle),
        z = Math.sin(angle);
      const height = 0.22 + (i % 3) * 0.06;
      positions.push(-z * 0.018, 0, x * 0.018, z * 0.018, 0, -x * 0.018, x * 0.15, height, z * 0.15);
      colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassTime = this.wind;
      shader.vertexShader = `uniform float grassTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.x += sin(grassTime * 1.4 + instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2) * position.y * 0.14;`,
      );
    };
    patchFog(material, 'meadow-wind-v1');
    this.mesh = new THREE.InstancedMesh(geometry, material, 10000);
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'meadow';
  }

  setQuality(quality: QualityPreset): void {
    this.quality = quality;
    this.cellX = Infinity;
  }

  update(eye: THREE.Vector3, dt: number): void {
    this.wind.value += dt;
    const cellX = Math.floor(eye.x / 8),
      cellZ = Math.floor(eye.z / 8);
    if (this.cellX === cellX && this.cellZ === cellZ) return;
    this.cellX = cellX;
    this.cellZ = cellZ;
    const radius = Math.min(42, this.quality.grassDistance * 0.3);
    const spacing = 0.8;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(),
      scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    const terrain = this.world.terrain;
    let count = 0;
    const cx = (cellX + 0.5) * 8,
      cz = (cellZ + 0.5) * 8;
    for (let gz = Math.floor((cz - radius) / spacing); gz <= (cz + radius) / spacing; gz++) {
      for (let gx = Math.floor((cx - radius) / spacing); gx <= (cx + radius) / spacing; gx++) {
        const seed = hash2(gx, gz, this.world.map.seed + 903);
        if (seed > this.quality.vegetationDensity || count >= 10000) continue;
        const x = (gx + hash2(gx, gz, 17) * 0.8) * spacing;
        const z = (gz + hash2(gx, gz, 29) * 0.8) * spacing;
        const distance = Math.hypot(x - cx, z - cz);
        if (distance > radius || !terrain.inBounds(x, z) || terrain.surfaceAt(x, z) !== SurfaceId.Grass)
          continue;
        const index = Math.round(z + terrain.half) * terrain.res + Math.round(x + terrain.half);
        if (this.world.features.trackDistance[index] < 1.3 || this.world.features.creekDistance[index] < 1)
          continue;
        if (terrain.tint[index] === GroundTint.ForestFloor && seed > 0.23) continue;
        // Tiny blades at the boundary hide the rebuild and the edge of the patch.
        const fade = Math.min(1, Math.max(0, (radius - distance) / 8));
        const s = (0.7 + seed * 0.8) * fade;
        position.set(x, terrain.heightAt(x, z) - 0.025, z);
        rotation.setFromAxisAngle(axis, seed * Math.PI * 2);
        scale.set(s, s, s);
        matrix.compose(position, rotation, scale);
        this.mesh.setMatrixAt(count++, matrix);
      }
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }
}
