/** Available axle drive (N). Locking lets either tyre use the axle's torque, within its own grip. */
export function axleDriveCapacity(left: number, right: number, locked: boolean, leak: number): number {
  if (locked) return left + right;
  const lo = Math.min(left, right);
  return 2 * lo + leak * (Math.max(left, right) - lo);
}
