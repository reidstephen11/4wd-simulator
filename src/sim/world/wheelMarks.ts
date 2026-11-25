import type { TrackInfo } from './features';
import { trailPoint } from './crawlTrail';

/** Half the distance between the two wheel lines (m): a 4WD's track. */
export const WHEEL_MARK_HALF_GAUGE = 0.72;
/** Distance between one mark and the next along a wheel line (m): they run together into a line. */
const STEP = 0.22;
/** The marks grow in over this far at each end of a stretch (m). */
const TAPER = 2.5;

export interface WheelMark {
  x: number;
  z: number;
  /** 0 to 1: how worn the line is here (it fades in and out at the ends of a stretch). */
  strength: number;
}

/**
 * Where a map's worn wheel lines are (`TrackDef.wheelMarks`, v2.25): two lines of marks along
 * each stretch, on dry ground only. They show which way others have driven: down to the water
 * here, out of it there. Only drawn (src/render/wheelMarks.ts); the ground is the same.
 */
export function wheelMarkSpots(
  tracks: readonly TrackInfo[],
  waterDepthAt: (x: number, z: number) => number,
): WheelMark[] {
  const out: WheelMark[] = [];
  for (const track of tracks)
    for (const [from, end] of track.def.wheelMarks ?? []) {
      const to = Math.min(end, track.poly.length);
      for (let s = Math.max(0, from); s <= to; s += STEP)
        for (const side of [-WHEEL_MARK_HALF_GAUGE, WHEEL_MARK_HALF_GAUGE]) {
          const p = trailPoint(track, s, side);
          if (waterDepthAt(p.x, p.z) > 0.02) continue;
          out.push({
            x: p.x,
            z: p.z,
            strength: Math.min(1, (s - from + 0.4) / TAPER, (to - s + 0.4) / TAPER),
          });
        }
    }
  return out;
}
