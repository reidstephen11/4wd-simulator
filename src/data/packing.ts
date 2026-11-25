import type { EpisodeId, EpisodeLoadout } from './episodes';
import type { VehicleId } from './vehicle';
import { vehicleLoadout, vehicles } from './vehicles';

/** Diesel or petrol in the tank, kg per litre. */
export const fuelKgPerLitre = 0.8;
/** A full 20 L jerry can, the steel can included. */
export const jerryCanKg = 22;
/** A tyre plug kit's share per plug: next to nothing. */
const plugKg = 0.05;

/** What can be packed: fuel in 10 L steps from 10 L up to a full tank, and these counts. */
export const packLimits = { fuelStep: 10, minFuel: 10, jerryCans: 4, spares: 3, plugs: 6 } as const;

/**
 * Each vehicle's spare wheel and tyre, and the weight it has room for on top of the
 * standard load before it is overloaded (springs and the rated gross mass, rounded).
 */
const kit: Record<VehicleId, { spareKg: number; roomKg: number }> = {
  shortie: { spareKg: 35, roomKg: 100 },
  forty: { spareKg: 35, roomKg: 100 },
  ute40: { spareKg: 35, roomKg: 250 },
  camel: { spareKg: 30, roomKg: 90 },
  perentie: { spareKg: 35, roomKg: 140 },
  hilux: { spareKg: 30, roomKg: 120 },
  unimog: { spareKg: 100, roomKg: 400 },
  troopy: { spareKg: 40, roomKg: 160 },
  hj60: { spareKg: 40, roomKg: 150 },
  mq: { spareKg: 40, roomKg: 110 },
  patrol: { spareKg: 40, roomKg: 140 },
  lc79: { spareKg: 60, roomKg: 140 },
  sooty80: { spareKg: 55, roomKg: 120 },
  rangie: { spareKg: 32, roomKg: 130 },
  xtracab: { spareKg: 34, roomKg: 130 },
};

/** The packing that matters to the physics: one spare's weight, and the standard load's. */
export interface PackWeights {
  spareKg: number;
  /** The standard load (kg): the vehicle's tuned mass already carries it. */
  baseKg: number;
}

/** Weight of what's on board: fuel in the tank, jerry cans, spare wheels and plugs. */
export function carriedKg(l: EpisodeLoadout, spareKg: number): number {
  return l.fuel * fuelKgPerLitre + l.jerryCans * jerryCanKg + l.spares * spareKg + l.plugs * plugKg;
}

export function loadKg(l: EpisodeLoadout, id: VehicleId): number {
  return carriedKg(l, kit[id].spareKg);
}

/** The heaviest load a vehicle may set out with. */
export function packLimitKg(standard: EpisodeLoadout, id: VehicleId): number {
  return loadKg(vehicleLoadout(standard, id), id) + kit[id].roomKg;
}

export function packWeights(standard: EpisodeLoadout, id: VehicleId): PackWeights {
  return { spareKg: kit[id].spareKg, baseKg: loadKg(vehicleLoadout(standard, id), id) };
}

/**
 * A load the vehicle can carry: whole counts within the limits, fuel within its tank, and
 * no heavier than its limit (jerry cans come off first, then spares, then fuel).
 */
export function fitPack(l: EpisodeLoadout, standard: EpisodeLoadout, id: VehicleId): EpisodeLoadout {
  const tank = vehicles[id].tuning.engine.fuel.tankLitres;
  const whole = (x: number, max: number) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));
  const out: EpisodeLoadout = {
    fuel: Math.max(packLimits.minFuel, Math.min(tank, Number(l.fuel) || 0)),
    jerryCans: whole(l.jerryCans, packLimits.jerryCans),
    spares: whole(l.spares, packLimits.spares),
    plugs: whole(l.plugs, packLimits.plugs),
  };
  const limit = packLimitKg(standard, id) + 0.01;
  while (loadKg(out, id) > limit && out.jerryCans > 0) out.jerryCans--;
  while (loadKg(out, id) > limit && out.spares > 0) out.spares--;
  while (loadKg(out, id) > limit && out.fuel > packLimits.minFuel)
    out.fuel = Math.max(packLimits.minFuel, out.fuel - packLimits.fuelStep);
  return out;
}

/** One step up or down of one item, or null when it won't go (a limit, or too heavy). */
export function stepPack(
  l: EpisodeLoadout,
  item: keyof EpisodeLoadout,
  dir: 1 | -1,
  standard: EpisodeLoadout,
  id: VehicleId,
): EpisodeLoadout | null {
  const tank = vehicles[id].tuning.engine.fuel.tankLitres;
  const next = { ...l };
  if (item === 'fuel') {
    // Steps land on tens, with a full tank as the last one.
    const step = packLimits.fuelStep;
    next.fuel =
      dir > 0
        ? Math.min(tank, Math.floor(l.fuel / step) * step + step)
        : Math.max(packLimits.minFuel, Math.ceil(l.fuel / step) * step - step);
  } else {
    next[item] = l[item] + dir;
    if (next[item] < 0 || next[item] > packLimits[item]) return null;
  }
  if (next[item] === l[item]) return null;
  if (dir > 0 && loadKg(next, id) > packLimitKg(standard, id) + 0.01) return null;
  return next;
}

/**
 * Loads packed by hand, per episode and vehicle. Only a load that differs from the
 * episode's standard one is kept, so an episode never starts with another's load (v2.23).
 */
export type SavedPacks = Partial<Record<EpisodeId, Partial<Record<VehicleId, EpisodeLoadout>>>>;

const sameLoad = (a: EpisodeLoadout, b: EpisodeLoadout): boolean =>
  a.fuel === b.fuel && a.jerryCans === b.jerryCans && a.spares === b.spares && a.plugs === b.plugs;

/** Whether a load is the episode's standard one for this vehicle. */
export function isStandardPack(l: EpisodeLoadout, standard: EpisodeLoadout, id: VehicleId): boolean {
  return sameLoad(fitPack(l, standard, id), vehicleLoadout(standard, id));
}

/** The load a new run of an episode starts with: the one packed by hand for it, else its standard load. */
export function packFor(
  packs: SavedPacks | undefined,
  episode: EpisodeId,
  standard: EpisodeLoadout,
  id: VehicleId,
): EpisodeLoadout {
  return fitPack(packs?.[episode]?.[id] ?? vehicleLoadout(standard, id), standard, id);
}

/** The saved packs with this episode and vehicle's load set: kept if packed by hand, dropped if standard. */
export function rememberPack(
  packs: SavedPacks | undefined,
  episode: EpisodeId,
  standard: EpisodeLoadout,
  id: VehicleId,
  load: EpisodeLoadout,
): SavedPacks {
  const forEpisode = { ...packs?.[episode] };
  if (isStandardPack(load, standard, id)) delete forEpisode[id];
  else forEpisode[id] = fitPack(load, standard, id);
  return { ...packs, [episode]: forEpisode };
}
