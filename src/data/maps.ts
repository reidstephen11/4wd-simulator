import type { MapDef } from '../sim/world/mapTypes';
import { highCountryMap } from './map';
import { ironbarkParkMap } from './park';
import { crawlerCreekMap } from './crawlerCreek';

export type MapId = 'high-country' | 'ironbark-park' | 'crawler-creek';

export interface MapEntry {
  def: MapDef;
  /** One line for the pause menu. */
  blurb: string;
}

export const maps: Record<MapId, MapEntry> = {
  'high-country': {
    def: highCountryMap,
    blurb: 'Open bush, creeks and high plains to explore, with Granite Spur’s eight obstacles.',
  },
  'ironbark-park': {
    def: ironbarkParkMap,
    blurb: 'A purpose-built 4WD park: eleven numbered stations, each with an easier and a harder line.',
  },
  'crawler-creek': {
    def: crawlerCreekMap,
    blurb:
      'An RC crawler-style trail at full size: numbered gates through mud, bridges, switchbacks and climbs.',
  },
};

export const mapOrder: readonly MapId[] = ['high-country', 'ironbark-park', 'crawler-creek'];

export function isMapId(x: unknown): x is MapId {
  return typeof x === 'string' && x in maps;
}
