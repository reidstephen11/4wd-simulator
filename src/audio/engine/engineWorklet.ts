/**
 * AudioWorklet processor that runs the engine synthesiser on the audio thread. The
 * main thread drives it with k-rate AudioParams and posts `{ type: 'start' }` to play
 * the starter sequence. Loaded with `audioWorklet.addModule` (see engineSound.ts).
 */
import { EngineSynth, type EngineInputs } from './engineSynth';
import { ENGINE_PROCESSOR } from './processorName';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const p = (name: string, defaultValue: number, maxValue: number) => ({
      name,
      defaultValue,
      minValue: 0,
      maxValue,
      automationRate: 'k-rate',
    });
    return [
      p('rpm', 800, 9000),
      p('load', 0, 1),
      p('throttle', 0, 1),
      p('running', 1, 1),
      p('misfire', 0, 1),
      p('shaftHz', 0, 400),
      p('whine', 0, 1),
    ];
  }

  private readonly synth = new EngineSynth(sampleRate);
  private readonly inputs: EngineInputs = {
    rpm: 800,
    load: 0,
    throttle: 0,
    running: true,
    misfire: 0,
    shaftHz: 0,
    whine: 0,
  };

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: string }>) => {
      if (e.data?.type === 'start') this.synth.start();
    };
  }

  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const channels = outputs[0];
    const out = channels?.[0];
    if (!out) return true;
    const i = this.inputs;
    i.rpm = params.rpm[0];
    i.load = params.load[0];
    i.throttle = params.throttle[0];
    i.running = params.running[0] > 0.5;
    i.misfire = params.misfire[0];
    i.shaftHz = params.shaftHz[0];
    i.whine = params.whine[0];
    this.synth.process(out, i);
    for (let c = 1; c < channels.length; c++) channels[c].set(out);
    return true;
  }
}

registerProcessor(ENGINE_PROCESSOR, EngineProcessor);
