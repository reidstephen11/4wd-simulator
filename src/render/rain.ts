import * as THREE from 'three';
import { rainTuning as R } from '../data/particles';

const VERTEX = /* glsl */ `
attribute vec3 seed;
attribute float tip;
uniform vec3 centre;
uniform float time;
uniform vec2 wind;
uniform float amount;
uniform mat4 shelter;
uniform vec3 shelterHalf;
varying float vAlpha;

void main() {
  // Each drop falls down its own column of the box and wraps to the top; both ends of
  // a streak share the drop's seed, so they wrap together.
  float y = centre.y + ${R.height.toFixed(1)} * 0.5 - mod(seed.z * ${R.height.toFixed(1)} + time * ${R.speed.toFixed(1)}, ${R.height.toFixed(1)});
  vec2 xz = seed.xy * ${R.box.toFixed(1)} + wind * time;
  xz = centre.xz + mod(xz - centre.xz + ${(R.box / 2).toFixed(1)}, ${R.box.toFixed(1)}) - ${(R.box / 2).toFixed(1)};
  vec3 fall = normalize(vec3(wind.x, -${R.speed.toFixed(1)}, wind.y));
  vec3 p = vec3(xz.x, y, xz.y) - fall * ${R.length.toFixed(2)} * tip;
  // No rain inside the vehicle, and only as many drops as the rain is heavy.
  vec3 local = (shelter * vec4(p, 1.0)).xyz;
  float inside = step(abs(local.x), shelterHalf.x) * step(abs(local.y), shelterHalf.y) * step(abs(local.z), shelterHalf.z);
  float shown = step(seed.x * 0.37 + seed.y * 0.63, amount);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(mv.xyz);
  vAlpha = shown * (1.0 - inside) * smoothstep(0.3, 1.6, d) * (1.0 - smoothstep(${(R.box * 0.32).toFixed(1)}, ${(R.box * 0.5).toFixed(1)}, d));
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(color, opacity * vAlpha);
  #include <colorspace_fragment>
}
`;

/**
 * Falling rain: thin streaks in a box that follows the camera, moved entirely in the
 * vertex shader (no per-frame CPU work). The vehicle shelters a box around itself, so
 * no rain falls inside the cab.
 */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private readonly inverse = new THREE.Matrix4();
  private readonly offset = new THREE.Matrix4();
  private time = 0;

  constructor(intensity: number, particles: number) {
    const count = Math.round(R.drops * Math.min(1, Math.max(0.3, particles)));
    const seed = new Float32Array(count * 6);
    const tip = new Float32Array(count * 2);
    const position = new Float32Array(count * 6);
    let s = 0x9e3779b9;
    const rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const a = rand(),
        b = rand(),
        c = rand();
      seed.set([a, b, c, a, b, c], i * 6);
      tip[i * 2 + 1] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    // Positions come from the shader; this attribute only sizes the draw.
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    geometry.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        centre: { value: new THREE.Vector3() },
        time: { value: 0 },
        wind: { value: new THREE.Vector2(R.wind[0], R.wind[1]) },
        amount: { value: intensity },
        shelter: { value: new THREE.Matrix4() },
        shelterHalf: { value: new THREE.Vector3(...R.shelter.half) },
        color: { value: new THREE.Color(R.color) },
        opacity: { value: R.opacity },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.LineSegments(geometry, this.material);
    this.mesh.name = 'rain';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.offset.makeTranslation(-R.shelter.centre[0], -R.shelter.centre[1], -R.shelter.centre[2]);
  }

  /** Follow the camera and move the shelter with the vehicle (its world matrix). */
  update(camera: THREE.Vector3, vehicle: THREE.Matrix4, dt: number): void {
    // Wrapping the clock keeps the shader's arithmetic precise in long sessions.
    this.time = (this.time + dt) % 600;
    const u = this.material.uniforms;
    u.time.value = this.time;
    u.centre.value.copy(camera);
    this.inverse.copy(vehicle).invert();
    u.shelter.value.multiplyMatrices(this.offset, this.inverse);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
