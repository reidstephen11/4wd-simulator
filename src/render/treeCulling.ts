import * as THREE from 'three';

/** The parts of three's BatchedMesh (r186) that its draw list is built from. */
interface BatchInternals {
  _instanceInfo: { visible: boolean; active: boolean; geometryIndex: number }[];
  _geometryInfo: { start: number; count: number }[];
  _multiDrawStarts: Int32Array;
  _multiDrawCounts: Int32Array;
  _indirectTexture: THREE.DataTexture;
  _multiDrawCount: number;
  _multiDrawBytesPerElement: number;
  _visibilityChanged: boolean;
}

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();

/**
 * Per-instance frustum culling for a batch of static trees (or rocks and logs), from bounding
 * spheres worked out once (x, y, z, radius per instance id, in world space). three.js's own culling rebuilt every
 * tree's sphere from its matrix on every draw, twice a frame (the view and the shadow map):
 * about 3 ms a frame on a desktop under the Bloomfield forest, several times that on a phone.
 * The draw list is filled the way BatchedMesh.onBeforeRender fills it (three r186): the batch
 * sits at the origin and isn't sorted, so only the spheres change.
 */
export function cullTreesBySphere(batch: THREE.BatchedMesh, spheres: Float32Array): void {
  batch.perObjectFrustumCulled = false;
  const b = batch as unknown as BatchInternals;
  batch.onBeforeRender = (_renderer, _scene, camera, geometry) => {
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem, camera.reversedDepth);
    const planes = frustum.planes;
    const index = geometry.getIndex();
    const bytes = index === null ? 1 : index.array.BYTES_PER_ELEMENT;
    const info = b._instanceInfo;
    const geos = b._geometryInfo;
    const starts = b._multiDrawStarts;
    const counts = b._multiDrawCounts;
    const indirect = b._indirectTexture.image.data as unknown as Uint32Array;
    let n = 0;
    for (let i = 0, l = info.length; i < l; i++) {
      const it = info[i];
      if (!it.visible || !it.active) continue;
      const k = i * 4;
      const x = spheres[k];
      const y = spheres[k + 1];
      const z = spheres[k + 2];
      const r = -spheres[k + 3];
      let inside = true;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        const nm = pl.normal;
        if (nm.x * x + nm.y * y + nm.z * z + pl.constant < r) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      const g = geos[it.geometryIndex];
      starts[n] = g.start * bytes;
      counts[n] = g.count;
      indirect[n] = i;
      n++;
    }
    b._indirectTexture.needsUpdate = true;
    b._multiDrawCount = n;
    b._multiDrawBytesPerElement = bytes;
    b._visibilityChanged = false;
  };
}
