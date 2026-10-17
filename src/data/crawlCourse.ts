import type { CrawlCourseDef, PropDef } from '../sim/world/mapTypes';
import { coursePoint } from '../sim/world/crawlCourse';

export const campCrawlCourse: CrawlCourseDef = {
  id: 'camp-rock-course',
  name: 'Camp Rock Course',
  x: -120,
  z: 265,
  headingDeg: 0,
  length: 24,
  lines: [
    {
      id: 'warm-up',
      name: 'Warm-up',
      difficulty: 'easy',
      offset: -6,
      hint: 'Low range; precision crawl. Place each front tyre on the low steps.',
      obstacles: [
        { at: 5, lateral: 0, width: 2.6, length: 1.1, height: 0.16 },
        { at: 9, lateral: -0.7, width: 0.9, length: 1.2, height: 0.22 },
        { at: 11, lateral: 0.7, width: 0.9, length: 1.2, height: 0.22 },
        { at: 16, lateral: 0, width: 2.6, length: 1.4, height: 0.25 },
      ],
    },
    {
      id: 'cross-axle',
      name: 'Cross-axle',
      difficulty: 'moderate',
      offset: 0,
      hint: 'Try rear lock first; add front lock when a tyre lifts. Unlock for tight turns.',
      obstacles: [
        { at: 5, lateral: -0.7, width: 0.95, length: 1.5, height: 0.3 },
        { at: 7.3, lateral: 0.7, width: 0.95, length: 1.5, height: 0.32 },
        { at: 11, lateral: -0.7, width: 0.95, length: 1.6, height: 0.33 },
        { at: 13.3, lateral: 0.7, width: 0.95, length: 1.6, height: 0.35 },
        { at: 18, lateral: 0, width: 2.6, length: 1.4, height: 0.3 },
      ],
    },
    {
      id: 'ledge-line',
      name: 'Ledge line',
      difficulty: 'hard',
      offset: 6,
      hint: 'Both locks; crawl square to the ledges. Back up and change line if the belly catches.',
      obstacles: [
        { at: 5, lateral: 0, width: 2.7, length: 1.7, height: 0.36 },
        { at: 10, lateral: 0, width: 2.7, length: 2, height: 0.25, rollDeg: 9 },
        { at: 15, lateral: -0.7, width: 1.05, length: 1.8, height: 0.39 },
        { at: 17.3, lateral: 0.7, width: 1.05, length: 1.8, height: 0.4 },
      ],
    },
  ],
};

export const campCourseSigns: PropDef[] = [
  { kind: 'signpost', x: -143, z: 246, headingDeg: 270, text: 'Rock course →' },
  ...campCrawlCourse.lines.map((line) => {
    const p = coursePoint(campCrawlCourse, line.offset - 2.2, 0);
    return {
      kind: 'signpost' as const,
      ...p,
      headingDeg: 180,
      text: `${line.difficulty.toUpperCase()} · ${line.name}`,
    };
  }),
];
