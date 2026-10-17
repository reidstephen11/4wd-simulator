import type { CrawlCourseDef } from './mapTypes';
import type { StaticBox } from './features';
import type { Terrain } from './terrain';

export function coursePoint(
  course: CrawlCourseDef,
  lateral: number,
  along: number,
): { x: number; z: number } {
  const heading = (course.headingDeg * Math.PI) / 180;
  return {
    x: course.x + Math.cos(heading) * lateral + Math.sin(heading) * along,
    z: course.z - Math.sin(heading) * lateral - Math.cos(heading) * along,
  };
}

/** Shared slab geometry is rendered and collided through the existing world-feature path. */
export function courseObstacles(course: CrawlCourseDef, terrain: Terrain): StaticBox[] {
  const boxes: StaticBox[] = [];
  for (const line of course.lines) {
    for (const obstacle of line.obstacles) {
      const p = coursePoint(course, line.offset + obstacle.lateral, obstacle.at);
      const base = terrain.heightAt(p.x, p.z);
      const buried = 0.35;
      boxes.push({
        kind: 'ledge',
        ...p,
        y: base + (obstacle.height - buried) / 2,
        hx: obstacle.width / 2,
        hy: (obstacle.height + buried) / 2,
        hz: obstacle.length / 2,
        yaw: (-course.headingDeg * Math.PI) / 180,
        roll: ((obstacle.rollDeg ?? 0) * Math.PI) / 180,
      });
    }
  }
  return boxes;
}
