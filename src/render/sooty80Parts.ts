import * as THREE from 'three';
import { VehicleBuilder } from './vehicleGeometry';

/** Semantic part masks retained from the approved review draft for inspection. */
export const reviewRanges: { start: number; end: number; part: number }[] = [];
export function markPart(b: VehicleBuilder, part: number, fn: () => void): void {
  const start = b.vertexCount;
  fn();
  reviewRanges.push({ start, end: b.vertexCount, part });
}
export function attachParts(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.setAttribute(
    'reviewPart',
    new THREE.Float32BufferAttribute(
      Array.from({ length: g.attributes.position.count }, (_, i) =>
        reviewRanges.reduce((mask, r) => (i >= r.start && i < r.end ? mask | r.part : mask), 0),
      ),
      1,
    ),
  );
  return g;
}
