import { cameraTuning } from '../data/camera';
import { touchTuning } from '../data/touch';

/**
 * Pointer adapter for the chase camera: drag with the mouse, or with a finger on a touch
 * screen, and pinch with two fingers to zoom. UI overlays (including the touch controls)
 * never start a camera drag.
 */
export class CameraDrag {
  private pointer: number | null = null;
  /** Fingers down on the view, and the gap between the first two while pinching. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchGap = 0;
  private sensitivity: number = cameraTuning.dragSensitivity;
  private x = 0;
  private y = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly allowed: () => boolean,
    orbit: (yaw: number, pitch: number, pointerType: string) => void,
    zoom: (steps: number) => void = () => undefined,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      const touch = e.pointerType === 'touch';
      if (touch && allowed()) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          // A second finger turns the drag into a pinch.
          this.cancel();
          this.pinchGap = this.gap();
          e.preventDefault();
          return;
        }
        if (this.touches.size > 2) return;
      }
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
      const finger = this.touches.get(e.pointerId);
      if (finger) {
        finger.x = e.clientX;
        finger.y = e.clientY;
        if (this.pinchGap > 0) {
          if (!allowed()) return;
          const gap = this.gap();
          // Fingers moving apart bring the camera closer.
          zoom((this.pinchGap - gap) * touchTuning.pinchZoomPerPx);
          this.pinchGap = gap;
          return;
        }
      }
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
    const lift = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinchGap = 0;
    };
    canvas.addEventListener('pointerup', (e) => {
      lift(e);
      if (e.pointerId === this.pointer) this.cancel();
    });
    canvas.addEventListener('pointercancel', (e) => {
      lift(e);
      this.cancel();
    });
    canvas.addEventListener('lostpointercapture', () => this.cancel());
    canvas.addEventListener('contextmenu', (e) => {
      if (allowed()) e.preventDefault();
    });
    window.addEventListener('blur', () => {
      this.touches.clear();
      this.pinchGap = 0;
      this.cancel();
    });
  }

  private gap(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
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
