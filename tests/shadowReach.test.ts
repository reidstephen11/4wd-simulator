import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { canopyCover, patchShadowReach, shadowShift, SHADOW_RIM } from '../src/render/shadowReach';
import type { TreeInstance } from '../src/sim/world/scatter';

const tree = (x: number, z: number, height: number, species: TreeInstance['species'] = 'rainforest') =>
  ({
    x,
    y: 0,
    z,
    species,
    height,
    trunkRadius: 0.4,
    yaw: 0,
    leanX: 0,
    leanZ: 0,
    seed: 0.5,
    solid: true,
  }) as TreeInstance;

describe('shade beyond the shadow map (v1.84)', () => {
  it('wraps the sun’s shadow in the rim fade, in three’s shared shader chunks', () => {
    patchShadowReach();
    // Twice is once: the renderer and the studio both build a Lighting.
    patchShadowReach();
    const begin = THREE.ShaderChunk.lights_fragment_begin;
    expect(begin.match(/shadowReach\( getShadow\( directionalShadowMap\[ i \]/g)?.length).toBe(1);
    expect(begin).toContain('vDirectionalShadowCoord[ i ] ), vDirectionalShadowCoord[ i ] )');
    const pars = THREE.ShaderChunk.shadowmap_pars_fragment;
    expect(pars.match(/float shadowReach\(/g)?.length).toBe(1);
    // The fade ends at the map's edge and is complete inside the rim.
    expect(pars).toContain(`smoothstep( 0.0, ${(SHADOW_RIM / 2).toFixed(3)}`);
    expect(SHADOW_RIM).toBeGreaterThan(0.15);
    expect(SHADOW_RIM).toBeLessThan(0.5);
  });

  it('draws full cover under a crown and none well clear of it', () => {
    // A 30 m rainforest tree: a crown about 10 m in radius.
    const cover = canopyCover(200, 100, [tree(20, -10, 30)]);
    expect(cover.width).toBe(100);
    expect(cover.height).toBe(50);
    const at = (x: number, z: number) =>
      cover.data[Math.floor((z + 50) / 2) * cover.width + Math.floor((x + 100) / 2)];
    expect(at(20, -10)).toBe(255);
    expect(at(26, -10)).toBe(255);
    expect(at(20, -10 + 11)).toBeGreaterThan(0);
    expect(at(20, -10 + 11)).toBeLessThan(255);
    expect(at(40, -10)).toBe(0);
    expect(at(-60, 30)).toBe(0);
  });

  it('leaves dead trees out and takes the height of the crowns from the big trees', () => {
    expect(canopyCover(100, 100, [tree(0, 0, 14, 'dead')]).data.some((v) => v > 0)).toBe(false);
    const mixed = canopyCover(200, 200, [tree(0, 0, 30), tree(50, 0, 6, 'fanpalm')]);
    // The fan palm's small crown barely moves it from the rainforest tree's 0.78 × 30 m.
    expect(mixed.crownHeight).toBeGreaterThan(21);
    expect(mixed.crownHeight).toBeLessThan(23.5);
    expect(canopyCover(100, 100, []).crownHeight).toBe(0);
  });

  it('shifts the cover towards the sun by the height of the crowns over the tangent of its elevation', () => {
    const sun = (azimuthDeg: number, elevationDeg: number) => {
      const [az, el] = [(azimuthDeg * Math.PI) / 180, (elevationDeg * Math.PI) / 180];
      return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    };
    // Sun in the east at 45°: the crown shading a spot stands its own height to the east of it.
    const east = shadowShift(sun(90, 45), 20);
    expect(east.x).toBeCloseTo(20, 3);
    expect(east.y).toBeCloseTo(0, 3);
    // Overhead: straight above.
    expect(shadowShift(sun(0, 90), 20).length()).toBeCloseTo(0, 3);
    // A low sun would throw it hundreds of metres: held to 45 m, towards the sun still.
    const low = shadowShift(sun(0, 3), 20);
    expect(low.length()).toBeCloseTo(45, 3);
    expect(low.y).toBeLessThan(0);
  });
});
