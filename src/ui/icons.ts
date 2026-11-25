/** Small inline SVG icons in the ink colour (no image files). */
export const icons = {
  frontDiff: `<svg viewBox="0 0 24 24"><path d="M5 4v16m14-16v16M5 7h14M5 17h14M12 9v6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="4" width="6" height="6" rx="1" fill="currentColor"/></svg>`,
  rearDiff: `<svg viewBox="0 0 24 24"><path d="M5 4v16m14-16v16M5 7h14M5 17h14M12 9v6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="14" width="6" height="6" rx="1" fill="currentColor"/></svg>`,
  crawl: `<svg viewBox="0 0 24 24"><path d="M3 18a9 9 0 1 1 18 0M12 6v2M5 11l2 1m12-1-2 1M12 16l-4-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16" r="2" fill="currentColor"/></svg>`,
  campsite: `<svg viewBox="0 0 24 24"><path d="M2 20 H22 M4.5 20 L12 6.5 L19.5 20 M9.5 3.5 L12 6.5 L14.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11 L8.8 20 H15.2 Z" fill="currentColor"/></svg>`,
  viewpoint: `<svg viewBox="0 0 24 24"><path d="M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  landmark: `<svg viewBox="0 0 24 24"><path d="M12 2 L14.6 9 L22 9.3 L16.2 13.8 L18.2 21 L12 16.8 L5.8 21 L7.8 13.8 L2 9.3 L9.4 9 Z" fill="currentColor"/></svg>`,
  feature: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
  planks: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="5" rx="1" fill="currentColor"/><rect x="3" y="14" width="18" height="5" rx="1" fill="currentColor"/></svg>`,
  engine: `<svg viewBox="0 0 24 24"><path d="M4 9 H7 V7 H13 V9 H16 L18 11 H21 V17 H18 L16 19 H7 L4 16 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 22 Q8 20 10 22 Q12 24 14 22 Q16 20 18 22" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  winch: `<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12 H21 M18 9 L21 12 L18 15" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  detach: `<svg viewBox="0 0 24 24"><circle cx="7" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12 H14 M17 12 H21 M14 8 L18 16" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24"><path d="M14.5 3.5 A5 5 0 0 0 9.8 10.2 L3.5 16.5 A2.1 2.1 0 0 0 7.5 20.5 L13.8 14.2 A5 5 0 0 0 20.5 9.5 L17.2 12.8 L13.6 12.4 L11.6 10.4 L11.2 6.8 Z" fill="currentColor"/></svg>`,
  headlight: `<svg viewBox="0 0 24 24"><path d="M11 5 C5 5 4 9 4 12 C4 15 5 19 11 19 Z" fill="currentColor"/><path d="M14 7 H21 M14 12 H21 M14 17 H21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  fuel: `<svg viewBox="0 0 24 24"><path d="M6 3 H14 L18 7 V21 H6 Z M9 3 V6 H13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12 H15 M12 9 V15" stroke="currentColor" stroke-width="2"/></svg>`,
  tyre: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  plug: `<svg viewBox="0 0 24 24"><path d="M5 19 L15 9 M13 5 L19 11 M15 9 L17 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="5" cy="19" r="1.6" fill="currentColor"/></svg>`,
  trailer: `<svg viewBox="0 0 24 24"><path d="M1.5 15 H6 L8.5 13 M8.5 7 H22 V13 H8.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="15" cy="16.5" r="2.8" fill="currentColor"/></svg>`,
} as const;

export type PoiIcon = 'campsite' | 'viewpoint' | 'landmark' | 'feature';
