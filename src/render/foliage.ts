import * as THREE from 'three';
import { mulberry32 } from '../sim/world/rng';
import { patchFog } from './fog';

/** Eucalyptus sprays, generated once; mipmaps keep distant leaves from sparkling. */
function branchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(819);
  ctx.lineCap = 'round';
  for (let branch = 0; branch < 18; branch++) {
    const angle = rand() * Math.PI * 2;
    const length = 46 + rand() * 68;
    const x0 = 128 + (rand() - 0.5) * 28;
    const y0 = 128 + (rand() - 0.5) * 28;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.strokeStyle = '#9c9b83';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + dx * length, y0 + dy * length);
    ctx.stroke();
    for (let leaf = 0; leaf < 19; leaf++) {
      const t = 0.12 + rand() * 0.88;
      const side = leaf % 2 ? 1 : -1;
      const a = angle + side * (0.4 + rand() * 0.8);
      const reach = 6 + rand() * 15;
      const x = x0 + dx * length * t + Math.cos(a) * reach;
      const y = y0 + dy * length * t + Math.sin(a) * reach;
      const shade = Math.floor(158 + rand() * 97);
      ctx.fillStyle = `rgb(${shade},${shade},${Math.floor(shade * 0.88)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + rand() * 2.5, 7 + rand() * 6, a - Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Share the exact cutout between the visible and shadow shaders. */
function withLeaves<T extends THREE.Material>(material: T, texture: THREE.Texture): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.branchMap = { value: texture };
    shader.vertexShader = `varying vec2 vBranchUv;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvBranchUv = uv;',
    );
    shader.fragmentShader =
      `uniform sampler2D branchMap;\nvarying vec2 vBranchUv;\n${shader.fragmentShader}`.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
      if (vBranchUv.x >= 0.0) {
        vec4 leaf = texture2D(branchMap, vBranchUv);
        if (leaf.a < 0.45) discard;
        diffuseColor.rgb *= leaf.rgb;
      }`,
      );
  };
  material.customProgramCacheKey = () => 'eucalyptus-leaves-v1';
  return material;
}

export function createFoliageMaterials(): {
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
} {
  const texture = branchTexture();
  return {
    material: patchFog(
      withLeaves(
        new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        }),
        texture,
      ),
      'eucalyptus-leaves-v1',
    ),
    depth: withLeaves(
      new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }),
      texture,
    ),
  };
}
