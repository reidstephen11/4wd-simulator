import * as THREE from 'three';
import { Pad } from '../data/controls';

/** A pad in the W3C standard layout, built from the headset's two hand controllers. */
export interface VirtualPad {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

/** Right stick pushed this far counts as a D-pad press (winch in / out, menus). */
const STICK_AS_DPAD = 0.6;

/**
 * Headset play (v1.98): the driver's seat in an immersive WebXR session, driven with the
 * headset's own hand controllers.
 *
 * The camera rides in a rig that sits at the driver's eye and turns with the body, so the cab
 * is the player's still frame and the head turns freely inside it. Three.js puts the headset's
 * pose under the camera's parent each frame, at draw time, so the car's movement and the head's
 * reach the picture in the same frame.
 */
export class VrMode {
  /** Placed at the driver's eye every frame, turning with the vehicle body. */
  readonly rig = new THREE.Group();
  /** The recentre offset: puts the head where it was at the last recentre back on the eye. */
  private readonly adjust = new THREE.Group();
  /** Things fixed to the cab in front of the driver (the dash panel). */
  readonly cab = new THREE.Group();
  private session: XRSession | null = null;
  private recentrePending = false;
  private readonly listeners: Array<(on: boolean) => void> = [];
  private readonly pad: VirtualPad = {
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpE = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    this.rig.name = 'vr-rig';
    this.rig.add(this.adjust);
    this.rig.add(this.cab);
    renderer.xr.addEventListener('sessionstart', () => this.started());
    renderer.xr.addEventListener('sessionend', () => this.ended());
  }

  /** Does this browser offer immersive VR (a headset's own browser does)? */
  static async supported(): Promise<boolean> {
    try {
      return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
    } catch {
      return false;
    }
  }

  get presenting(): boolean {
    return this.session !== null && this.renderer.xr.isPresenting;
  }

  onChange(fn: (on: boolean) => void): void {
    this.listeners.push(fn);
  }

  /** Start the headset session. Must be called from a press (a click or a controller trigger). */
  async enter(): Promise<void> {
    if (this.session || !navigator.xr) return;
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor'],
    });
    await this.renderer.xr.setSession(session);
  }

  /** Leave the headset session (back to the browser window). */
  async exit(): Promise<void> {
    await this.session?.end().catch(() => undefined);
  }

  /** Put the driver's eye back where the head is now. */
  recentre(): void {
    this.recentrePending = true;
  }

  private started(): void {
    this.session = this.renderer.xr.getSession();
    // The camera rides in the rig while the headset is on.
    this.scene.add(this.rig);
    this.adjust.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.adjust.position.set(0, 0, 0);
    this.adjust.quaternion.identity();
    this.recentrePending = true;
    // The headset's own recentre (hold the Meta button) moves the space: follow it.
    const space = this.renderer.xr.getReferenceSpace();
    space?.addEventListener('reset', () => (this.recentrePending = true));
    for (const fn of this.listeners) fn(true);
  }

  private ended(): void {
    this.session = null;
    this.scene.add(this.camera);
    this.scene.remove(this.rig);
    for (const b of this.pad.buttons) {
      b.pressed = false;
      b.value = 0;
    }
    this.pad.axes.fill(0);
    for (const fn of this.listeners) fn(false);
  }

  /**
   * Seat the rig: `position` and `rotation` are the vehicle body's (as drawn this frame), `eye`
   * the driver's eye in the vehicle's own frame (forward is -z).
   */
  place(position: THREE.Vector3, rotation: THREE.Quaternion, eye: { x: number; y: number; z: number }): void {
    this.rig.position.set(eye.x, eye.y, eye.z).applyQuaternion(rotation).add(position);
    this.rig.quaternion.copy(rotation);
    if (this.recentrePending && this.renderer.xr.isPresenting) this.applyRecentre();
    this.rig.updateMatrixWorld(true);
  }

  /**
   * The headset's raw pose is in the camera's own position and rotation after each frame
   * (Three.js writes it there relative to the camera's parent). Turn the adjust group so that
   * pose, without its up-down tilt, sits on the eye facing forward.
   */
  private applyRecentre(): void {
    this.recentrePending = false;
    const raw = this.camera.position;
    this.tmpE.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 1, 0), -this.tmpE.y);
    this.adjust.quaternion.copy(this.tmpQ);
    this.adjust.position.copy(raw).applyQuaternion(this.tmpQ).negate();
  }

  /**
   * The two hand controllers as one standard pad: triggers are the pedals, the left stick
   * steers, the grips are the tool menu (left) and the winch (right), A / B / X / Y as on a
   * pad, the right stick doubles as the D-pad, left stick click pauses, right stick click is
   * the horn. Null when no controller is held.
   */
  virtualPad(): VirtualPad | null {
    const session = this.session;
    if (!session) return null;
    let left: Gamepad | null = null;
    let right: Gamepad | null = null;
    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      if (src.handedness === 'left') left = src.gamepad;
      else if (src.handedness === 'right') right = src.gamepad;
    }
    if (!left && !right) return null;
    const b = this.pad.buttons;
    const set = (i: number, value: number, pressed = value > 0.5) => {
      b[i].value = value;
      b[i].pressed = pressed;
    };
    // xr-standard layout: 0 trigger, 1 grip, 3 stick click, 4 A or X, 5 B or Y; axes 2, 3 the stick.
    const val = (g: Gamepad | null, i: number) => g?.buttons[i]?.value ?? 0;
    const hit = (g: Gamepad | null, i: number) => (g?.buttons[i]?.pressed ? 1 : 0);
    set(Pad.RT, val(right, 0), val(right, 0) > 0.05);
    set(Pad.LT, val(left, 0), val(left, 0) > 0.05);
    set(Pad.RB, hit(right, 1));
    set(Pad.LB, hit(left, 1));
    set(Pad.A, hit(right, 4));
    set(Pad.B, hit(right, 5));
    set(Pad.X, hit(left, 4));
    set(Pad.Y, hit(left, 5));
    set(Pad.Start, hit(left, 3));
    set(Pad.LS, hit(right, 3));
    set(Pad.View, 0);
    set(Pad.RS, 0);
    const lx = left?.axes[2] ?? 0;
    const ly = left?.axes[3] ?? 0;
    const rx = right?.axes[2] ?? 0;
    const ry = right?.axes[3] ?? 0;
    set(Pad.Up, ry < -STICK_AS_DPAD ? 1 : 0);
    set(Pad.Down, ry > STICK_AS_DPAD ? 1 : 0);
    set(Pad.Left, rx < -STICK_AS_DPAD ? 1 : 0);
    set(Pad.Right, rx > STICK_AS_DPAD ? 1 : 0);
    this.pad.axes[0] = lx;
    this.pad.axes[1] = ly;
    this.pad.axes[2] = rx;
    this.pad.axes[3] = ry;
    return this.pad;
  }
}
