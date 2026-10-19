import * as THREE from 'three';
import { headlightTuning as H, type BeamTuning, type HeadlightMode } from '../data/headlights';
import type { Vec3 } from '../sim/vehicle/math';

const BEAM_COLOUR = '#FFE6BF';
const RAD = Math.PI / 180;

/**
 * The light the lamps throw at dusk and night: one spot light for the pair of headlamps
 * (at the middle of the pair, a little ahead of the front of the car) and one for the
 * roof lamps. Every vehicle has both, so the number of lights in the scene, and with it
 * every material's shader, stays the same when the vehicle is swapped or the lights are
 * switched; switching only changes their strength.
 */
export class HeadlightBeams {
  readonly group = new THREE.Group();
  private readonly head: THREE.SpotLight;
  private readonly roof: THREE.SpotLight;
  private readonly hasRoofLamps: boolean;
  private mode: HeadlightMode | null = null;

  constructor(lamps: { head: readonly Vec3[]; roof?: readonly Vec3[] }, frontZ: number) {
    const mid = (ps: readonly Vec3[]) => ({
      x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
      z: Math.min(...ps.map((p) => p.z)),
    });
    const head = mid(lamps.head);
    this.head = this.spot(head.x, head.y, Math.min(head.z, frontZ - H.beamAhead));
    // The roof lamps sit above everything in front of them, so they shine from the lenses.
    this.hasRoofLamps = (lamps.roof?.length ?? 0) > 0;
    const roof = this.hasRoofLamps ? mid(lamps.roof!) : head;
    this.roof = this.spot(roof.x, roof.y, roof.z);
    this.set('off');
  }

  private spot(x: number, y: number, z: number): THREE.SpotLight {
    const s = new THREE.SpotLight(BEAM_COLOUR, 0);
    s.position.set(x, y, z);
    s.castShadow = false;
    this.group.add(s, s.target);
    return s;
  }

  set(mode: HeadlightMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    aim(this.head, mode === 'off' ? null : H[mode]);
    aim(this.roof, mode === 'high' && this.hasRoofLamps ? H.roof : null);
  }

  /** Beam strengths now (tests and the debug overlay). */
  get strengths(): { head: number; roof: number } {
    return { head: this.head.intensity, roof: this.roof.intensity };
  }
}

function aim(s: THREE.SpotLight, b: BeamTuning | null): void {
  s.intensity = b ? b.intensity : 0;
  if (!b) return;
  s.distance = b.distance;
  s.angle = b.angleDeg * RAD;
  s.penumbra = b.penumbra;
  s.decay = b.decay;
  // Forward is -z; dip the beam below level.
  s.target.position.set(s.position.x, s.position.y - Math.tan(b.dipDeg * RAD) * 10, s.position.z - 10);
}
