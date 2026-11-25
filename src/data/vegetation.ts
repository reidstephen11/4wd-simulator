/** Tree species and scatter tuning (SPEC §4 vegetation). Sizes in metres. */
export type TreeSpecies = 'ash' | 'candlebark' | 'snowgum' | 'dead' | 'rainforest' | 'fanpalm' | 'treefern';

export interface SpeciesDef {
  height: readonly [number, number];
  trunkRadius: readonly [number, number];
  /** Canopy radius as a fraction of height. */
  canopy: number;
}

export const treeSpecies: Record<TreeSpecies, SpeciesDef> = {
  // Tall, straight mountain ash in the valleys.
  ash: { height: [22, 34], trunkRadius: [0.32, 0.5], canopy: 0.2 },
  // Mid-size eucalypt on the slopes.
  candlebark: { height: [13, 21], trunkRadius: [0.24, 0.38], canopy: 0.28 },
  // Short, twisted snow gums on the high plain.
  snowgum: { height: [5.5, 9.5], trunkRadius: [0.18, 0.32], canopy: 0.5 },
  dead: { height: [9, 17], trunkRadius: [0.22, 0.36], canopy: 0.2 },
  // Tropical rainforest canopy tree: grey trunk on buttress roots, a broad dark crown.
  rainforest: { height: [20, 32], trunkRadius: [0.3, 0.55], canopy: 0.34 },
  // Fan palm (Licuala ramsayi): a slender trunk and a crown of round, pleated leaves.
  fanpalm: { height: [4.5, 9], trunkRadius: [0.07, 0.11], canopy: 0.32 },
  // Tree fern: a fibrous trunk and arching fronds, in damp gullies and along creeks.
  treefern: { height: [3, 6], trunkRadius: [0.12, 0.18], canopy: 0.5 },
};

/**
 * Tropical maps: rainforest everywhere trees grow, except open eucalypt woodland in the
 * map's `woodland` areas. Shares of each species in the rainforest.
 */
export const tropicalFlora = {
  palmShare: 0.24,
  fernShare: 0.12,
  /** Ferns crowd the creeks: their share within this distance (m) of water. */
  fernNearCreek: 0.4,
  creekReach: 26,
  /** Rainforest is denser than the eucalypt forest (multiplies the map's tree density). */
  rainforestDensity: 1.25,
};

export const scatterTuning = {
  /** Jittered grid cell for trees (m). */
  treeCell: 7,
  rockCell: 9,
  logCell: 32,
  /** Share of trees that are dead stags. */
  deadShare: 0.05,
  /** Rocks bigger than this radius are winch anchors when marked. */
  anchorRockRadius: 1.0,
  /** Share of large scattered boulders that are marked anchors. */
  markedShare: 0.35,
  /** Trees closer than this to the creek's water edge are skipped (m). */
  creekClearance: 3,
  propClearance: 9,
  /** Height of the trunk collider (m); only the lower trunk matters. */
  trunkColliderHeight: 5,
};

/** Decorative ground cover drawn near the camera (render only, no colliders). */
export const groundCover = {
  /** Tussocks per 100 m² on open grass at full density. */
  tussockDensity: 20,
  shrubDensity: 1.6,
  tile: 32,
  /** No shrubs this close (m) to a campsite's start position, so none pokes through the bonnet. */
  spawnClearance: 6,
};
