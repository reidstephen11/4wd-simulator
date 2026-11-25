import { defaultConditions } from '../data/environment';
import { episodeOrder, episodes } from '../data/episodes';
import { packFor } from '../data/packing';
import { vehicleLoadout } from '../data/vehicles';
import type { EpisodeId, EpisodeLoadout } from '../data/episodes';
import type { VehicleId } from '../data/vehicle';
import type { Checkpoint } from '../sim/episode';
import type { SaveData } from '../sim/save/save';
import type { LaunchChoice } from './game';

/**
 * The welcome screen's starting choice: the episode and vehicle chosen last time,
 * carrying on from its last camp if a run is under way.
 */
export function choiceFromSave(save: SaveData | null): LaunchChoice {
  const episode = save?.episode ?? episodeOrder[0];
  const vehicle = save?.vehicle ?? 'shortie';
  const standard = episodes[episode].loadout;
  return {
    episode,
    vehicle,
    load: packFor(save?.packs, episode, standard, vehicle),
    resume: !!save?.episodes[episode]?.checkpoint,
    // A playground (no goal) has no story conditions: the time and weather are always picked.
    replay: episodes[episode].goal
      ? save?.episodes[episode]?.completed
        ? (save.replay ?? null)
        : null
      : (save?.replay ?? defaultConditions),
  };
}

/**
 * What the briefing lists as on board: continuing from a camp, what was there when you
 * reached it; a new run, the pack chosen (else the standard load).
 */
export function briefingLoad(
  checkpoint: Checkpoint | null | undefined,
  packed: EpisodeLoadout | undefined,
  episode: EpisodeId,
  vehicle: VehicleId,
): EpisodeLoadout {
  if (checkpoint) {
    const { fuel, jerryCans, spares, plugs } = checkpoint;
    return { fuel, jerryCans, spares, plugs };
  }
  return packed ?? vehicleLoadout(episodes[episode].loadout, vehicle);
}
