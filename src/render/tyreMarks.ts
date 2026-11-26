import * as THREE from 'three';
import { MARK_FLOATS, MarkTone, type TyreMarkStore } from '../sim/world/tyreMarks';
import { patchFog } from './fog';

/** Metres of trail one repeat of the tread pattern covers. */
const TREAD_REPEAT = 0.55;
/** How far the marks lie above the ground they were pressed into (m): clear of it, under the tyres. */
const LIFT = 0.025;

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
 */
export class TyreMarksView {
  readonly mesh: THREE.Mesh;
  private readonly position: THREE.BufferAttribute;
  private readonly uv: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  /** Pieces of the store already written. */
  private written = 0;
  private readonly tint = new THREE.Color();

  constructor(private readonly store: TyreMarkStore) {
    const n = store.capacity;
    const g = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
    this.uv = new THREE.BufferAttribute(new Float32Array(n * 8), 2);
    this.color = new THREE.BufferAttribute(new Float32Array(n * 16), 4);
    for (const a of [this.position, this.uv, this.color]) a.setUsage(THREE.DynamicDrawUsage);
    const index = new Uint32Array(n * 6);
    for (let k = 0; k < n; k++)
      index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 2, k * 4 + 1, k * 4 + 3], k * 6);
    g.setAttribute('position', this.position);
    g.setAttribute('uv', this.uv);
    g.setAttribute('color', this.color);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    // Flat on the ground: lit as the ground is, without working a normal out for every piece.
    const normal = new Float32Array(n * 12);
    for (let k = 1; k < normal.length; k += 3) normal[k] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    const material = patchFog(
      new THREE.MeshLambertMaterial({
        map: treadTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      'tyre-marks',
    );
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
    for (const a of [this.position, this.uv, this.color]) {
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
    for (let c = 0; c < 4; c++) {
      p[slot * 12 + c * 3] = d[o + c * 3];
      p[slot * 12 + c * 3 + 1] = d[o + c * 3 + 1] + LIFT;
      p[slot * 12 + c * 3 + 2] = d[o + c * 3 + 2];
    }
    const uv = this.uv.array as Float32Array;
    const v0 = d[o + 12] / TREAD_REPEAT;
    const v1 = d[o + 13] / TREAD_REPEAT;
    uv.set([0, v0, 1, v0, 0, v1, 1, v1], slot * 8);
    const col = this.color.array as Float32Array;
    const t = this.tint.copy(tones[d[o + 16] as MarkTone] ?? tones[MarkTone.Earth]);
    for (let c = 0; c < 4; c++) col.set([t.r, t.g, t.b, d[o + (c < 2 ? 14 : 15)]], slot * 16 + c * 4);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const m = this.mesh.material as THREE.MeshLambertMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
