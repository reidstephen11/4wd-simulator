import * as THREE from 'three';
import { mulberry32 } from '../sim/world/rng';
import { patchFog } from './fog';

/** Where each leaf kind sits in the foliage texture (quarters of the square). */
export type LeafKind = 'gum' | 'broad' | 'fan' | 'frond';
export const leafQuadrant: Record<LeafKind, [number, number]> = {
  gum: [0, 0],
  broad: [1, 0],
  fan: [0, 1],
  frond: [1, 1],
};
const Q = 256;

/** Eucalyptus sprays: thin twigs with narrow hanging leaves. */
function drawGum(ctx: CanvasRenderingContext2D): void {
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
}

/** Rainforest: a dense mass of broad, glossy leaves. */
function drawBroad(ctx: CanvasRenderingContext2D): void {
  const rand = mulberry32(4411);
  for (let leaf = 0; leaf < 230; leaf++) {
    const r = Math.sqrt(rand()) * 104;
    const a = rand() * Math.PI * 2;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r * 0.86;
    const shade = Math.floor(120 + rand() * 135);
    ctx.fillStyle = `rgb(${shade},${shade},${Math.floor(shade * 0.92)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + rand() * 4, 11 + rand() * 7, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // A pale midrib catches the light.
    ctx.strokeStyle = `rgba(255,255,240,${0.15 + rand() * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 8, y + (rand() - 0.5) * 14);
    ctx.stroke();
  }
}

/** Fan palm leaf: a round, pleated fan split into wedges, attached at the centre. */
function drawFan(ctx: CanvasRenderingContext2D): void {
  const rand = mulberry32(5150);
  const wedges = 14;
  for (let k = 0; k < wedges; k++) {
    const a0 = (k / wedges) * Math.PI * 2 + 0.03;
    const a1 = ((k + 1) / wedges) * Math.PI * 2 - 0.03;
    const r = 108 + rand() * 12;
    const mid = (a0 + a1) / 2;
    // Each wedge folds along its middle: one half lit, one half in shade.
    for (const [from, to, shade] of [
      [a0, mid, 235],
      [mid, a1, 175],
    ] as const) {
      const s = Math.floor(shade - rand() * 25);
      ctx.fillStyle = `rgb(${s},${s},${Math.floor(s * 0.9)})`;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.arc(128, 128, r, from, to);
      ctx.closePath();
      ctx.fill();
    }
    // Ragged tips where the leaf has split.
    ctx.fillStyle = 'rgba(0,0,0,0)';
  }
  // Wedges split apart near the rim.
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < wedges; k++) {
    const a = (k / wedges) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60);
    ctx.lineTo(128 + Math.cos(a - 0.05) * 124, 128 + Math.sin(a - 0.05) * 124);
    ctx.lineTo(128 + Math.cos(a + 0.05) * 124, 128 + Math.sin(a + 0.05) * 124);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Tree fern frond: a central stem with paired leaflets, tapering to the tip (pointing up). */
function drawFrond(ctx: CanvasRenderingContext2D): void {
  const rand = mulberry32(6060);
  ctx.strokeStyle = '#b8a77e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(128, 250);
  ctx.lineTo(128, 6);
  ctx.stroke();
  for (let y = 240; y > 10; y -= 7) {
    const t = (250 - y) / 244;
    const len = 18 + 92 * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - t * 0.55);
    for (const side of [-1, 1]) {
      const shade = Math.floor(165 + rand() * 80);
      ctx.fillStyle = `rgb(${shade},${shade},${Math.floor(shade * 0.85)})`;
      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.quadraticCurveTo(128 + side * len * 0.5, y - 9, 128 + side * len, y - 14);
      ctx.quadraticCurveTo(128 + side * len * 0.5, y - 1, 128, y + 3);
      ctx.fill();
    }
  }
}

/** All four leaf kinds in one texture; mipmaps keep distant leaves from sparkling. */
function branchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Q * 2;
  const ctx = canvas.getContext('2d')!;
  const draws: Record<LeafKind, (c: CanvasRenderingContext2D) => void> = {
    gum: drawGum,
    broad: drawBroad,
    fan: drawFan,
    frond: drawFrond,
  };
  for (const kind of Object.keys(draws) as LeafKind[]) {
    const [qx, qy] = leafQuadrant[kind];
    ctx.save();
    // Canvas rows run down; texture v runs up, so the bottom quarter is v 0..0.5.
    ctx.translate(qx * Q, (1 - qy) * Q);
    ctx.beginPath();
    ctx.rect(2, 2, Q - 4, Q - 4);
    ctx.clip();
    draws[kind](ctx);
    ctx.restore();
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
  material.customProgramCacheKey = () => 'leaves-v2';
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
      'leaves-v2',
    ),
    depth: withLeaves(
      new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }),
      texture,
    ),
  };
}
