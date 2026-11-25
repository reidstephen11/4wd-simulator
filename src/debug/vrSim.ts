/**
 * `?vrsim`: a pretend Quest 3 (Meta's WebXR emulator, iwer), so headset play can be tried
 * and tested in a desktop browser. `window.__xr` is the device: its controllers' buttons and
 * sticks, and the head's position and rotation, can be set from a test.
 */
export async function installVrSim(): Promise<void> {
  const { XRDevice, metaQuest3 } = await import('iwer');
  const device = new XRDevice(metaQuest3, { stereoEnabled: false });
  // Chromium has its own (empty) WebXR: replace it.
  device.installRuntime({ forceInstall: true });
  (window as unknown as { __xr: unknown }).__xr = device;
}
