import * as THREE from 'three';
import { useDetailMap } from './detailTexture';
import { patchFog } from './fog';

/**
 * The fine detail of rock (v0.26), for the flat-shaded, vertex-coloured materials the rocks
 * are drawn with. Where a vertex's `tag` attribute is 1 (granite: the trail's stones, tors,
 * scattered boulders), the face gets granite's speckle of crystals, the blotches of weathering,
 * hairline joints, a little lichen on what faces up, and fine relief in the light. It is read
 * from the detail texture in world space from three sides, so it runs unbroken over an edge
 * and does not swim as the camera moves. The shapes are untouched: what the car hits is what
 * is drawn. Geometry without a `tag` (or tagged 0) is drawn as before.
 */
export function rockDetailMaterial(key: string): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    useDetailMap(shader);
    shader.vertexShader = `attribute float tag; varying float vRock; varying vec3 vRockPosition;
      ${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
        vRock = tag;
        vec4 rockPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          rockPosition = batchingMatrix * rockPosition;
        #endif
        #ifdef USE_INSTANCING
          rockPosition = instanceMatrix * rockPosition;
        #endif
        vRockPosition = (modelMatrix * rockPosition).xyz;`,
    );
    shader.fragmentShader = /* glsl */ `
      varying float vRock;
      varying vec3 vRockPosition;
      uniform sampler2D detailMap;
      // The detail texture seen from three sides, weighted by which way the face looks.
      vec4 rockSample(vec3 p, vec3 w, float scale) {
        return texture2D(detailMap, p.zy * scale) * w.x + texture2D(detailMap, p.xz * scale) * w.y +
          texture2D(detailMap, p.xy * scale) * w.z;
      }
      ${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        float rockRelief = 0.0;
        if (vRock > 0.5) {
          vec3 rockFace = normalize(cross(dFdx(vRockPosition), dFdy(vRockPosition)));
          vec3 rockWeight = abs(rockFace);
          rockWeight /= rockWeight.x + rockWeight.y + rockWeight.z;
          // Crystals 2 to 3 cm across; blotches and joints half a metre apart.
          vec4 rockFine = rockSample(vRockPosition, rockWeight, 1.7);
          vec4 rockCoarse = rockSample(vRockPosition + 3.1, rockWeight, 0.31);
          float rockFade = 1.0 - smoothstep(0.02, 0.12, length(fwidth(vRockPosition)));
          // Weathering: broad blotches a little paler or darker.
          diffuseColor.rgb *= 0.88 + 0.26 * rockCoarse.r;
          // Granite's crystals: specks paler or darker than the stone.
          float speck = smoothstep(0.3, 0.75, rockFine.g) * rockFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.55 + 0.95 * rockFine.a), speck * 0.55);
          // Hairline joints.
          float joint = smoothstep(0.8, 0.98, 1.0 - rockCoarse.b);
          diffuseColor.rgb *= 1.0 - 0.4 * joint;
          // Lichen on what faces the sky, in patches.
          float lichen =
            smoothstep(0.68, 0.82, rockCoarse.a) * smoothstep(0.6, 0.92, rockFace.y) * smoothstep(0.4, 0.62, rockFine.r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.46, 0.33), lichen * 0.28);
          rockRelief = (rockFine.r * 0.012 + rockFine.g * 0.006 - joint * 0.01) * rockFade;
        }
      `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        if (vRock > 0.5) {
          // Fine relief in the light, without moving the surface.
          vec3 rdx = dFdx(-vViewPosition), rdy = dFdy(-vViewPosition);
          vec3 rrx = cross(rdy, normal), rry = cross(normal, rdx);
          float rdet = dot(rdx, rrx);
          normal = normalize(abs(rdet) * normal - sign(rdet) * (dFdx(rockRelief) * rrx + dFdy(rockRelief) * rry));
        }
      `,
      );
  };
  return patchFog(material, key);
}
