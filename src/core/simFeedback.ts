import type { ControllerType } from '../data/controllers';
import { controllers } from '../data/controllers';
import type { AudioSystem } from '../audio/audioSystem';
import type { Hud } from '../ui/hud';
import type { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { pressurePsi } from '../sim/vehicle/tyrePressure';
import { planDuration } from '../sim/world/surprisePlan';
import { damageMessage } from './damageMessages';
import { surpriseMessage } from './surpriseMessages';
import { trailerMessage } from './trailerMessages';

/** The sound calls the sim's events make. */
export type FeedbackAudio = Pick<
  AudioSystem,
  | 'surprise'
  | 'trailerEvent'
  | 'trailerBump'
  | 'drivetrainClunk'
  | 'engineEvent'
  | 'parkBrake'
  | 'lightSwitch'
  | 'damage'
  | 'wheelImpact'
  | 'dent'
  | 'bodyKnock'
>;

/** What the wiring reads from the sim. */
export type FeedbackSim = Pick<Simulation, 'events' | 'surprises' | 'trailers' | 'damage'>;

export interface FeedbackContext {
  /** The player's vehicle id: other vehicles' events make no toast or sound. */
  vehicleId: string;
  /** The player's vehicle now (it is replaced on a vehicle swap). */
  vehicle: () => Pick<Vehicle, 'condition' | 'tuning'>;
  /** The controller picked in Settings, for the button named in a stall toast. */
  controller: () => ControllerType;
}

/**
 * The sim's events as the player meets them: a toast on the HUD and a sound for a puncture,
 * a stall, a diff locking, a trailer tipping and the rest (moved out of `Game`, v1.52).
 * The tool and rescue events change the run's state, so `Game` keeps those.
 */
export function wireSimFeedback(
  sim: FeedbackSim,
  hud: Pick<Hud, 'toast'>,
  audio: FeedbackAudio,
  ctx: FeedbackContext,
): void {
  const local = ctx.vehicleId;
  sim.events.on('surprise', (e) => {
    hud.toast(surpriseMessage(e), e.phase === 'started' ? 2600 : 4200);
    if (e.phase !== 'started') return;
    const plan = sim.surprises?.plans.find((p) => p.id === e.id);
    audio.surprise(e.kind, plan ? planDuration(plan) : 2);
  });
  sim.events.on('trailer', (e) => {
    const text = trailerMessage(e.event);
    if (text) hud.toast(text, 2600);
    if (
      e.event.type === 'hitched' ||
      e.event.type === 'unhitched' ||
      e.event.type === 'jackknifed' ||
      e.event.type === 'tipped'
    )
      audio.trailerEvent(e.event.type, sim.trailers.get(e.id)?.drums ?? 0);
  });
  sim.events.on(
    'trailerBump',
    (e) => e.vehicle === local && audio.trailerBump(e.speed, sim.trailers.get(e.id)?.drums ?? 0),
  );
  sim.events.on('transferChanged', ({ id, mode }) => {
    if (id !== local) return;
    hud.toast(`Transfer case: ${mode}`, 1800);
    audio.drivetrainClunk('range');
  });
  sim.events.on('transferBlocked', ({ id, reason }) => {
    if (id === local) hud.toast(reason, 2600);
  });
  sim.events.on('windup', ({ id }) => {
    if (id !== local) return;
    hud.toast('Driveline winding up: select 2H or unlock the centre diff on firm ground', 4200);
    audio.drivetrainClunk('windup');
  });
  sim.events.on('engine', ({ id, event }) => {
    if (id !== local) return;
    if (event === 'outOfFuel') {
      hud.toast(
        ctx.vehicle().condition.jerryCans > 0
          ? 'Out of fuel — pour in a jerry can from the tool menu'
          : 'Out of fuel',
        3600,
      );
      audio.engineEvent('stalled');
      return;
    }
    if (event === 'clutchToStart') {
      hud.toast('Clutch in or neutral to start', 2400);
      return;
    }
    if (event === 'stalledLugged') {
      hud.toast(`Stalled: press ${controllers[ctx.controller()].accelerate} to restart`, 3200);
      audio.engineEvent('stalled');
      return;
    }
    if (event !== 'starting')
      hud.toast(event === 'stalled' ? 'Engine stalled — flooded' : 'Engine restarted');
    audio.engineEvent(event);
  });
  sim.events.on('diffChanged', ({ axle, locked }) => {
    hud.toast(`${axle === 'front' ? 'Front' : 'Rear'} differential ${locked ? 'locked' : 'open'}`, 1600);
    audio.drivetrainClunk(locked ? 'lockOn' : 'lockOff');
  });
  sim.events.on('parkBrakeChanged', ({ id, on }) => {
    if (id !== local) return;
    hud.toast(on ? 'Handbrake on' : 'Handbrake off', 1200);
    audio.parkBrake(on);
  });
  sim.events.on('lightsChanged', ({ id, mode }) => {
    if (id !== local) return;
    hud.toast(
      { off: 'Headlights off', low: 'Headlights: low beam', high: 'Headlights: high beam' }[mode],
      1200,
    );
    audio.lightSwitch(mode === 'high');
  });
  sim.events.on('damage', (e) => {
    if (e.id !== local) return;
    hud.toast(damageMessage(e, ctx.vehicle().tuning, sim.damage), 3200);
    audio.damage(e.part, e.part === 'engine' && e.health <= 0);
  });
  sim.events.on('repaired', ({ id, kind }) => {
    if (id !== local) return;
    const c = ctx.vehicle().condition;
    hud.toast(
      {
        field: 'Field repair done',
        spare: `Spare fitted (${c.spares} left)`,
        plug: `Tyre plugged (${c.plugs} plug${c.plugs === 1 ? '' : 's'} left)`,
        refuel: `20 L in the tank (${c.jerryCans} can${c.jerryCans === 1 ? '' : 's'} left)`,
        camp: 'Repaired at camp',
        pump: `Tyres set to ${pressurePsi(c)} psi`,
        hubs: 'Front hubs changed',
        dig: 'Wheels dug clear: ease out gently; wheelspin digs them back in',
      }[kind],
      2000,
    );
    audio.drivetrainClunk('range');
  });
  sim.events.on('diffBlocked', () => hud.toast('Slow below 5 km/h to engage diff locks'));
  sim.events.on('precisionChanged', ({ enabled }) =>
    hud.toast(enabled ? 'Precision crawl — hold throttle for walking pace' : 'Precision crawl off'),
  );
  sim.events.on('wheelImpact', ({ id, speed }) => id === local && audio.wheelImpact(speed));
  sim.events.on('dent', ({ id, impact }) => id === local && audio.dent(impact));
  sim.events.on('bodyKnock', ({ id, impulse }) => id === local && audio.bodyKnock(impulse));
}
