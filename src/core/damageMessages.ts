import type { DamageMode } from '../data/damage';
import type { VehicleTuning } from '../data/vehicle';
import type { DamageEvent } from '../sim/vehicle/damage';

/** "Front left", "Rear right", ... for a wheel. */
export function cornerName(t: VehicleTuning, wheel: number): string {
  const w = t.wheels[wheel];
  return `${w.front ? 'Front' : 'Rear'} ${w.x < 0 ? 'left' : 'right'}`;
}

/** What the HUD says when something is damaged. */
export function damageMessage(e: DamageEvent, t: VehicleTuning, mode: DamageMode): string {
  if (e.part === 'tyre')
    return `${cornerName(t, e.wheel)} tyre cut on a rock — ${mode === 'realistic' ? 'it’s going flat' : 'it’s going soft'}`;
  if (e.part === 'suspension') return `${cornerName(t, e.wheel)} suspension bent`;
  if (e.health <= 0) return 'Engine wrecked — Pause menu → Return to last campsite';
  const what = {
    knock: 'Hit underneath — the engine is damaged',
    crash: 'Front-end damage — the engine is damaged',
    inverted: 'Upside down — the engine is starved of oil',
    water: 'Water in the engine — it’s damaged',
    rock: 'The engine is damaged',
    landing: 'The engine is damaged',
  }[e.cause];
  return `${what} (${Math.round(e.health * 100)}%)`;
}
