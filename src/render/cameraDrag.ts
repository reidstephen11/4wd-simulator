import { cameraTuning } from '../data/camera';

/** Pointer adapter for the chase camera. UI overlays never start a camera drag. */
export class CameraDrag {
  private pointer: number | null = null;
  private x = 0;
  private y = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly allowed: () => boolean,
    orbit: (yaw: number, pitch: number) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!allowed() || !e.isPrimary || e.pointerType === 'touch' || (e.button !== 0 && e.button !== 2))
        return;
      if (this.pointer !== null) return;
      this.pointer = e.pointerId;
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
      const s = cameraTuning.dragSensitivity;
      orbit(-(e.clientX - this.x) * s, (e.clientY - this.y) * s);
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
