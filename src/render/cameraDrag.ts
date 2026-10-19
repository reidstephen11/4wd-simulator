import { cameraTuning } from '../data/camera';
import { touchTuning } from '../data/touch';

/**
 * Pointer adapter for the chase camera: drag with the mouse, or with a finger on a touch
 * screen. UI overlays (including the touch controls) never start a camera drag.
 */
export class CameraDrag {
  private pointer: number | null = null;
  private sensitivity: number = cameraTuning.dragSensitivity;
  private x = 0;
  private y = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly allowed: () => boolean,
    orbit: (yaw: number, pitch: number, pointerType: string) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      const touch = e.pointerType === 'touch';
      // A finger on the steering stick may be the primary pointer, so any finger can orbit.
      if (!allowed() || (!touch && !e.isPrimary) || (e.button !== 0 && e.button !== 2)) return;
      if (this.pointer !== null) return;
      this.pointer = e.pointerId;
      this.sensitivity = touch ? touchTuning.dragSensitivity : cameraTuning.dragSensitivity;
      this.x = e.clientX;
      this.y = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('orbiting');
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointer !== e.pointerId) return;
      if (!allowed()) {
        this.cancel();
        return;
      }
      const s = this.sensitivity;
      orbit(-(e.clientX - this.x) * s, (e.clientY - this.y) * s, e.pointerType);
      this.x = e.clientX;
      this.y = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.pointer) this.cancel();
    });
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => this.cancel());
    canvas.addEventListener('contextmenu', (e) => {
      if (allowed()) e.preventDefault();
    });
    window.addEventListener('blur', () => this.cancel());
  }

  /** Cancel on menus/free camera, even if the pointer has not moved. */
  update(): void {
    if (!this.allowed()) this.cancel();
  }

  private cancel(): void {
    const id = this.pointer;
    this.pointer = null;
    this.canvas.classList.remove('orbiting');
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
}
