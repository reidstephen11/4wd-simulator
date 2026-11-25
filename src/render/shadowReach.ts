import * as THREE from 'three';
import { treeSpecies } from '../data/vegetation';
import type { TreeInstance } from '../sim/world/scatter';

/**
 * Shade beyond the reach of the shadow map (v1.84).
 *
 * The sun's shadows are drawn from one map centred on the car (40 m either way on Low, 55 m
 * on Medium and High). Beyond it nothing was shaded, so under trees the road ahead lay in
 * full sun and turned dark along a hard line as the car reached it: the owner saw the track
 * "regenerating". Two things close that:
 *
 * - `patchShadowReach` fades every drawn shadow out over the rim of the map, so its edge is
 *   never a line.
 * - The ground takes a second, soft shade from `canopyMap`, a picture of the map's tree cover
 *   seen from above. Where a drawn shadow fades out the ground fades to that, so a road under
 *   trees is in shade at any distance, and the sharp shadows of trunks and crowns sharpen out
 *   of it near the car.
 */

/** The band at the rim of the shadow map over which a shadow fades out, as a share of the map's half-width. */
export const SHADOW_RIM = 0.34;
/** Metres per cell of the tree-cover map. */
const CELL = 2;
/** Furthest (m) the cover is shifted from under the trees towards where their shadows fall. */
const MAX_SHIFT = 45;

/** Shared by the ground material: the tree-cover map and how it is laid over the world. */
export const canopyUniforms = {
  canopyMap: { value: null as THREE.Texture | null },
  /** xy: added to a world position's xz; zw: then multiplied, giving the map's 0–1 coordinates. */
  canopyBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  /** How far (m, world xz) shadows fall from the trees that cast them, with the sun where it is. */
  canopyShift: { value: new THREE.Vector2() },
  /** How much of the sun the cover takes away under a full canopy. */
  canopyStrength: { value: 0 },
};

let patched = false;

/**
 * Fade drawn shadows out at the rim of the shadow map, in every material (three's shared
 * shader chunks). A material with `SHADOW_FAR_SHADE` defined fades to `shadowFarLit`, which it
 * sets before its lights are worked out, where the others fade to full sun.
 */
export function patchShadowReach(): void {
  if (patched) return;
  patched = true;
  const call = /getShadow\( directionalShadowMap\[ i \],[^;]*?vDirectionalShadowCoord\[ i \] \)/;
  const begin = THREE.ShaderChunk.lights_fragment_begin;
  if (!call.test(begin)) throw new Error('three.js changed how a directional shadow is applied');
  THREE.ShaderChunk.lights_fragment_begin = begin.replace(
    call,
    (drawn) => `shadowReach( ${drawn}, vDirectionalShadowCoord[ i ] )`,
  );
  THREE.ShaderChunk.shadowmap_pars_fragment += /* glsl */ `
#ifdef USE_SHADOWMAP
	#ifdef SHADOW_FAR_SHADE
		// The share of the sun that reaches this fragment where no shadow is drawn.
		float shadowFarLit = 1.0;
	#endif
	// A drawn shadow well inside the shadow map, fading at the map's rim to what lies beyond it.
	float shadowReach( float drawn, vec4 shadowCoord ) {
		vec2 c = shadowCoord.xy / shadowCoord.w;
		vec2 fromEdge = min( c, 1.0 - c );
		float inside = smoothstep( 0.0, ${(SHADOW_RIM / 2).toFixed(3)}, min( fromEdge.x, fromEdge.y ) );
		#ifdef SHADOW_FAR_SHADE
			return mix( shadowFarLit, drawn, inside );
		#else
			return mix( 1.0, drawn, inside );
		#endif
	}
#endif
`;
}

/** A tree's crown as the cover map draws it: its radius (m) and the height of its middle. */
function crown(t: TreeInstance): { radius: number; height: number } {
  return { radius: Math.max(1.5, t.height * treeSpecies[t.species].canopy), height: t.height * 0.78 };
}

/**
 * The tree cover of a map `sizeX` × `sizeZ` metres, centred on the origin, one byte for every
 * 2 m square: 255 under a crown, falling away past its edge. Returns the cells and the
 * typical height of the crowns that made them (weighted by their area: the big trees do the
 * shading).
 */
export function canopyCover(
  sizeX: number,
  sizeZ: number,
  trees: readonly TreeInstance[],
): { data: Uint8Array; width: number; height: number; crownHeight: number } {
  const width = Math.ceil(sizeX / CELL);
  const height = Math.ceil(sizeZ / CELL);
  const data = new Uint8Array(width * height);
  let weight = 0;
  let heights = 0;
  for (const t of trees) {
    if (t.species === 'dead') continue;
    const c = crown(t);
    weight += c.radius * c.radius;
    heights += c.height * c.radius * c.radius;
    // Full shade to 0.8 of the crown's radius, none by 1.2: crowns are ragged, and the map is coarse.
    const reach = c.radius * 1.2;
    const x0 = Math.max(0, Math.floor((t.x + sizeX / 2 - reach) / CELL));
    const x1 = Math.min(width - 1, Math.ceil((t.x + sizeX / 2 + reach) / CELL));
    const z0 = Math.max(0, Math.floor((t.z + sizeZ / 2 - reach) / CELL));
    const z1 = Math.min(height - 1, Math.ceil((t.z + sizeZ / 2 + reach) / CELL));
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const d = Math.hypot((ix + 0.5) * CELL - sizeX / 2 - t.x, (iz + 0.5) * CELL - sizeZ / 2 - t.z);
        const shade = Math.min(1, Math.max(0, (reach - d) / (c.radius * 0.4)));
        const i = iz * width + ix;
        if (shade * 255 > data[i]) data[i] = Math.round(shade * 255);
      }
  }
  return { data, width, height, crownHeight: weight > 0 ? heights / weight : 0 };
}

/** How far (m, world xz) a shadow falls from a crown `crownHeight` up, towards the sun's side. */
export function shadowShift(
  sunDir: THREE.Vector3,
  crownHeight: number,
  out = new THREE.Vector2(),
): THREE.Vector2 {
  // The ground at P is shaded by the crown at P + (towards the sun) × height / tan(elevation).
  const k = crownHeight / Math.max(0.2, sunDir.y);
  out.set(sunDir.x * k, sunDir.z * k);
  if (out.length() > MAX_SHIFT) out.setLength(MAX_SHIFT);
  return out;
}

/** The tree cover as the ground material's far shade. Returns the crowns' typical height. */
export function setCanopyShade(sizeX: number, sizeZ: number, trees: readonly TreeInstance[]): number {
  const cover = canopyCover(sizeX, sizeZ, trees);
  const texture = new THREE.DataTexture(cover.data, cover.width, cover.height, THREE.RedFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  canopyUniforms.canopyMap.value?.dispose();
  canopyUniforms.canopyMap.value = texture;
  canopyUniforms.canopyBox.value.set(
    sizeX / 2,
    sizeZ / 2,
    1 / (cover.width * CELL),
    1 / (cover.height * CELL),
  );
  return cover.crownHeight;
}
