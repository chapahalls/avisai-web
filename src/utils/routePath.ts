import type { LatLng } from '../types/geo.js';
import { distanceKm, lerp } from './geo.js';

/** Copia a geometria e mede o percurso para converter progresso em distância. */
export function createRoutePath(points: readonly LatLng[]) {
  const routePoints = points.map((point) => ({ ...point }));
  const cumulativeKm: number[] = [];
  let totalKm = 0;
  routePoints.forEach((point, index) => {
    if (index > 0) totalKm += distanceKm(routePoints[index - 1], point);
    cumulativeKm.push(totalKm);
  });
  return { points: routePoints, cumulativeKm, totalKm };
}

/** O progresso mock acompanha a distância da rota, sem depender da densidade de pontos. */
export function interpolateRoute(
  path: ReturnType<typeof createRoutePath>,
  progress: number,
): LatLng | undefined {
  const first = path.points[0];
  if (!first) return undefined;
  const boundedProgress = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  if (boundedProgress === 1) return { ...path.points[path.points.length - 1] };
  if (boundedProgress === 0 || path.totalKm === 0 || path.points.length === 1) return { ...first };

  const targetKm = path.totalKm * boundedProgress;
  let lower = 1;
  let upper = path.points.length - 1;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (path.cumulativeKm[middle] < targetKm) lower = middle + 1;
    else upper = middle;
  }

  const startKm = path.cumulativeKm[lower - 1];
  const segmentKm = path.cumulativeKm[lower] - startKm;
  if (segmentKm === 0) return { ...path.points[lower] };
  return lerp(path.points[lower - 1], path.points[lower], (targetKm - startKm) / segmentKm);
}
