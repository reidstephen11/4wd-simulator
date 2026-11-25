import type { SurpriseEvent } from '../sim/surprises';

/** What the HUD says as a surprise starts up ahead, and once it is down. */
export function surpriseMessage(e: Pick<SurpriseEvent, 'kind' | 'phase'>): string {
  if (e.kind === 'treefall')
    return e.phase === 'started'
      ? 'A tree is coming down ahead!'
      : 'Tree across the track: winch it aside or squeeze round';
  return e.phase === 'started'
    ? 'Rocks coming off the bank ahead!'
    : 'Rocks on the track: pick a line past or winch them aside';
}
