import * as THREE from 'three';
import { patchFog } from './fog';
import { canopyUniforms } from './shadowReach';

/** Shared by every ground material: 0 = dry, 1 = soaked (darker, with a damp sheen). */
export const groundUniforms = { groundWetness: { value: 0 } };

/** How the ground blends a track into the ground beside it (see `TerrainMesh`). */
export interface TrackEdgeStyle {
  /** Half-width (m) of the blend where a track's paint ends. */
  paintBlend: number;
  /** Half-width (m) of the blend into the darker band inside a track's edge. */
  bandBlend: number;
  /** Colour of that band. */
  band: THREE.Color;
  /** Half-widths (m) of the blends at a ground patch's edge and into its rim. */
  patchBlend: number;
  rimBlend: number;
  /** Colours rut floors darken and hump crests pale towards. */
  rut: THREE.Color;
  crest: THREE.Color;
}

const glslColor = (c: THREE.Color) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

/**
 * World-space detail stays aligned across terrain chunks and every LOD. The edges of tracks
 * and ground patches are blended per pixel from the distance to them, so they don't follow
 * the triangles.
 */
export function createGroundMaterial(edge: TrackEdgeStyle): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
  // Beyond the shadow map the ground is shaded by the tree cover above it (shadowReach.ts).
  material.defines = { ...material.defines, SHADOW_FAR_SHADE: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundWetness = groundUniforms.groundWetness;
    Object.assign(shader.uniforms, canopyUniforms);
    shader.vertexShader = `attribute vec2 ground; attribute vec3 trackColor; attribute vec4 trackEdge;
      attribute vec3 patchInner; attribute vec3 patchRim; attribute vec2 patchEdge;
      attribute vec4 patchCircle; attribute vec2 clayBank; attribute float trackRight;
      varying vec4 vGround; varying vec4 vGroundPosition; varying vec3 vTrackColor; varying vec4 vTrackEdge;
      varying vec3 vPatchInner; varying vec3 vPatchRim; varying vec4 vPatchCircle; varying float vTrackRight;
      varying vec2 vClayBank;
      ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
        vGround = vec4(ground, patchEdge); vGroundPosition = vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0); vClayBank = clayBank;
        vTrackColor = trackColor; vTrackEdge = trackEdge;
        vPatchInner = patchInner; vPatchRim = patchRim; vPatchCircle = patchCircle; vTrackRight = trackRight;`,
    );
    shader.fragmentShader = /* glsl */ `
      // xy: rockiness and wetness; zw: a ground patch's edge distance and rim width.
      varying vec4 vGround;
      varying vec4 vGroundPosition;
      // How far a clay bank reaches beyond the track's left and right edges.
      varying vec2 vClayBank;
      varying vec3 vTrackColor;
      varying vec4 vTrackEdge;
      varying vec3 vPatchInner;
      varying vec3 vPatchRim;
      varying vec4 vPatchCircle;
      // The distance out from a track's right edge (vTrackEdge.x: from its left edge).
      varying float vTrackRight;
      uniform float groundWetness;
      uniform sampler2D canopyMap;
      uniform vec4 canopyBox;
      uniform vec2 canopyShift;
      uniform float canopyStrength;
      float groundHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float groundNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), f.x),
                   mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1, 1)), f.x), f.y);
      }
      ${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        vec2 groundP = vGroundPosition.xz;
        #ifdef USE_SHADOWMAP
          // The sun left under the trees, for where no shadow is drawn: the cover map, read
          // where this ground's shadow would come from.
          shadowFarLit = 1.0 - canopyStrength *
            texture2D(canopyMap, (groundP + canopyShift + canopyBox.xy) * canopyBox.zw).r;
        #endif
        // A clay bank beside the track, under the track's paint so only its outer edge shows:
        // the distance out from the nearer edge of the track, less the bank's reach there.
        float bankDist = (vTrackEdge.x >= vTrackRight ? vTrackEdge.x - vClayBank.x : vTrackRight - vClayBank.y) +
          (groundNoise(groundP * 1.1 - 31.0) - 0.5) * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(edge.band)},
          1.0 - smoothstep(-${edge.patchBlend.toFixed(3)}, ${edge.patchBlend.toFixed(3)}, bankDist));
        // Track paint: x and vTrackRight are the distances out from the track's left and right
        // edges (the greater is the distance from its nearer edge), a little ragged so the
        // line isn't ruled; y where the paint ends; z the darker band's width (0: none).
        float edgeDist = max(vTrackEdge.x, vTrackRight) + (groundNoise(groundP * 0.8) - 0.5) * 0.3;
        float paintCover = 1.0 - smoothstep(vTrackEdge.y - ${edge.paintBlend.toFixed(3)}, vTrackEdge.y + ${edge.paintBlend.toFixed(3)}, edgeDist);
        // The band fades out with its width, so it doesn't stop at a line.
        float paintBand =
          smoothstep(-vTrackEdge.z - ${edge.bandBlend.toFixed(3)}, -vTrackEdge.z + ${edge.bandBlend.toFixed(3)}, edgeDist) *
          clamp(vTrackEdge.z * 10.0, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vTrackColor, ${glslColor(edge.band)}, paintBand), paintCover);
        // A ground patch over that (a washout, a bog, a creek bank): the distance out from
        // its edge and its rim's width. A round one gives its centre and radius instead, as
        // the 1 m samples would draw a circle as a diamond.
        float circleDist = length(groundP - vPatchCircle.xy) - vPatchCircle.z;
        float patchDist = mix(vGround.z, circleDist, vPatchCircle.w) +
          (groundNoise(groundP * 1.3 + 17.0) - 0.5) * 0.25;
        float patchCover = 1.0 - smoothstep(-${edge.patchBlend.toFixed(3)}, ${edge.patchBlend.toFixed(3)}, patchDist);
        float patchRim =
          smoothstep(-vGround.w - ${edge.rimBlend.toFixed(3)}, -vGround.w + ${edge.rimBlend.toFixed(3)}, patchDist) *
          clamp(vGround.w * 10.0, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vPatchInner, vPatchRim, patchRim), patchCover);
        // w: rut floors darker, hump crests paler.
        diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(edge.rut)}, max(0.0, -vTrackEdge.w) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(edge.crest)}, max(0.0, vTrackEdge.w) * 0.35);
        float broad = groundNoise(groundP * 0.19);
        float grain = groundNoise(groundP * 15.0);
        float detailFade = 1.0 - smoothstep(0.025, 0.16, length(fwidth(groundP)));
        float fleck = smoothstep(0.69, 0.82, grain) * detailFade;
        diffuseColor.rgb *= 0.94 + broad * 0.12 + (grain - 0.5) * 0.08 * detailFade;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.45, fleck * (0.12 + vGround.x * 0.18));
        // Wet ground is darker and a little richer in colour.
        float wetLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(wetLuma), diffuseColor.rgb, 1.15) * 0.66, groundWetness);
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.38, vGround.y) - fleck * 0.08;
        roughnessFactor = mix(roughnessFactor, 0.5, groundWetness * 0.7);
      `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        // Fine surface relief without displacing the driving surface.
        float relief = groundNoise(groundP * 5.5) * 0.018 * detailFade;
        vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
        vec3 rx = cross(dy, normal), ry = cross(normal, dx);
        float det = dot(dx, rx);
        normal = normalize(abs(det) * normal - sign(det) * (dFdx(relief) * rx + dFdy(relief) * ry));
      `,
      );
  };
  return patchFog(material, 'ground-detail-v5');
}
