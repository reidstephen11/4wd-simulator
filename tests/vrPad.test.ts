import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Pad } from '../src/data/controls';
import { VrMode } from '../src/render/vrMode';

/** A headset session with two hand controllers in the xr-standard layout. */
function headset(left: Partial<Gamepad>, right: Partial<Gamepad>) {
  const listeners: Record<string, () => void> = {};
  const session = {
    inputSources: [
      { handedness: 'left', gamepad: left },
      { handedness: 'right', gamepad: right },
    ],
  };
  const renderer = {
    xr: {
      enabled: false,
      isPresenting: true,
      setReferenceSpaceType: () => undefined,
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      getSession: () => session,
      getReferenceSpace: () => null,
    },
  } as unknown as THREE.WebGLRenderer;
  const vr = new VrMode(renderer, new THREE.Scene(), new THREE.PerspectiveCamera());
  listeners.sessionstart();
  return vr;
}

const btn = (value: number) => ({ value, pressed: value > 0.5, touched: value > 0 });
/** xr-standard: 0 trigger, 1 grip, 2 (none), 3 stick click, 4 A or X, 5 B or Y. */
const pad = (b: number[], axes: number[]) =>
  ({ buttons: b.map(btn), axes: [0, 0, ...axes] }) as unknown as Partial<Gamepad>;

describe('headset controllers as a standard pad', () => {
  it('maps triggers to pedals, the left stick to steering and the face buttons as on a pad', () => {
    const vr = headset(pad([0.8, 1, 0, 1, 1, 0], [-0.5, 0.1]), pad([0.3, 0, 0, 1, 0, 1], [0, -0.9]));
    const p = vr.virtualPad()!;
    expect(p.buttons[Pad.LT].value).toBeCloseTo(0.8);
    expect(p.buttons[Pad.RT].value).toBeCloseTo(0.3);
    expect(p.buttons[Pad.RT].pressed).toBe(true);
    expect(p.buttons[Pad.LB].pressed).toBe(true); // left grip: tool menu
    expect(p.buttons[Pad.RB].pressed).toBe(false);
    expect(p.buttons[Pad.X].pressed).toBe(true); // left X: handbrake
    expect(p.buttons[Pad.B].pressed).toBe(true); // right B
    expect(p.buttons[Pad.A].pressed).toBe(false);
    expect(p.buttons[Pad.Start].pressed).toBe(true); // left stick click: pause
    expect(p.buttons[Pad.LS].pressed).toBe(true); // right stick click: horn
    expect(p.axes[0]).toBeCloseTo(-0.5);
    // Right stick pushed up is D-pad up (winch in) and stays a stick for the tool wheel.
    expect(p.buttons[Pad.Up].pressed).toBe(true);
    expect(p.buttons[Pad.Down].pressed).toBe(false);
    expect(p.axes[3]).toBeCloseTo(-0.9);
  });

  it('gives no pad without a session', () => {
    const renderer = {
      xr: { setReferenceSpaceType: () => undefined, addEventListener: () => undefined },
    } as unknown as THREE.WebGLRenderer;
    expect(new VrMode(renderer, new THREE.Scene(), new THREE.PerspectiveCamera()).virtualPad()).toBeNull();
  });
});
