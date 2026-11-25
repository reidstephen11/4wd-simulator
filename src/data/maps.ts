import type { MapDef } from '../sim/world/mapTypes';
import { ironbarkMap } from './levels/ironbarkMap';

/** One map per playground level. */
export type MapId = 'ironbark';

export interface MapEntry {
  def: MapDef;
  /** One line for menus. */
  blurb: string;
}

export const maps: Record<MapId, MapEntry> = {
  ironbark: {
    def: ironbarkMap,
    blurb:
      'A knoll with seven lines on it, a creek with three crossings, a bog hole and a rock garden, in half a kilometre.',
  },
};

export const mapOrder: readonly MapId[] = ['ironbark'];

export function isMapId(x: unknown): x is MapId {
  return typeof x === 'string' && x in maps;
}
