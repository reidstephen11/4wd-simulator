import type { PoiDef } from './mapTypes';
import type { TrackInfo } from './features';

/** Which track to arrive on, where the nearest one isn't the natural approach. */
export const PREFERRED_APPROACH: Record<string, string> = {
  'granite-link': 'mine-track',
  'rock-garden': 'rock-garden-bypass',
  'step-ups': 'step-ups-bypass',
  'crevice-run': 'crevice-run-bypass',
  'boulder-field': 'boulder-field-bypass',
  'off-camber-slab': 'off-camber-slab-bypass',
  'rock-face': 'rock-face-bypass',
  staircase: 'staircase',
  'dingo-gap': 'main-track',
  falls: 'bog-track',
  'washout-gully': 'mine-track',
  'deep-crossing': 'deep-crossing-track',
  'gravel-ford': 'main-track',
};

/**
 * A drivable approach into a POI: `length` metres along the nearest (or preferred)
 * track, then straight on to the POI centre.
 */
export function poiApproach(poi: PoiDef, tracks: readonly TrackInfo[], length = 50): [number, number][] {
  const prefer = PREFERRED_APPROACH[poi.id];
  let bestTrack: TrackInfo | null = null;
  let bestK = 0;
  let bestD = Infinity;
  for (const t of tracks) {
    if (prefer && t.def.id !== prefer) continue;
    for (let k = 0; k < t.poly.count; k++) {
      const d = Math.hypot(t.poly.xs[k] - poi.x, t.poly.zs[k] - poi.z);
      if (d < bestD) {
        bestD = d;
        bestK = k;
        bestTrack = t;
      }
    }
  }
  if (!bestTrack) return [[poi.x, poi.z]];
  const t = bestTrack;
  const path: [number, number][] = [];
  if (bestK >= length) for (let k = bestK - length; k <= bestK; k++) path.push([t.poly.xs[k], t.poly.zs[k]]);
  else
    for (let k = Math.min(t.poly.count - 1, bestK + length); k >= bestK; k--)
      path.push([t.poly.xs[k], t.poly.zs[k]]);
  const last = path[path.length - 1];
  const gap = Math.hypot(poi.x - last[0], poi.z - last[1]);
  for (let s = 2; s < gap; s += 2)
    path.push([last[0] + ((poi.x - last[0]) * s) / gap, last[1] + ((poi.z - last[1]) * s) / gap]);
  return path;
}
