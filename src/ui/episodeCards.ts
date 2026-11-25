import { controlInstruction, type ControlInstruction, type InputDevice } from '../data/controlInstructions';
import { controllers, defaultController, type ControllerType } from '../data/controllers';
import { glyphsFor } from '../data/controls';

/** The CREB's four lessons, in the order the signs come on the road out of the village. */
const LESSONS: readonly ControlInstruction[] = ['range', 'precision', 'locks', 'winch'];

/** How long a short note stays up on a touch screen if it isn't tapped open (seconds). */
export const BRIEF_SECONDS = 7;

/**
 * On a screen without touch, a note shrinks to its title and first lines once it has been up
 * this long (seconds) and the car has gone DRIVE_OFF_METRES from where it opened: the player
 * has driven on, so the card gets out of the picture. It closes BRIEF_SECONDS later; the
 * trip journal keeps the whole note.
 */
export const DRIVE_OFF_SECONDS = 8;
export const DRIVE_OFF_METRES = 40;

/** Has the player driven on from a note: up `seconds` and `metres` from where it opened? */
export const drivenOff = (seconds: number, metres: number): boolean =>
  seconds >= DRIVE_OFF_SECONDS && metres >= DRIVE_OFF_METRES;

/** How long a note stays up to be read: about 200 words a minute, and at least 12 s. */
export function readingSeconds(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(12, (words / 200) * 60 + 4);
}

