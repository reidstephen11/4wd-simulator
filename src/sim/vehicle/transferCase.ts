import type { VehicleTuning } from '../../data/vehicle';
import { SurfaceId } from '../../data/surfaces';

export type TransferMode = '2H' | '4H' | '4L';

export interface TransferState {
  mode: TransferMode;
  hubsLocked: boolean;
  centreLocked: boolean;
  /** Stored driveline strain, 0..1. Released by slip or disconnecting the axles. */
  windup: number;
}

/** Start ready for the CREB, as the driving and route tuning has always assumed. */
export function createTransferState(): TransferState {
  return { mode: '4H', hubsLocked: true, centreLocked: true, windup: 0 };
}

/** Returns a useful refusal, or null when the shift is allowed. */
export function transferShiftReason(t: VehicleTuning, s: TransferState, speed: number): string | null {
  const next =
    t.transfer === 'fullTime'
      ? s.mode === '4H'
        ? '4L'
        : '4H'
      : s.mode === '2H'
        ? '4H'
        : s.mode === '4H'
          ? '4L'
          : '2H';
  if ((s.mode === '4L' || next === '4L') && Math.abs(speed) > 0.5) return 'Stop before changing low range';
  if (Math.abs(speed) > 20 / 3.6) return 'Slow below 20 km/h to change drive';
  if (t.transfer === 'partTime' && next !== '2H' && !s.hubsLocked && !t.autoHubs)
    return 'Lock the front hubs from the tool menu first';
  return null;
}

export function shiftTransfer(t: VehicleTuning, s: TransferState, speed: number): boolean {
  if (transferShiftReason(t, s, speed)) return false;
  s.mode =
    t.transfer === 'fullTime'
      ? s.mode === '4H'
        ? '4L'
        : '4H'
      : s.mode === '2H'
        ? '4H'
        : s.mode === '4H'
          ? '4L'
          : '2H';
  if (t.autoHubs && s.mode !== '2H') s.hubsLocked = true;
  if (s.mode === '2H') s.windup = 0;
  return true;
}

export function frontDriven(t: VehicleTuning, s: TransferState): boolean {
  return t.transfer === 'fullTime' || (s.mode !== '2H' && s.hubsLocked);
}

/** Axle torque requests. An open centre diff is limited by the weaker axle. */
export function transferDrive(
  t: VehicleTuning,
  s: TransferState,
  drive: number,
  frontCap: number,
  rearCap: number,
): [number, number] {
  if (!frontDriven(t, s)) return [0, drive];
  const half = drive / 2;
  if (t.transfer === 'partTime' || s.centreLocked) return [half, half];
  const delivered = Math.sign(half) * Math.min(Math.abs(half), frontCap, rearCap);
  return [delivered, delivered];
}

/** Only loaded tyres on firm rock/bridge/concrete can store strain in a tight turn. */
export function updateWindup(
  t: VehicleTuning,
  s: TransferState,
  wheels: readonly { contact: boolean; load: number; surface: SurfaceId }[],
  speed: number,
  steer: number,
  dt: number,
): void {
  const coupled = frontDriven(t, s) && (t.transfer === 'partTime' || s.centreLocked);
  if (!coupled) {
    s.windup = Math.max(0, s.windup - dt * 2);
    return;
  }
  let firm = 0;
  for (const w of wheels)
    if (w.contact && w.load > 0 && (w.surface === SurfaceId.Rock || w.surface === SurfaceId.Wood)) firm++;
  const distance = Math.abs(speed) * dt;
  s.windup = Math.max(
    0,
    Math.min(
      1,
      s.windup +
        (firm >= 3
          ? distance * (Math.abs(steer) >= 0.6 ? Math.abs(steer) : 0) * 0.04
          : -distance * 0.18 - dt * 0.05),
    ),
  );
}
