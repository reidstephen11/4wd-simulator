import type { TrailerEvent } from '../sim/trailer';

/** What the HUD says when something happens to a trailer (null: nothing to say). */
export function trailerMessage(e: TrailerEvent | { type: 'hitched' | 'unhitched' }): string | null {
  switch (e.type) {
    case 'hitched':
      return 'Trailer hitched, jockey wheel up';
    case 'unhitched':
      return 'Trailer unhitched and chocked';
    case 'jackknifed':
      return 'Jackknifed: the drawbar is against the back of the car';
    case 'tipped':
      return 'The trailer has tipped over';
    case 'righted':
      return 'The trailer is back on its wheels';
    case 'loadWarning':
      return 'Load straps are loosening — stop and tighten them in Tools';
    case 'drumLoose':
      return 'A drum has come off — bring the trailer alongside and load it from Tools';
    case 'tyreCut':
      return 'Trailer tyre punctured — stop and repair it from Tools';
  }
}
