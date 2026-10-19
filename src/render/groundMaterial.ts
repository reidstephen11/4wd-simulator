import * as THREE from 'three';
import { patchFog } from './fog';

/** Shared by every ground material: 0 = dry, 1 = soaked (darker, with a damp sheen). */
export const groundUniforms = { groundWetness: { value: 0 } };

/** World-space detail stays aligned across terrain chunks and every LOD. */
export function createGroundMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundWetness = groundUniforms.groundWetness;
    shader.vertexShader =
      `attribute vec2 ground; varying vec2 vGround; varying vec3 vGroundPosition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGround = ground; vGroundPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader = /* glsl */ `
      varying vec2 vGround;
      varying vec3 vGroundPosition;
      uniform float groundWetness;
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
  return patchFog(material, 'ground-detail-v2');
}
