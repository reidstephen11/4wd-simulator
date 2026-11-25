/**
 * Teaching low range before the first water (v2.19): a prompt to stop and take low range
 * while there is water within `LOW_RANGE_HINT_REACH` metres ahead of the car and it is still
 * in high range. It teaches once: after low range has been used on this run it never shows
 * again, so a driver who knows the control can take an easy ford in high range without
 * being told.
 */
export const LOW_RANGE_HINT_REACH = 30;
/** Water shallower than this is a puddle, not a crossing (m). */
export const LOW_RANGE_HINT_DEPTH = 0.2;

/**
 * Is there water to cross within `reach` metres ahead of (x, z), along the unit direction
 * (dirX, dirZ)? Looked for every 3 m, starting 3 m ahead, so the prompt goes once the car's
 * nose is in the water.
 */
export function waterAhead(
  depthAt: (x: number, z: number) => number,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  reach = LOW_RANGE_HINT_REACH,
): boolean {
  for (let d = 3; d <= reach; d += 3)
    if (depthAt(x + dirX * d, z + dirZ * d) >= LOW_RANGE_HINT_DEPTH) return true;
  return false;
}

export class LowRangeHint {
  /** Low range has been used on this run. */
  used = false;

  /** Whether to show the prompt now, given the car's range and whether water lies close ahead. */
  show(range: 'high' | 'low', driving: boolean, water: () => boolean): boolean {
    if (range === 'low') this.used = true;
    return driving && !this.used && water();
  }
}
