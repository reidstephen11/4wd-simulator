import { trailers, type TrailerTuning } from '../data/trailers';
import type { Quat, Vec3 } from './vehicle/math';

export interface DrumState {
  id: string;
  position: Vec3;
  rotation: Quat;
}
export interface TrailerState extends DrumState {
  kind: TrailerTuning['id'];
  hitched: boolean;
  drums: number;
  strain: number;
  tyres: number[];
}
export interface DeliveryState {
  trailers: TrailerState[];
  looseDrums: DrumState[];
}

/** Reject malformed new save data; old saves simply have no delivery state. */
export function readDeliveryState(raw: unknown): DeliveryState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<DeliveryState>;
  const pose = (p: unknown): p is DrumState => {
    const d = p as DrumState | null;
    return (
      !!d &&
      typeof d.id === 'string' &&
      d.id.length < 100 &&
      !!d.position &&
      !!d.rotation &&
      [
        d.position.x,
        d.position.y,
        d.position.z,
        d.rotation.x,
        d.rotation.y,
        d.rotation.z,
        d.rotation.w,
      ].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000) &&
      Math.hypot(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w) > 0.9 &&
      Math.hypot(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w) < 1.1
    );
  };
  if (!Array.isArray(value.trailers) || !Array.isArray(value.looseDrums)) return undefined;
  const saved: TrailerState[] = [];
  for (const t of value.trailers.slice(0, 6)) {
    if (!pose(t) || !Object.hasOwn(trailers, t.kind)) continue;
    saved.push({
      id: t.id,
      kind: t.kind,
      position: { ...t.position },
      rotation: { ...t.rotation },
      hitched: t.hitched === true,
      drums: Math.min(6, Math.max(0, Math.floor(Number.isFinite(t.drums) ? t.drums : 0))),
      strain: Math.max(0, Math.min(1, Number.isFinite(t.strain) ? t.strain : 0)),
      tyres: [0, 1].map((i) => Math.max(0, Math.min(1, Number.isFinite(t.tyres?.[i]) ? t.tyres[i] : 1))),
    });
  }
  const loose = value.looseDrums
    .filter(pose)
    .slice(0, 36)
    .map((d) => ({ id: d.id, position: { ...d.position }, rotation: { ...d.rotation } }));
  return { trailers: saved, looseDrums: loose };
}
