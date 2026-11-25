import type { GateDef } from '../../sim/world/mapTypes';
import type { GateCourseDef } from '../../sim/scoredGates';

export const ironbarkGateCourse: GateCourseDef = {
  id: 'knoll-rock-climb',
  name: 'Knoll rock climb',
  trackId: 'knoll-rock-climb',
};

/** Eight gates up the rock climb: they test placement through its pitches. */
export const ironbarkGates: GateDef[] = [6, 23, 41, 59, 78, 97, 115, 130].map((at, k) => ({
  n: k + 1,
  trackId: ironbarkGateCourse.trackId,
  at,
  width: 3.6,
}));
