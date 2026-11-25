import * as THREE from 'three';
import { CELL, type ChurnMap } from '../sim/world/churn';
import { patchFog } from './fog';

/** Most churned squares drawn at once. */
const MAX = 3000;
/** Squares churned less than this aren't drawn. */
const SHOWN = 0.2;
/** Seconds between redraws: churn builds slowly, so there's no need to every frame. */
const EVERY = 0.5;

const light = new THREE.Color('#7a5236');
const dark = new THREE.Color('#33200f');

/** A soft-edged blob, so neighbouring squares run together into a churned patch. */
function blob(): THREE.Texture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, Math.min(1, (1 - d) * 2));
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
}

/**
 * Churned-up clay, mud and grass (src/sim/world/churn.ts), drawn as dark wet patches lying on the
 * ground: the darker, the more it has been cut up and the less it grips.
 */
export class RutsView {
  readonly mesh: THREE.InstancedMesh;
  private wait = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly n = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(
    private readonly churn: ChurnMap,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    const g = new THREE.PlaneGeometry(CELL * 1.4, CELL * 1.4);
    g.rotateX(-Math.PI / 2);
    const mat = patchFog(
      new THREE.MeshLambertMaterial({
        map: blob(),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      'ruts',
    );
    this.mesh = new THREE.InstancedMesh(g, mat, MAX);
    this.mesh.name = 'ruts';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  update(dt: number): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = EVERY;
    let i = 0;
    const h = this.heightAt;
    for (const s of this.churn.squares()) {
      if (s.churn < SHOWN) continue;
      if (i >= MAX) break;
      const y = h(s.x, s.z);
      // Lie along the slope.
      this.n.set(h(s.x - 1, s.z) - h(s.x + 1, s.z), 2, h(s.x, s.z - 1) - h(s.x, s.z + 1)).normalize();
      this.q.setFromUnitVectors(this.up, this.n);
      this.m.compose(new THREE.Vector3(s.x, y + 0.03, s.z), this.q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.copy(light).lerp(dark, (s.churn - SHOWN) / (1 - SHOWN)));
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
