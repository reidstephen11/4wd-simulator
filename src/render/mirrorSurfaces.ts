import * as THREE from 'three';
import { VehicleMaterial } from './vehicleGeometry';

export interface MirrorSurface {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  geometry: THREE.BufferGeometry;
}

/** Recover connected flat glass faces after each body's scaling and cab transforms. */
export function mirrorSurfaces(source: THREE.BufferGeometry): MirrorSurface[] {
  const positions = source.getAttribute('position');
  const slots = source.getAttribute('materialSlot');
  const planes = new Map<string, THREE.Vector3[][]>();
  const key = (v: THREE.Vector3) =>
    v
      .toArray()
      .map((n) => Math.round(n * 100000))
      .join(',');
  for (let i = 0; i < positions.count; i += 3) {
    if (slots.getX(i) !== VehicleMaterial.Mirror) continue;
    const tri = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(positions, i + j));
    const normal = new THREE.Vector3()
      .subVectors(tri[1], tri[0])
      .cross(new THREE.Vector3().subVectors(tri[2], tri[0]))
      .normalize();
    // Ignore the glass block's sides, backing and bevels. The viewing face looks rearward.
    if (normal.z < 0.7 || Math.abs(normal.y) > 0.7) continue;
    const planeKey = `${normal
      .toArray()
      .map((n) => Math.round(n * 10000))
      .join(',')},${Math.round(normal.dot(tri[0]) * 10000)}`;
    const plane = planes.get(planeKey) ?? [];
    plane.push(tri);
    planes.set(planeKey, plane);
  }
  const surfaces: MirrorSurface[] = [];
  for (const triangles of planes.values()) {
    while (triangles.length) {
      const connected = [triangles.pop()!];
      const vertices = new Set(connected[0].map(key));
      // Keep separate mirror heads separate even if they share a plane.
      for (let changed = true; changed;) {
        changed = false;
        for (let i = triangles.length - 1; i >= 0; i--) {
          if (!triangles[i].some((v) => vertices.has(key(v)))) continue;
          const [tri] = triangles.splice(i, 1);
          connected.push(tri);
          tri.forEach((v) => vertices.add(key(v)));
          changed = true;
        }
      }
      const points = connected.flat();
      const position = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      const normal = new THREE.Vector3()
        .subVectors(points[1], points[0])
        .cross(new THREE.Vector3().subVectors(points[2], points[0]))
        .normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      const inverse = rotation.clone().invert();
      const local = points.flatMap((v) => v.clone().sub(position).applyQuaternion(inverse).toArray());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(local, 3));
      geometry.computeVertexNormals();
      // The original glazing remains beneath this face as the disabled/uninitialised fallback.
      position.addScaledVector(normal, 0.0006);
      surfaces.push({ position, rotation, geometry });
    }
  }
  return surfaces;
}
