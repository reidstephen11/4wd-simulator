/** Scored runs on crawl trails: penalty points and the zones that start and end a run. */
export const crawlScoring = {
  /** Penalty points: backing up, the chassis knocking a rock, hooking up the winch. */
  reverse: 1,
  knock: 1,
  winch: 5,
  /** A run starts within this distance (m) of either end of the technical line. */
  startZone: 2.5,
  /** And finishes this close to the far end (m). */
  finishZone: 2.5,
  /** Dropping back this far (m) from the furthest point counts as backing up... */
  reverseDistance: 0.5,
  /** ...and the car must move forward this far again before the next one counts. */
  rearmDistance: 0.4,
  /** Knocks closer together than this (s) count once. */
  knockSpacing: 0.8,
  /** Further than this outside the line's edge (m) ends the run. */
  offLine: 1.5,
  /** Leaving within this time (s) of starting, near the start, just cancels it. */
  falseStartSeconds: 4,
  rolledTiltDeg: 75,
};
