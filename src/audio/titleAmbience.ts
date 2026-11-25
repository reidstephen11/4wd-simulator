import type { Settings } from '../sim/save/save';
import { createNoiseBank, loop } from './buffers';

/** A quiet camp bed, unlocked by the title screen's first gesture and faded into the game. */
export class TitleAmbience {
  readonly context = new AudioContext({ latencyHint: 'interactive' });
  private readonly master = this.context.createGain();
  private readonly sources: AudioBufferSourceNode[] = [];
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
    const noise = createNoiseBank(this.context);
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    for (const [buffer, frequency, gain] of [
      [noise.brown, 420, 0.18],
      [noise.white, 900, 0.035],
      [noise.crunch, 1700, 0.025],
    ] as const) {
      const source = loop(this.context, buffer);
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
      const level = this.context.createGain();
      level.gain.value = gain;
      source.connect(filter).connect(level).connect(this.master);
      this.sources.push(source);
    }
    void this.context.resume().catch(() => undefined);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.setSettings(settings);
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    const level = document.hidden ? 0 : settings.masterVolume ** 2 * settings.ambienceVolume ** 2;
    this.master.gain.setTargetAtTime(level, this.context.currentTime, 0.35);
  }

  private readonly onVisibility = (): void => this.setSettings(this.settings);

  /** Keep the unlocked context for driving; release only the title's sources. */
  leave(): AudioContext {
    document.removeEventListener('visibilitychange', this.onVisibility);
    const end = this.context.currentTime + 0.4;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    for (const source of this.sources) source.stop(end);
    setTimeout(() => this.master.disconnect(), 500);
    return this.context;
  }
}
