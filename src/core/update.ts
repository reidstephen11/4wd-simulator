/**
 * A new build waiting to take over (v1.23). The service worker downloads an update while the
 * game is open; installing it reloads the page, so that happens only on the title screen or
 * when the player asks for it in the pause menu, never in the middle of a drive.
 */
export class PendingUpdate {
  private apply: (() => void) | null = null;
  private readonly listeners: Array<() => void> = [];

  /** Has a new version been downloaded and is it waiting to be installed? */
  get ready(): boolean {
    return this.apply !== null;
  }

  /** The service worker has a new version waiting; `apply` installs it and reloads. */
  arrive(apply: () => void): void {
    this.apply = apply;
    for (const fn of this.listeners) fn();
  }

  /** Run `fn` when a new version is ready (at once if one already is). */
  onReady(fn: () => void): void {
    this.listeners.push(fn);
    if (this.ready) fn();
  }

  /** Install the waiting version and reload into it. False when nothing is waiting. */
  install(): boolean {
    const apply = this.apply;
    if (!apply) return false;
    apply();
    return true;
  }
}

export const pendingUpdate = new PendingUpdate();