/** On-screen button names that a touch lesson tells you to tap. */
const TOUCH_KEYS = ['F LOCK', 'R LOCK', 'CRAWL', '4WD', 'LOW', 'USE', 'OUT', 'IN'];

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A lesson's instruction with each key or button drawn as a key cap. */
export function instructionHtml(instruction: string, keys: readonly string[]): string {
  const tokens = [...new Set(keys.filter((k) => k.trim().length > 0))].sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return escapeHtml(instruction);
  const alternatives = tokens.map((t) => t.replace(/[.*+?^$|()[\]{}\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`(?<![\\w])(${alternatives})(?![\\w])`, 'g');
  let out = '';
  let at = 0;
  for (const m of instruction.matchAll(pattern)) {
    out += `${escapeHtml(instruction.slice(at, m.index))}<kbd>${escapeHtml(m[0])}</kbd>`;
    at = (m.index ?? 0) + m[0].length;
  }
  return out + escapeHtml(instruction.slice(at));
}

interface HistoryNote {
  title: string;
  text: string;
  reading: boolean;
  instruction?: ControlInstruction;
}

/**
 * Episode cards: the history note shown on reaching a place, and the result card when the
 * mission is done or the episode ends early (centred, with buttons, the game paused behind
 * it). The note is a small card in the top right corner, under any discovery card, and you
 * keep driving while it's up; a click or tap closes it. On a touch screen it opens short, the
 * place and the first lines only, and a tap opens the rest. A note can instead be read with the
 * game stopped (`reading`). A lesson card leads with what to press, drawn as keys, then says why.
 */
export class HistoryCard {
  readonly el: HTMLElement;
  /** Titles shown so far, oldest first. */
  readonly shown: string[] = [];
  /** Every note shown so far, oldest first, once each: the trip journal lists them. */
  readonly log: { title: string; text: string }[] = [];
  private readonly backdrop: HTMLElement;
  private readonly queue: HistoryNote[] = [];
  private current: HistoryNote | null = null;
  private device: InputDevice = 'keyboard';
  private controller: ControllerType = defaultController;
  /** Seconds before the note closes by itself; counts down with the game (`tick`), so it waits while paused. */
  private timeLeft = 0;
  /** Seconds the note has been up, and where the car was when it opened (see DRIVE_OFF_SECONDS). */
  private upFor = 0;
  private openedAt: { x: number; z: number } | null = null;

  /**
   * `root` takes the backdrop for a note read with the game stopped; `host` (the HUD's corner
   * stack) takes the card. `onRead` runs when the last note read with the game stopped is closed.
   */
  constructor(
    root: HTMLElement,
    host: HTMLElement,
    private readonly onRead: () => void,
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'history-backdrop hidden';
    this.backdrop.addEventListener('click', () => this.next());
    root.appendChild(this.backdrop);
    this.el = document.createElement('div');
    this.el.className = 'history-card paper hidden';
    this.el.innerHTML = `<small class="history-kind">History</small><strong></strong><p><span class="history-do"></span><span class="history-text"></span></p><span class="history-close" aria-hidden="true">×</span><span class="history-hint">Tap to carry on</span>`;
    this.el.addEventListener('click', () => {
      if (this.el.classList.contains('brief')) this.expand();
      else this.next();
    });
    this.el.querySelector('.history-close')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.next();
    });
    host.appendChild(this.el);
  }

  get isShown(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /** The note as words, for the headset's dash panel (v1.98); null when none is up. */
  get words(): { kind: string; title: string; text: string; hint: string } | null {
    if (!this.isShown || !this.current) return null;
    return {
      kind: this.el.querySelector('.history-kind')?.textContent ?? '',
      title: this.current.title,
      text: this.noteText(this.current),
      hint: this.el.querySelector('.history-hint')?.textContent ?? '',
    };
  }

  /** Is a note up that stops the game until it's closed? */
  get reading(): boolean {
    return this.isShown && this.el.classList.contains('reading');
  }

  /** Show a note (after any already waiting). `reading`: stop and read it, tap to close. */
  show(title: string, text: string, reading = false, instruction?: ControlInstruction): void {
    this.queue.push({ title, text, reading, instruction });
    if (!this.isShown) this.next();
  }

  /** Close the card, showing the next one waiting. */
  next(): void {
    this.timeLeft = 0;
    const wasReading = this.reading;
    const n = this.queue.shift();
    this.current = n ?? null;
    this.el.classList.toggle('hidden', !n);
    this.el.classList.toggle('reading', !!n?.reading);
    this.backdrop.classList.toggle('hidden', !n?.reading);
    if (!n) {
      if (wasReading) this.onRead();
      return;
    }
    this.el.querySelector('strong')!.textContent = n.title;
    this.shown.push(n.title);
    if (!this.log.some((l) => l.title === n.title)) this.log.push({ title: n.title, text: this.noteText(n) });
    this.upFor = 0;
    this.openedAt = null;
    this.el.classList.toggle('brief', !n.reading && this.device === 'touch');
    this.fill(n);
    this.updateHint();
    if (n.reading) return;
    this.timeLeft = this.el.classList.contains('brief') ? BRIEF_SECONDS : readingSeconds(this.noteText(n));
  }

  /**
   * A step of play went by (not called while the game is paused or the map is open). `car`:
   * where the car is now, so a note can make way once the player drives on.
   */
  tick(dt: number, car?: { x: number; z: number }): void {
    if (this.timeLeft <= 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.next();
      return;
    }
    this.upFor += dt;
    if (!car || this.device === 'touch' || this.el.classList.contains('brief')) return;
    this.openedAt ??= { x: car.x, z: car.z };
    const driven = Math.hypot(car.x - this.openedAt.x, car.z - this.openedAt.z);
    if (drivenOff(this.upFor, driven)) {
      this.el.classList.add('brief');
      this.updateHint();
      this.timeLeft = Math.min(this.timeLeft, BRIEF_SECONDS);
    }
  }

  /**
   * Make way for something urgent (a warning, a recovery): a note being read while driving
   * shrinks to its title and first lines, as when the car drives on, and closes soon after.
   * The trip journal keeps the whole note. A note read with the game stopped is left alone.
   */
  makeWay(): void {
    if (!this.isShown || this.reading || this.timeLeft <= 0 || this.el.classList.contains('brief')) return;
    this.el.classList.add('brief');
    this.updateHint();
    this.timeLeft = Math.min(this.timeLeft, BRIEF_SECONDS);
  }

  /** Open a short note to its full text, with the time to read it. */
  private expand(): void {
    if (!this.current) return;
    this.el.classList.remove('brief');
    this.updateHint();
    this.timeLeft = readingSeconds(this.noteText(this.current));
  }

  clear(): void {
    this.queue.length = 0;
    this.next();
  }

  /** Reformat an open tutorial without rediscovering it, resetting its timer or advancing the queue. */
  setInput(device: InputDevice, controller: ControllerType): void {
    if (this.device === device && this.controller === controller) return;
    this.device = device;
    this.controller = controller;
    if (this.current) this.fill(this.current);
    this.updateHint();
  }

  /** The note's words: a lesson's instruction first, with its keys drawn as keys. */
  private fill(note: HistoryNote): void {
    const lesson = note.instruction ? LESSONS.indexOf(note.instruction) : -1;
    this.el.classList.toggle('lesson', !!note.instruction);
    this.el.querySelector('.history-kind')!.textContent = note.instruction
      ? lesson >= 0
        ? `Lesson ${lesson + 1} of ${LESSONS.length}`
        : 'Lesson'
      : 'History';
    const doEl = this.el.querySelector('.history-do') as HTMLElement;
    if (note.instruction) {
      const instruction = controlInstruction(note.instruction, this.device, this.controller);
      const keys =
        this.device === 'touch'
          ? TOUCH_KEYS
          : Object.values(glyphsFor(this.device, this.controller)).filter((k): k is string => !!k);
      doEl.innerHTML = `${instructionHtml(instruction, keys)} `;
    } else doEl.textContent = '';
    this.el.querySelector('.history-text')!.textContent = note.text;
  }

  private noteText(note: HistoryNote): string {
    return note.instruction
      ? `${controlInstruction(note.instruction, this.device, this.controller)} ${note.text}`
      : note.text;
  }

  private updateHint(): void {
    this.el.querySelector('.history-hint')!.textContent = this.el.classList.contains('brief')
      ? this.device === 'touch'
        ? 'Tap to read more'
        : 'The trip journal keeps this note'
      : this.device === 'touch'
        ? 'Tap to carry on'
        : `${this.device === 'gamepad' ? controllers[this.controller].confirm : 'Enter'} to carry on`;
  }
}

export interface ResultButton {
  id: string;
  label: string;
  note?: string;
}

/** The end of an episode: mission complete, or why it ended and where you can restart. */
export class ResultCard {
  readonly el: HTMLElement;
  isOpen = false;
  private focusIndex = 0;
  private onPick: ((id: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'result hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-result]');
      if (b) this.pick(b.dataset.result ?? '');
    });
  }

  open(
    kind: 'complete' | 'failed',
    heading: string,
    title: string,
    paragraphs: readonly string[],
    stats: readonly string[],
    buttons: readonly ResultButton[],
    onPick: (id: string) => void,
  ): void {
    this.onPick = onPick;
    this.isOpen = true;
    this.focusIndex = 0;
    const card = document.createElement('div');
    card.className = `result-card paper ${kind}`;
    card.innerHTML = `<small></small><h2></h2><div class="result-text"></div><ul class="result-stats"></ul><div class="result-buttons"></div>`;
    card.querySelector('small')!.textContent = heading;
    card.querySelector('h2')!.textContent = title;
    const text = card.querySelector('.result-text') as HTMLElement;
    for (const p of paragraphs) {
      const el = document.createElement('p');
      el.textContent = p;
      text.appendChild(el);
    }
    const list = card.querySelector('.result-stats') as HTMLElement;
    for (const s of stats) {
      const li = document.createElement('li');
      li.textContent = s;
      list.appendChild(li);
    }
    const row = card.querySelector('.result-buttons') as HTMLElement;
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.result = b.id;
      el.textContent = b.label;
      if (b.note) {
        const small = document.createElement('small');
        small.textContent = b.note;
        el.appendChild(small);
      }
      row.appendChild(el);
    }
    this.el.innerHTML = '';
    this.el.appendChild(card);
    this.el.classList.remove('hidden');
    this.focus();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private buttons(): HTMLButtonElement[] {
    return [...this.el.querySelectorAll<HTMLButtonElement>('button[data-result]')];
  }

  private focus(): void {
    const b = this.buttons();
    b.forEach((x, i) => x.classList.toggle('focused', i === this.focusIndex));
    b[this.focusIndex]?.focus({ preventScroll: true });
  }

  private pick(id: string): void {
    const cb = this.onPick;
    this.close();
    cb?.(id);
  }

  /** Keyboard and gamepad: move between the buttons and press one. */
  navigate(cmd: 'prev' | 'next' | 'confirm'): void {
    const b = this.buttons();
    if (b.length === 0) return;
    if (cmd === 'confirm') return this.pick(b[this.focusIndex].dataset.result ?? '');
    this.focusIndex = (this.focusIndex + (cmd === 'next' ? 1 : b.length - 1)) % b.length;
    this.focus();
  }
}
