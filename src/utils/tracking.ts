import type { LatLng } from '../types/geo.js';
import { interpolateRoute, type createRoutePath } from './routePath.js';

type RoutePath = ReturnType<typeof createRoutePath>;
const clampProgress = (progress: number) => Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
const copy = (point: LatLng) => ({ ...point });

/** Divide as duas linhas no mesmo ponto da rota, sem trocar a geometria original. */
export function splitRoute(path: RoutePath, progress: number): {
  traveled: LatLng[];
  remaining: LatLng[];
  position: LatLng | undefined;
} {
  const boundedProgress = clampProgress(progress);
  const position = interpolateRoute(path, boundedProgress);
  if (!position) return { traveled: [], remaining: [], position: undefined };
  if (boundedProgress === 1) return { traveled: path.points.map(copy), remaining: [copy(position)], position };
  if (boundedProgress === 0 || path.totalKm === 0) return { traveled: [copy(position)], remaining: path.points.map(copy), position };
  const targetKm = path.totalKm * boundedProgress;
  return {
    traveled: [...path.points.filter((_, index) => path.cumulativeKm[index] < targetKm).map(copy), copy(position)],
    remaining: [copy(position), ...path.points.filter((_, index) => path.cumulativeKm[index] > targetKm).map(copy)],
    position,
  };
}

/** Direção do segmento ativo em graus: norte = 0, leste = 90, intervalo [0, 360). */
export function getRouteHeading(path: RoutePath, progress: number): number | undefined {
  if (path.points.length < 2 || path.totalKm === 0) return undefined;
  const targetKm = path.totalKm * clampProgress(progress);
  let endIndex = path.cumulativeKm.findIndex((distance) => distance > targetKm);
  if (endIndex < 1) {
    endIndex = path.points.length - 1;
    while (endIndex > 0 && path.cumulativeKm[endIndex] === path.cumulativeKm[endIndex - 1]) endIndex -= 1;
  }
  if (endIndex < 1) return undefined;
  const from = path.points[endIndex - 1];
  const to = path.points[endIndex];
  const fromLat = from.lat * Math.PI / 180;
  const toLat = to.lat * Math.PI / 180;
  const deltaLng = (to.lng - from.lng) * Math.PI / 180;
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Stateless: uma nova viagem começa no novo caminho, sem herdar progresso ou heading. */
export function getTrackingPosition(path: RoutePath, progress: number) {
  return { position: interpolateRoute(path, clampProgress(progress)), heading: getRouteHeading(path, progress) };
}
