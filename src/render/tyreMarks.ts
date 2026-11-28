import * as THREE from 'three';
import { MARK_FLOATS, MARK_RUT, MarkTone, rutLit, type TyreMarkStore } from '../sim/world/tyreMarks';
import { patchFog } from './fog';

/** Metres of trail one repeat of the tread pattern covers. */
const TREAD_REPEAT = 0.55;
/** How far the marks lie above the ground they were pressed into (m): clear of it, under the tyres. */
const LIFT = 0.025;
/**
 * How a mark in a full-depth rut is drawn (v0.30).
 */
export const RUT_LOOK = {
  /** How much darker the floor of a full-depth rut is than a flat mark, and how solid. */
  floorDark: 0.3,
  floorSolid: 0.72,
  /** The band along each edge inside the rut that is its wall (a share of the tyre's width). */
  wall: 0.24,
  /** How strongly the wall facing the sun is lightened, and the one facing away darkened. */
  wallLit: 0.7,
  wallShade: 0.55,
  /** The soil pushed up along each side of a full-depth rut: how far out it reaches (m) and how solid it is. */
  berm: 0.07,
  bermSolid: 0.6,
} as const;

/** The colour of a mark in each kind of ground: the ground itself, darker and damper. */
const tones: Record<MarkTone, THREE.Color> = {
  [MarkTone.Earth]: new THREE.Color('#3f2a1b'),
  [MarkTone.Clay]: new THREE.Color('#57281a'),
  [MarkTone.Mud]: new THREE.Color('#24160d'),
  [MarkTone.Sand]: new THREE.Color('#9c8a68'),
  [MarkTone.Gravel]: new THREE.Color('#5d4f41'),
  [MarkTone.Wet]: new THREE.Color('#2f2a26'),
  [MarkTone.Grass]: new THREE.Color('#3d4a22'),
};

/**
 * Near enough the ground's own colour for each tone (v0.30): what the soil pushed up beside a
 * rut and the sunlit wall of one are drawn in. The marks' own tones are that ground darker and
 * damper, and too dark to draw a rut's lit side with.
 */
const grounds: Record<MarkTone, THREE.Color> = {
  [MarkTone.Earth]: new THREE.Color('#7d5a3d'),
  [MarkTone.Clay]: new THREE.Color('#a4543a'),
  [MarkTone.Mud]: new THREE.Color('#54402f'),
  [MarkTone.Sand]: new THREE.Color('#d6c59f'),
  [MarkTone.Gravel]: new THREE.Color('#8f8273'),
  [MarkTone.Wet]: new THREE.Color('#5c544c'),
  [MarkTone.Grass]: new THREE.Color('#62793a'),
};

/**
 * A tyre's tread as it prints: two rows of shoulder blocks and angled centre lugs, with the
 * grooves between them left faint, so close up the mark reads as tread and from further off
 * (through the mipmaps) as one dark line. White, with the print in the alpha.
 */
function treadTexture(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      // Mirror across the tyre: the lugs slope back from the centre either side.
      const side = Math.abs(u - 0.5) * 2;
      let print: number;
      if (side > 0.62) {
        // Shoulder blocks: square, four to a repeat, staggered side to side.
        const k = (v * 4 + (u < 0.5 ? 0 : 0.5)) % 1;
        print = k < 0.68 ? 1 : 0.18;
      } else {
        // Centre lugs: bars sloping back from the middle, four to a repeat.
        const k = (v * 4 + side * 0.9) % 1;
        print = k < 0.6 ? 0.95 : 0.2;
      }
      // The groove between the centre and the shoulders, and a soft outer edge.
      if (side > 0.56 && side <= 0.62) print = 0.2;
      print *= Math.min(1, (1 - side) / 0.08);
      data.set([255, 255, 255, Math.round(print * 255)], (y * w + x) * 4);
    }
  const t = new THREE.DataTexture(data, w, h);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * The car's tyre marks, drawn (src/sim/world/tyreMarks.ts lays them): every piece is a strip of
 * ground-hugging quad carrying the tread print, tinted for the ground and as opaque as it is
 * strong. One mesh and one draw call; only the pieces laid since the last frame are written.
 *
 * A piece laid in a rut (v0.30, src/sim/world/rutDepth.ts) is shaded to look pressed in: a
 * darker, more solid floor the deeper the rut; a band along each edge inside it for its walls,
 * the one facing the sun lit and the other in shadow; and outside each edge a strip of paler
 * soil pushed up beside it, for which the quad is drawn a little wider than the tyre. The
 * quad itself stays flat on the ground.
 */
