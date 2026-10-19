/** Small inline SVG icons in the ink colour (no image files). */
export const icons = {
  campsite: `<svg viewBox="0 0 24 24"><path d="M2 20 H22 M4.5 20 L12 6.5 L19.5 20 M9.5 3.5 L12 6.5 L14.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11 L8.8 20 H15.2 Z" fill="currentColor"/></svg>`,
  viewpoint: `<svg viewBox="0 0 24 24"><path d="M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  landmark: `<svg viewBox="0 0 24 24"><path d="M12 2 L14.6 9 L22 9.3 L16.2 13.8 L18.2 21 L12 16.8 L5.8 21 L7.8 13.8 L2 9.3 L9.4 9 Z" fill="currentColor"/></svg>`,
  feature: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
  planks: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="5" rx="1" fill="currentColor"/><rect x="3" y="14" width="18" height="5" rx="1" fill="currentColor"/></svg>`,
  engine: `<svg viewBox="0 0 24 24"><path d="M4 9 H7 V7 H13 V9 H16 L18 11 H21 V17 H18 L16 19 H7 L4 16 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 22 Q8 20 10 22 Q12 24 14 22 Q16 20 18 22" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  winch: `<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12 H21 M18 9 L21 12 L18 15" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  detach: `<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12 H14 M17 12 H21 M14 8 L18 16" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  headlight: `<svg viewBox="0 0 24 24"><path d="M11 5 C5 5 4 9 4 12 C4 15 5 19 11 19 Z" fill="currentColor"/><path d="M14 7 H21 M14 12 H21 M14 17 H21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
} as const;

export type PoiIcon = 'campsite' | 'viewpoint' | 'landmark' | 'feature';
