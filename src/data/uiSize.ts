/** Settings → UI size: how big the interface is drawn (the scale itself is src/ui/uiScale.ts). */
export type UiSize = 'small' | 'normal' | 'large';

export const uiSizes: readonly UiSize[] = ['small', 'normal', 'large'];
export const defaultUiSize: UiSize = 'normal';
export const uiSizeLabels: Record<UiSize, string> = { small: 'Small', normal: 'Normal', large: 'Large' };

export function isUiSize(v: unknown): v is UiSize {
  return typeof v === 'string' && (uiSizes as readonly string[]).includes(v);
}
