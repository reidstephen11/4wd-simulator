import { audioTuning } from '../data/audio';
import { winchTuning } from '../data/tools';
import type { Vehicle } from '../sim/vehicle/vehicle';
import type { Winch } from '../sim/tools/winch';
import type { World } from '../sim/world/world';
import { isSputtering } from '../sim/vehicle/flooding';
import { floodTuning } from '../data/tools';
import type { AmbienceFrame } from './ambience';
import type { CrawlFrame } from './crawlSounds';
import type { EngineFrame } from './engineSound';
import type { WheelSound } from './mix';
import type { TrailerFrame } from './trailerSound';
import type { WinchFrame } from './winchSound';
import type { Trailer } from '../sim/trailer';

/** Everything the audio layer reads from the game each frame. */
export interface AudioFrame {
  dt: number;
  paused: boolean;
  /** Heard from the driver's seat (through the cabin). */
  interior: boolean;
  engine: EngineFrame;
  /** Speed along the heading (m/s). */
  speed: number;
  wheels: readonly WheelSound[];
  /** Selected gear (-1 = reverse), for the clunk of selecting drive or reverse. */
  gear: number;
  /** Manual gearbox settings: in neutral, and every change of gear clunks. */
  neutral?: boolean;
  manualGearbox?: boolean;
  crawl: CrawlFrame;
  horn: boolean;
  winch: WinchFrame;
  /** The trailer on the back, if any. */
  trailer: TrailerFrame | null;
  ambience: AmbienceFrame;
}

/** Read the local vehicle and its surroundings into an AudioFrame. */
export function buildAudioFrame(
  v: Vehicle,
  winch: Winch,
  world: World,
  paused: boolean,
  dt: number,
  interior = false,
  rain = 0,
  night = false,
  trailer: Trailer | null = null,
): AudioFrame {
  const p = v.body.translation();
  const d = v.drivetrain;
  const t = world.terrain;
  const falls = world.pois.find((q) => q.id === audioTuning.ambience.falls.poi);
  const maxPull = winchTuning.maxForceFactor * v.tuning.mass * 9.81;
  const flood = v.condition.flood;
  const sputter = isSputtering(flood)
    ? Math.min(1, (flood.timer - floodTuning.sputterAt) / (floodTuning.stallAt - floodTuning.sputterAt))
    : 0;
  // Transfer-case input shaft: wheel turns × final drive × transfer ratio.
  const tune = v.tuning;
  const wheelRevs = Math.abs(v.speed) / (2 * Math.PI * tune.wheelRadius);
  const shaftHz = wheelRevs * tune.gearbox.finalDrive * tune.ranges[d.range].ratio;
  const W = audioTuning.whine;
  const whine =
    (d.range === 'low' ? 1 : W.highRange) *
    (W.coast + (1 - W.coast) * d.load) *
    Math.min(1, shaftHz / W.fadeInHz);
  return {
    dt,
    paused,
    interior,
    engine: {
      rpm: d.rpm,
      load: d.load,
      throttle: v.throttle,
      running: d.engineRunning,
      powerCut: d.engineRunning && isSputtering(flood) && v.enginePower < 0.5,
      misfire: sputter > 0 ? 0.15 + 0.35 * sputter : 0,
      shaftHz,
      whine,
    },
    speed: v.speed,
    wheels: v.wheels,
    gear: d.gear,
    neutral: d.neutral,
    manualGearbox: v.manualGearbox,
    crawl: {
      dt,
      body: v.bodyContact,
      weight: tune.mass * 9.81,
      articulation: v.wheels.reduce((sum, w) => sum + (w.contact ? Math.abs(w.compression) : 0), 0),
      speed: v.speed,
    },
    horn: v.horn,
    winch: { attached: winch.attached, motor: winch.motor, load: winch.tension / maxPull },
    trailer: trailer
      ? {
          speed: v.speed,
          roughness: trailer.wheels.reduce((sum, w) => sum + (w.contact ? Math.abs(w.compression) : 0), 0),
          drums: trailer.drums,
        }
      : null,
    ambience: {
      dt,
      altitude: p.y,
      creekDistance: world.features.creekDistance[t.index(p.x, p.z)],
      fallsDistance: falls ? Math.hypot(falls.x - p.x, falls.z - p.z) : Infinity,
      rain,
      interior,
      night,
    },
  };
}
