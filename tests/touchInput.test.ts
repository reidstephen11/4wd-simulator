import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/sim/input/inputManager';
import { TouchStick } from '../src/sim/input/touchStick';
import { touchTuning } from '../src/data/touch';

const DT = 1 / 60;
const R = touchTuning.joystickRadius;

function touchInput() {
  const input = new InputManager(new EventTarget() as unknown as Window);
  const devices: string[] = [];
  input.onDeviceChange((d) => devices.push(d));
  return { input, devices };
}

describe('touch joystick', () => {
  it('ignores a resting thumb, scales to full lock at the rim and clamps beyond it', () => {
    const s = new TouchStick();
    s.move(R * touchTuning.joystickDeadzone * 0.9, 0);
    expect(s.x).toBe(0);
    s.move(R, 0);
    expect(s.x).toBeCloseTo(1);
    s.move(-3 * R, 0);
    expect(s.x).toBeCloseTo(-1);
    expect(s.knob().x).toBeCloseTo(-R);
    s.move(R / 2, 0);
    expect(s.x).toBeGreaterThan(0.3);
    expect(s.x).toBeLessThan(0.5);
    s.release();
    expect([s.x, s.y]).toEqual([0, 0]);
  });

  it('gives one menu press per push and needs to come back before the next', () => {
    const s = new TouchStick();
    expect(s.move(R, 0)).toEqual(['menuRight']);
    expect(s.move(R * 0.9, 5)).toEqual([]);
    expect(s.move(R * 0.2, 0)).toEqual([]);
    expect(s.move(R, 0)).toEqual(['menuRight']);
    s.release();
    expect(s.move(0, -R)).toEqual(['menuUp']);
  });
});

describe('touch buttons in the input manager', () => {
  it('pedals and the stick drive like keys and a gamepad stick', () => {
    const { input, devices } = touchInput();
    input.touchHold('accelerate', true);
    input.touchJoystick(1, 0);
    let inp = input.vehicleInput(DT);
    for (let i = 0; i < 30; i++) inp = input.vehicleInput(DT);
    expect(inp.throttle).toBe(1);
    expect(inp.steer).toBeCloseTo(1);
    expect(devices).toEqual(['touch']);
    input.touchHold('accelerate', false);
    input.touchHold('brake', true);
    input.touchJoystick(0, 0);
    for (let i = 0; i < 30; i++) inp = input.vehicleInput(DT);
    expect([inp.throttle, inp.brake, inp.steer]).toEqual([0, 1, 0]);
  });

  it('taps are single-step commands, and held buttons stay held until released', () => {
    const { input } = touchInput();
    input.touchPress('handbrake');
    input.touchPress('range');
    const first = input.vehicleInput(DT);
    expect([first.toggleParkBrake, first.toggleRange]).toEqual([true, true]);
    const next = input.vehicleInput(DT);
    expect([next.toggleParkBrake, next.toggleRange]).toEqual([false, false]);
    input.touchHold('winchIn', true);
    expect(input.vehicleInput(DT).winchIn).toBe(true);
    expect(input.vehicleInput(DT).winchIn).toBe(true);
    input.touchHold('winchIn', false);
    expect(input.vehicleInput(DT).winchIn).toBe(false);
  });

  it('menu taps reach the UI but not driving while a menu is open; the stick moves planks', () => {
    const { input } = touchInput();
    input.vehicleEnabled = false;
    input.touchPress('frontDiff');
    input.touchJoystick(0.2, -0.8, ['menuUp']);
    expect(input.pressed('frontDiff')).toBe(true);
    expect(input.pressCount('menuUp')).toBe(1);
    expect(input.stick()).toEqual({ x: 0.2, y: -0.8 });
    input.consumeUi();
    input.vehicleEnabled = true;
    expect(input.vehicleInput(DT).toggleFrontDiff).toBe(false);
  });

  it('a key press hands control back to the keyboard', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    input.touchPress('map');
    expect(input.activeDevice).toBe('touch');
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW', repeat: false }));
    expect(input.activeDevice).toBe('keyboard');
  });
});
