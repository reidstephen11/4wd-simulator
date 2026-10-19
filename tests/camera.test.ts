import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { ChaseCamera, type ChaseTarget, type Blocker } from '../src/render/chaseCamera';
import { cameraTuning as C, cameraPresets, cockpit } from '../src/data/camera';
import { InputManager } from '../src/sim/input/inputManager';
import { Pad } from '../src/data/controls';
import { vehicles } from '../src/data/vehicles';

const target = (): ChaseTarget => ({
  position: new Vector3(),
  forward: new Vector3(0, 0, -1),
  speed: 0,
  slopeDeg: 0,
});

function fixture(blocker: Blocker = (_from, _dir, max) => max, ground = () => -10) {
  const camera = new PerspectiveCamera();
  const chase = new ChaseCamera(camera, blocker, ground);
  const t = target();
  const settle = () => {
    for (let i = 0; i < 240; i++) chase.update(1 / 60, t);
  };
  settle();
  return { camera, chase, t, settle };
}

describe('vehicle camera orbit', () => {
  it('cycles front tyre views and a low rear view, then restores the selected follow zoom', () => {
    const { camera, chase, t, settle } = fixture();
    chase.zoom(2);
    const distance = chase.distance;
    chase.cyclePreset();
    settle();
    expect(chase.preset).toBe('frontLeft');
    expect(camera.position.x).toBeLessThan(-2);
    expect(camera.position.z).toBeLessThan(-2);
    expect(camera.position.y).toBeLessThan(2);
    camera.updateMatrixWorld();
    for (const x of [-0.725, 0.725]) {
      const tyre = new Vector3(x, -0.12, -1.15).project(camera);
      expect(Math.abs(tyre.x)).toBeLessThan(0.9);
      expect(Math.abs(tyre.y)).toBeLessThan(0.9);
    }
    chase.cyclePreset();
    settle();
    expect(chase.preset).toBe('frontRight');
    expect(camera.position.x).toBeGreaterThan(2);
    expect(camera.position.z).toBeLessThan(-2);
    t.forward.set(1, 0, 0);
    settle();
    expect(camera.position.x).toBeGreaterThan(2);
    expect(camera.position.z).toBeGreaterThan(2);
    chase.cyclePreset();
    settle();
    expect(chase.preset).toBe('rear');
    expect(camera.position.x).toBeLessThan(-3);
    chase.cyclePreset();
    expect(chase.preset).toBe('cockpit');
    chase.cyclePreset();
    expect(chase.preset).toBe('follow');
    expect(chase.distance).toBe(distance);
  });

  it("sits in the right-hand driver's seat, looks ahead, tilts with the body and turns its head", () => {
    const { camera, chase, t } = fixture();
    t.position.set(10, 2, 5);
    t.rotation = new Quaternion();
    chase.selectPreset('cockpit');
    chase.update(1 / 60, t);
    expect(camera.position.x).toBeCloseTo(10 + vehicles.shortie.cabin.eye.x, 5);
    expect(camera.position.y).toBeCloseTo(2 + vehicles.shortie.cabin.eye.y, 5);
    expect(camera.near).toBe(cockpit.near);
    // Each vehicle has its own seat.
    chase.seat = vehicles.perentie.cabin;
    chase.update(1 / 60, t);
    expect(camera.position.z).toBeCloseTo(5 + vehicles.perentie.cabin.eye.z, 5);
    chase.seat = vehicles.shortie.cabin;
    chase.update(1 / 60, t);
    const dir = camera.getWorldDirection(new Vector3());
    expect(dir.z).toBeLessThan(-0.95);
    // Body rolled 20° to the right: the view rolls with it.
    t.rotation.setFromAxisAngle(new Vector3(0, 0, 1), -0.35);
    chase.update(1 / 60, t);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(up.x).toBeGreaterThan(0.25);
    // Look right, then recentre back to the follow camera with its normal near plane.
    t.rotation.identity();
    chase.orbit(1.2, 0);
    for (let i = 0; i < 60; i++) chase.update(1 / 60, t);
    expect(camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(0.6);
    chase.recenter();
    chase.update(1 / 60, t);
    expect(chase.preset).toBe('follow');
    expect(camera.near).toBe(C.near);
  });

  it('keeps crawler presets above terrain and clear of blockers; reset restores follow view', () => {
    const { camera, chase, settle } = fixture(
      (_from, _dir, max) => Math.min(max, 3),
      () => 0,
    );
    for (const preset of ['frontLeft', 'frontRight', 'rear'] as const) {
      chase.selectPreset(preset);
      chase.orbit(0.15, -0.05);
      settle();
      expect(camera.position.y).toBeGreaterThanOrEqual(C.groundClearance);
      const profile = cameraPresets[preset];
      const pivot = new Vector3(0, profile.targetHeight, -profile.lookAhead);
      expect(camera.position.distanceTo(pivot)).toBeLessThan(3 - C.clearance + 0.1);
      expect(camera.up.toArray()).toEqual([0, 1, 0]);
    }
    chase.recenter();
    expect(chase.preset).toBe('follow');
  });

  it('shows the side and front, keeping the vehicle in the centre of manual views', () => {
    const { camera, chase, settle } = fixture();
    expect(camera.position.z).toBeGreaterThan(0);
    chase.orbit(Math.PI / 2, 0);
    settle();
    expect(camera.position.x).toBeGreaterThan(6);
    expect(camera.position.z).toBeCloseTo(0, 3);
    const toCar = new Vector3(0, C.targetHeight, 0).sub(camera.position).normalize();
    expect(camera.getWorldDirection(new Vector3()).dot(toCar)).toBeCloseTo(1, 5);
    chase.orbit(Math.PI / 2, 0);
    settle();
    expect(camera.position.z).toBeLessThan(-6);
    expect(camera.position.x).toBeCloseTo(0, 3);
  });

  it('keeps the chosen relative angle while driving and turning, then recentres without changing zoom', () => {
    const { camera, chase, t, settle } = fixture();
    chase.zoom(3);
    const distance = chase.distance;
    chase.orbit(Math.PI / 2, 0.4);
    settle();
    t.position.set(15, 3, -20);
    t.forward.set(1, 0, 0);
    t.speed = 4;
    settle();
    expect(camera.position.z - t.position.z).toBeGreaterThan(6);
    expect(camera.position.x).toBeCloseTo(t.position.x, 3);
    chase.recenter();
    settle();
    expect(camera.position.x).toBeLessThan(t.position.x - 4);
    expect(camera.position.z).toBeCloseTo(t.position.z, 3);
    expect(chase.distance).toBe(distance);
  });

  it('clamps elevation below vertical and above the horizon, with no roll or flipped view', () => {
    const { camera, chase, settle } = fixture();
    for (const pitch of [100, -200, 100]) {
      chase.orbit(0, pitch);
      settle();
      const dir = camera.position.clone().sub(new Vector3(0, C.targetHeight, 0));
      const elevation = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      expect(elevation).toBeGreaterThanOrEqual(C.minElevation - 0.001);
      expect(elevation).toBeLessThanOrEqual(C.maxElevation + 0.001);
      expect(camera.up.toArray()).toEqual([0, 1, 0]);
      expect(camera.getWorldDirection(new Vector3()).y).toBeLessThan(0);
    }
  });

  it('respects blockers at side/front angles and eases back out when clear', () => {
    let blocked = false;
    const { camera, chase, settle } = fixture((_from, _dir, max) => (blocked ? Math.min(3, max) : max));
    chase.orbit(Math.PI / 2, 0);
    settle();
    blocked = true;
    settle();
    const pivot = new Vector3(0, C.targetHeight, 0);
    expect(camera.position.distanceTo(pivot)).toBeCloseTo(3 - C.clearance, 4);
    chase.orbit(Math.PI / 2, 0);
    settle();
    expect(camera.position.z).toBeLessThan(0);
    expect(camera.position.distanceTo(pivot)).toBeCloseTo(3 - C.clearance, 4);
    blocked = false;
    chase.update(1 / 60, target());
    expect(camera.position.distanceTo(pivot)).toBeLessThan(3);
    settle();
    expect(camera.position.distanceTo(pivot)).toBeGreaterThan(6);
  });

  it('stays above terrain and returns to the default angle after a teleport', () => {
    const { camera, chase, t, settle } = fixture(undefined, () => 4);
    chase.orbit(2, -5);
    settle();
    expect(camera.position.y).toBeGreaterThanOrEqual(4 + C.groundClearance);
    t.position.set(20, 5, 10);
    chase.reset();
    chase.update(1 / 60, t);
    expect(camera.position.x).toBeCloseTo(t.position.x);
    expect(camera.position.z).toBeGreaterThan(t.position.z);
  });
});

function inputFixture() {
  const events = new EventTarget();
  const input = new InputManager(events as unknown as Window);
  const send = (type: string, values: object) => events.dispatchEvent(Object.assign(new Event(type), values));
  const pad = {
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
  return { input, send, pad };
}

afterEach(() => vi.unstubAllGlobals());

describe('camera keyboard and controller input', () => {
  it('uses the right stick for orbit without steering or zooming, and ignores stick drift', () => {
    const { input, pad } = inputFixture();
    pad.axes = [0, 0, 0.08, -0.1];
    input.poll();
    expect(input.cameraOrbit(0.5)).toEqual({ yaw: -0, pitch: 0 });
    pad.axes = [0, 0, 1, -1];
    input.poll();
    expect(input.cameraOrbit(0.5)).toEqual({ yaw: -0.9, pitch: -0.9 });
    expect(input.takeZoom(0.5)).toBe(0);
    expect(input.vehicleInput(0.5).steer).toBe(0);
  });

  it('offers numpad orbit and V / R3 recenter independently of driving controls', () => {
    const { input, send, pad } = inputFixture();
    send('keydown', { code: 'Numpad6' });
    send('keydown', { code: 'Numpad2' });
    expect(input.cameraOrbit(1)).toEqual({ yaw: -1.8, pitch: 1.8 });
    expect(input.vehicleInput(1).throttle).toBe(0);
    send('keydown', { code: 'KeyV' });
    expect(input.pressed('cameraReset')).toBe(true);
    input.consumeUi();
    expect(input.pressed('cameraReset')).toBe(false);
    pad.buttons[Pad.RS].pressed = true;
    input.poll();
    expect(input.pressed('cameraReset')).toBe(true);
    send('keydown', { code: 'KeyC' });
    expect(input.pressed('cameraPreset')).toBe(true);
    input.consumeUi();
    expect(input.pressed('cameraPreset')).toBe(false);
  });

  it('uses D-pad for driving zoom while giving tool adjustments priority, and drains the scroll wheel', () => {
    const { input, send, pad } = inputFixture();
    pad.buttons[Pad.Right].pressed = true;
    input.poll();
    expect(input.takeZoom(0.5)).toBe(3);
    expect(input.takeZoom(0.5, false)).toBe(0);
    send('wheel', { deltaY: -100 });
    expect(input.takeZoom(0.5, false)).toBe(-1);
    expect(input.takeZoom(0.5, false)).toBe(0);
    expect(input.held('menuRight')).toBe(true);
  });
});
