const groups = {
  drive: [
    'frontDiff',
    'rearDiff',
    'centre',
    'transfer',
    'hubs',
    'precision',
    'tyres',
    'pressure',
    'pressure:18',
    'pressure:24',
    'pressure:36',
  ],
  recovery: ['winch', 'detach', 'planks', 'recall', 'recovery', 'snatch', 'dig'],
  service: ['repair', 'refuel', 'lights'],
  cargo: ['unhitch', 'secureLoad', 'loadDrum', 'trailerTyre'],
  navigation: ['toolsBack'],
} as const;
export type ToolGroup = keyof typeof groups;
export const toolGroupLabels: Record<ToolGroup, string> = {
  drive: 'Traction',
  recovery: 'Recovery',
  service: 'Vehicle',
  cargo: 'Trailer',
  navigation: 'Menu',
};
export function toolGroup(id: string): ToolGroup {
  return (
    (Object.keys(groups) as ToolGroup[]).find((g) => (groups[g] as readonly string[]).includes(id)) ?? 'cargo'
  );
}
/** Stable within each family, including context-sensitive cargo actions. */
export function orderTools<T extends { id: string }>(options: T[]): T[] {
  const order: readonly string[] = Object.values(groups).flat();
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...options].sort((a, b) => rank(a.id) - rank(b.id));
}
export const toolShortLabels: Record<string, string> = {
  frontDiff: 'Front diff',
  rearDiff: 'Rear diff',
  precision: 'Crawl',
  pressure: 'Tyres',
  tyres: 'Tyres',
  centre: 'Centre diff',
  transfer: 'Transfer',
  hubs: 'Front hubs',
  recovery: 'Recovery',
  snatch: 'Snatch block',
  dig: 'Shovel',
  toolsBack: 'Back to tools',
  'pressure:18': '18 psi',
  'pressure:24': '24 psi',
  'pressure:36': '36 psi',
  winch: 'Winch',
  detach: 'Winch',
  planks: 'Planks',
  recall: 'Planks',
  repair: 'Repair',
  refuel: 'Refuel',
  lights: 'Lights',
  unhitch: 'Hitch',
  secureLoad: 'Straps',
  loadDrum: 'Load drum',
  trailerTyre: 'Trailer tyre',
};
