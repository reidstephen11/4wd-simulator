import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';
import { Noise2D } from '../sim/world/noise';
import { pal } from './colors';
import { patchFog } from './fog';

/** Unit vector pointing towards the sun. North is -z, east is +x. */
export function sunDirection(env: EnvironmentConfig, out = new THREE.Vector3()): THREE.Vector3 {
  const az = (env.sun.azimuthDeg * Math.PI) / 180;
  const el = (env.sun.elevationDeg * Math.PI) / 180;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 ground;
uniform vec3 sunGlow;
uniform vec3 sunDir;
uniform float glowSize;
varying vec3 vDir;
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(cloudHash(i),cloudHash(i+vec2(1,0)),f.x),
             mix(cloudHash(i+vec2(0,1)),cloudHash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec3 d = normalize( vDir );
  float up = d.y;
  vec3 col = mix( horizon, zenith, pow( smoothstep( 0.0, 1.0, up ), 0.55 ) );
  col = mix( col, ground, smoothstep( 0.0, -0.08, up ) );
  float s = max( dot( d, sunDir ), 0.0 );
  col += sunGlow * ( pow( s, 1.0 / glowSize ) * 0.55 + pow( s, 900.0 ) * 1.6 );
  if (up > 0.025) {
    vec2 p = d.xz / (up + 0.16) * 2.8;
    float n = cloudNoise(p) * 0.6 + cloudNoise(p * 2.1) * 0.27 + cloudNoise(p * 4.3) * 0.13;
    float cloud = smoothstep(0.57, 0.78, n) * smoothstep(0.025, 0.17, up);
    col = mix(col, mix(horizon, vec3(0.91, 0.93, 0.91), 0.55), cloud * 0.6);
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}
`;

/** Gradient sky dome with a soft sun glow (SPEC §4). Always centred on the camera. */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(env: EnvironmentConfig) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        horizon: { value: new THREE.Color() },
        zenith: { value: new THREE.Color() },
        ground: { value: new THREE.Color() },
        sunGlow: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3() },
        glowSize: { value: 0.1 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      // The sky shows the Environment colours as authored, without tone mapping.
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.setEnvironment(env);
  }

  setEnvironment(env: EnvironmentConfig): void {
    const u = this.material.uniforms;
    u.horizon.value.set(env.sky.horizon);
    u.zenith.value.set(env.sky.zenith);
    u.ground.value.set(env.sky.groundColor);
    u.sunGlow.value.set(env.sky.sunGlow);
    u.glowSize.value = env.sky.sunGlowSize;
    sunDirection(env, u.sunDir.value);
  }

  update(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}

/**
 * Distant ridge silhouettes outside the map so the horizon is never empty.
 * Three rings of low-poly hills that the haze turns blue.
 */
export function createBackdrop(seed: number): THREE.Mesh {
  const noise = new Noise2D(seed + 77);
  const positions: number[] = [];
  const colors: number[] = [];
  const segs = 180;
  const layers = [
    { r: 1500, depth: 500, h: 300, var: 220 },
    { r: 2150, depth: 700, h: 430, var: 260 },
    { r: 2900, depth: 900, h: 560, var: 300 },
  ];
  const base = pal('foliageDark');
  const c = new THREE.Color();
  layers.forEach((L, li) => {
    const crest: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 3 + li * 10, Math.sin(a) * 3, 4);
      crest.push(Math.max(40, L.h + n * L.var * 1.6));
    }
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const pts = (a: number, r: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const inner0 = pts(a0, L.r, -60);
      const inner1 = pts(a1, L.r, -60);
      const top0 = pts(a0, L.r + L.depth * 0.5, crest[i]);
      const top1 = pts(a1, L.r + L.depth * 0.5, crest[i + 1]);
      const out0 = pts(a0, L.r + L.depth, -60);
      const out1 = pts(a1, L.r + L.depth, -60);
      // Front face (towards the map) and back face.
      positions.push(...inner0, ...top0, ...inner1, ...inner1, ...top0, ...top1);
      positions.push(...top0, ...out0, ...top1, ...top1, ...out0, ...out1);
      c.copy(base).multiplyScalar(0.9 + (0.2 * ((i * 7919 + li * 31) % 13)) / 13);
      for (let k = 0; k < 12; k++) colors.push(c.r, c.g, c.b);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = patchFog(
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
