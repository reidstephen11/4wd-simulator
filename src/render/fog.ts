import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';

/**
 * Two-colour distance haze (SPEC §4): warm near haze shifting to eucalyptus blue on
 * distant ridges. Shared uniforms so every patched material follows the Environment.
 */
export const fogUniforms = {
  fogFarColor: { value: new THREE.Color() },
  fogShiftEnd: { value: 1000 },
  fogMaxAmount: { value: 0.8 },
  fogScale: { value: 800 },
};

export function applyFogEnvironment(scene: THREE.Scene, env: EnvironmentConfig, drawDistance: number): void {
  const end = Math.min(env.fog.end, drawDistance * 0.95);
  scene.fog = new THREE.Fog(new THREE.Color(env.fog.nearColor), env.fog.start, end);
  fogUniforms.fogFarColor.value.set(env.fog.farColor);
  fogUniforms.fogShiftEnd.value = env.fog.colorShiftEnd;
  fogUniforms.fogMaxAmount.value = env.fog.maxAmount;
  fogUniforms.fogScale.value = (end - env.fog.start) / 3;
}

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = length( mvPosition.xyz );
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogFarColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float fogShiftEnd;
  uniform float fogMaxAmount;
  uniform float fogScale;
  varying float vFogDepth;
#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  float fogD = max( 0.0, vFogDepth - fogNear );
  float fogFactor = fogMaxAmount * ( 1.0 - exp( -fogD / fogScale ) );
  vec3 fogCol = mix( fogColor, fogFarColor, smoothstep( fogNear, fogShiftEnd, vFogDepth ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;

/**
 * Patch a built-in material so it uses the two-colour haze. Materials that add their own
 * shader changes in `onBeforeCompile` (set before calling this) must pass a unique `key`.
 */
export function patchFog<T extends THREE.Material>(material: T, key = ''): T {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.fogFarColor = fogUniforms.fogFarColor;
    shader.uniforms.fogShiftEnd = fogUniforms.fogShiftEnd;
    shader.uniforms.fogMaxAmount = fogUniforms.fogMaxAmount;
    shader.uniforms.fogScale = fogUniforms.fogScale;
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', FOG_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', FOG_PARS_FRAGMENT)
      .replace('#include <fog_fragment>', FOG_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'fog2|' + key;
  return material;
}

/** GLSL helper for custom shaders (sky, water) that want the same haze. */
export const fogGlsl = { FOG_PARS_FRAGMENT, FOG_FRAGMENT, FOG_VERTEX };
