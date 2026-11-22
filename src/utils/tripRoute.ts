import type { Trip } from '../types/ops.js';
import { getMockRoadRoute } from '../services/mock/routes.js';
import { createRoutePath } from './routePath.js';

const paths = new WeakMap<NonNullable<Trip['routePoints']>, ReturnType<typeof createRoutePath>>();

/** No modo API, geometria e GPS pertencem ao servidor, sem substituição pelos caminhos da demo. */
export function getTripRoute(trip: Trip) {
  if (trip.source !== 'api') return getMockRoadRoute(trip.receiverId);
  if (!trip.routePoints?.length) return createRoutePath([]);
  let path = paths.get(trip.routePoints);
  if (!path) {
    path = createRoutePath(trip.routePoints);
    paths.set(trip.routePoints, path);
  }
  return path;
}