export class TyreMarksView {
  readonly mesh: THREE.Mesh;
  private readonly position: THREE.BufferAttribute;
  private readonly uv: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  /**
   * Per corner: how deep a rut the mark lies in (0 to 1), which of its walls the sun lights, and
   * how far beyond the tyre's edge the piece is drawn for the soil beside the rut (a share of
   * the tyre's width).
   */
  private readonly rut: THREE.BufferAttribute;
  /** Per corner: the ground's own colour there, for a rut's lit wall and the soil beside it. */
  private readonly ground: THREE.BufferAttribute;
  /** Towards the sun, for the walls of ruts laid from now on. */
  private readonly sun = new THREE.Vector3(0, 1, 0);
  /** Pieces of the store already written. */
  private written = 0;
  private readonly tint = new THREE.Color();

  constructor(private readonly store: TyreMarkStore) {
    const n = store.capacity;
    const g = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
    this.uv = new THREE.BufferAttribute(new Float32Array(n * 8), 2);
    this.color = new THREE.BufferAttribute(new Float32Array(n * 16), 4);
    this.rut = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
    this.ground = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
    for (const a of [this.position, this.uv, this.color, this.rut, this.ground])
      a.setUsage(THREE.DynamicDrawUsage);
    const index = new Uint32Array(n * 6);
    for (let k = 0; k < n; k++)
      index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 2, k * 4 + 1, k * 4 + 3], k * 6);
    g.setAttribute('position', this.position);
    g.setAttribute('uv', this.uv);
    g.setAttribute('color', this.color);
    g.setAttribute('rut', this.rut);
    g.setAttribute('rutGround', this.ground);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    // Flat on the ground: lit as the ground is, without working a normal out for every piece.
    const normal = new Float32Array(n * 12);
    for (let k = 1; k < normal.length; k += 3) normal[k] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    const lambert = new THREE.MeshLambertMaterial({
      map: treadTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    lambert.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `attribute vec3 rut; attribute vec3 rutGround; varying vec2 vRut; varying float vRutEdge; varying vec3 vRutGround;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vRut = rut.xy;\n  vRutEdge = rut.z;\n  vRutGround = rutGround;',
        );
      shader.fragmentShader =
        `varying vec2 vRut; varying float vRutEdge; varying vec3 vRutGround;\n${shader.fragmentShader}`.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        if (vRut.x > 0.0) {
          // Across the tyre: 0 at its left edge, 1 at its right. A rutted piece is drawn wider
          // than the tyre, so beyond 0 and 1 is the soil pushed up beside the rut.
          float u = vMapUv.x;
          float d = vRut.x;
          float sunLeft = max(0.0, vRut.y);
          float sunRight = max(0.0, -vRut.y);
          if (u < 0.0 || u > 1.0) {
            // The berm: the ground's own colour, a little paler where it faces the sun and
            // darker where it faces away, fading out away from the rut.
            float beyond = u < 0.0 ? -u : u - 1.0;
            float fade = 1.0 - smoothstep(0.0, vRutEdge, beyond);
            float away = u < 0.0 ? sunLeft : sunRight;
            float towards = u < 0.0 ? sunRight : sunLeft;
            diffuseColor.rgb = vRutGround * (1.0 + 0.22 * towards - 0.3 * away);
            diffuseColor.a = d * ${RUT_LOOK.bermSolid.toFixed(2)} * fade;
          } else {
            // The floor of the rut: damp ground, darker and more solid the deeper it is.
            vec3 floorColor = mix(diffuseColor.rgb, vRutGround, 0.42) * (1.0 - ${RUT_LOOK.floorDark.toFixed(2)} * d);
            diffuseColor.rgb = mix(diffuseColor.rgb, floorColor, d);
            diffuseColor.a = max(diffuseColor.a, d * ${RUT_LOOK.floorSolid.toFixed(2)});
            // Its walls: a band along each edge. The one that faces the sun is lit, the other dark.
            float left = 1.0 - smoothstep(0.0, ${RUT_LOOK.wall.toFixed(2)}, u);
            float right = smoothstep(${(1 - RUT_LOOK.wall).toFixed(2)}, 1.0, u);
            float lit = (left * sunLeft + right * sunRight) * d;
            float shade = (left * sunRight + right * sunLeft) * d;
            diffuseColor.rgb = mix(diffuseColor.rgb, vRutGround * 1.12, lit * ${RUT_LOOK.wallLit.toFixed(2)});
            diffuseColor.rgb *= 1.0 - ${RUT_LOOK.wallShade.toFixed(2)} * shade;
          }
        }`,
        );
    };
    const material = patchFog(lambert, 'tyre-marks-ruts');
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'tyre-marks';
    // The pieces are anywhere on the map and change every frame: never culled as one.
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    // Over the churned patches and the worn wheel lines, which lie on the ground too.
    this.mesh.renderOrder = 2;
  }

  /** Write the pieces laid since the last call. */
  update(): void {
    const s = this.store;
    if (s.laid === this.written) return;
    // More new pieces than slots (or the store was cleared): write them all again.
    const first =
      s.laid < this.written || s.laid - this.written > s.capacity ? s.laid - s.count : this.written;
    for (let k = first; k < s.laid; k++) this.write(k % s.capacity);
    this.written = s.laid;
    for (const a of [this.position, this.uv, this.color, this.rut, this.ground]) {
      a.clearUpdateRanges();
      const from = first % s.capacity;
      const to = ((s.laid - 1) % s.capacity) + 1;
      const size = a.itemSize * 4;
      // One run, or two where the new pieces wrap round the end of the ring.
      if (s.laid - first >= s.capacity) a.addUpdateRange(0, s.capacity * size);
      else if (to > from) a.addUpdateRange(from * size, (to - from) * size);
      else {
        a.addUpdateRange(from * size, (s.capacity - from) * size);
        a.addUpdateRange(0, to * size);
      }
      a.needsUpdate = true;
    }
    this.mesh.geometry.setDrawRange(0, s.count * 6);
  }

  private write(slot: number): void {
    const d = this.store.data;
    const o = slot * MARK_FLOATS;
    const p = this.position.array as Float32Array;
    const uv = this.uv.array as Float32Array;
    const rut = this.rut.array as Float32Array;
    const lit = rutLit(d, o, this.sun);
    const v = [d[o + 12] / TREAD_REPEAT, d[o + 13] / TREAD_REPEAT];
    // Each end of the piece: its left and right corners, widened for the soil beside a rut.
    for (let end = 0; end < 2; end++) {
      const l = o + end * 6;
      const r = l + 3;
      const depth = d[o + MARK_RUT + end];
      const ax = d[r] - d[l];
      const az = d[r + 2] - d[l + 2];
      const width = Math.hypot(ax, az) || 1;
      // A share of the tyre's width, each side.
      const edge = depth > 0 ? (RUT_LOOK.berm * Math.sqrt(depth)) / width : 0;
      for (let side = 0; side < 2; side++) {
        const c = end * 2 + side;
        const from = side ? r : l;
        const out = side ? edge : -edge;
        p[slot * 12 + c * 3] = d[from] + ax * out;
        p[slot * 12 + c * 3 + 1] = d[from + 1] + LIFT;
        p[slot * 12 + c * 3 + 2] = d[from + 2] + az * out;
        uv.set([side ? 1 + edge : -edge, v[end]], slot * 8 + c * 2);
        rut.set([depth, lit, edge], slot * 12 + c * 3);
      }
    }
    const col = this.color.array as Float32Array;
    const t = this.tint.copy(tones[d[o + 16] as MarkTone] ?? tones[MarkTone.Earth]);
    for (let c = 0; c < 4; c++) col.set([t.r, t.g, t.b, d[o + (c < 2 ? 14 : 15)]], slot * 16 + c * 4);
    const g = grounds[d[o + 16] as MarkTone] ?? grounds[MarkTone.Earth];
    const ground = this.ground.array as Float32Array;
    for (let c = 0; c < 4; c++) ground.set([g.r, g.g, g.b], slot * 12 + c * 3);
  }

  /** Where the sun is (pointing towards it), for the walls of the ruts laid from now on. */
  setSun(dir: THREE.Vector3): void {
    this.sun.copy(dir);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const m = this.mesh.material as THREE.MeshLambertMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
