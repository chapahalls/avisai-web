import type { LatLng } from '../types/geo.js';
import { createRoutePath } from '../utils/routePath.js';

// Subconjunto usado do SDK: mantém TypeScript strict sem adicionar um wrapper.
export interface GoogleMap {
  fitBounds(bounds: { north: number; south: number; east: number; west: number }, padding?: number): void;
  panTo(position: LatLng): void;
  setZoom(zoom: number): void;
}

export interface PolylineOptions {
  path?: LatLng[];
  map?: GoogleMap | null;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  clickable?: boolean;
  zIndex?: number;
  icons?: {
    icon: { path: string; strokeColor?: string; strokeOpacity: number; strokeWeight?: number; scale: number };
    offset: string;
    repeat: string;
  }[];
}

export interface GooglePolyline {
  setMap(map: GoogleMap | null): void;
  setOptions(options: PolylineOptions): void;
  setPath(path: LatLng[]): void;
  addListener(event: 'click', callback: () => void): { remove(): void };
}

export interface GoogleMarker extends HTMLElement {
  map: GoogleMap | null;
  position: LatLng;
  gmpClickable: boolean;
  zIndex: number;
}

interface GoogleRoute {
  path?: LatLng[];
  createPolylines(): GooglePolyline[];
}

interface MapsLibrary {
  Polyline: new (options: PolylineOptions) => GooglePolyline;
  Map: new (container: HTMLElement, options: {
    center: LatLng;
    zoom: number;
    mapId: string;
    colorScheme: 'DARK' | 'LIGHT';
    mapTypeControl: boolean;
    streetViewControl: boolean;
    fullscreenControl: boolean;
    clickableIcons: boolean;
    gestureHandling: 'cooperative';
  }) => GoogleMap;
}

interface MarkerLibrary {
  AdvancedMarkerElement: new (options: {
    map: GoogleMap;
    position: LatLng;
    title: string;
    gmpClickable?: boolean;
    zIndex?: number;
    anchorLeft?: string;
    anchorTop?: string;
  }) => GoogleMarker;
}

interface RoutesLibrary {
  Route: {
    computeRoutes(request: {
      origin: LatLng;
      destination: LatLng;
      travelMode: 'DRIVING';
      routingPreference: 'TRAFFIC_UNAWARE';
      fields: ['path'];
    }): Promise<{ routes?: GoogleRoute[] }>;
  };
}

interface MapsSdk {
  importLibrary(name: 'maps'): Promise<MapsLibrary>;
  importLibrary(name: 'marker'): Promise<MarkerLibrary>;
  importLibrary(name: 'routes'): Promise<RoutesLibrary>;
}

type MapsWindow = Window & {
  google?: { maps: MapsSdk };
  __avisaiMapsReady?: () => void;
  gm_authFailure?: () => void;
};

export type TrackingMapsLibraries = MapsLibrary & MarkerLibrary;
export type GoogleMapsLibraries = TrackingMapsLibraries & RoutesLibrary;
let sdkPromise: Promise<MapsSdk> | undefined;
const authListeners = new Set<() => void>();

export function onGoogleMapsAuthFailure(listener: () => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

/** Uma carga por página, inclusive durante a montagem dupla do StrictMode. */
function loadSdk(key: string, language: string): Promise<MapsSdk> {
  if (sdkPromise) return sdkPromise;
  const target = window as MapsWindow;
  if (target.google?.maps.importLibrary) return Promise.resolve(target.google.maps);

  sdkPromise = new Promise<MapsSdk>((resolve, reject) => {
    const script = document.createElement('script');
    // biome-ignore lint/style/useConst: o timer é criado depois de fail(), que precisa enxergá-lo
    let timeout: ReturnType<typeof setTimeout>;
    const previousAuthFailure = target.gm_authFailure;
    const fail = () => {
      clearTimeout(timeout);
      delete target.__avisaiMapsReady;
      script.remove();
      sdkPromise = undefined;
      reject(new Error('google_maps_load_failed'));
    };
    target.gm_authFailure = () => {
      previousAuthFailure?.();
      authListeners.forEach((listener) => listener());
      fail();
    };
    target.__avisaiMapsReady = () => {
      clearTimeout(timeout);
      delete target.__avisaiMapsReady;
      if (target.google?.maps.importLibrary) resolve(target.google.maps);
      else fail();
    };
    const parameters = new URLSearchParams({
      key, v: 'quarterly', loading: 'async', callback: '__avisaiMapsReady',
      language: language.startsWith('en') ? 'en' : 'pt-BR', region: 'BR',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
    script.async = true;
    script.onerror = fail;
    timeout = setTimeout(fail, 20_000);
    document.head.append(script);
  });
  return sdkPromise;
}

export async function loadGoogleMaps(key: string, language: string): Promise<GoogleMapsLibraries> {
  if (!key.trim()) throw new Error('google_maps_key_missing');
  const sdk = await loadSdk(key.trim(), language);
  const [maps, markers, routes] = await Promise.all([
    sdk.importLibrary('maps'), sdk.importLibrary('marker'), sdk.importLibrary('routes'),
  ]);
  return { ...maps, ...markers, ...routes };
}

/** O CCO desenha as geometrias locais; não depende da permissão da Routes API. */
export async function loadTrackingMaps(key: string, language: string): Promise<TrackingMapsLibraries> {
  if (!key.trim()) throw new Error('google_maps_key_missing');
  const sdk = await loadSdk(key.trim(), language);
  const [maps, markers] = await Promise.all([sdk.importLibrary('maps'), sdk.importLibrary('marker')]);
  return { ...maps, ...markers };
}

export interface RoadRoute {
  geometry: ReturnType<typeof createRoutePath>;
  createPolylines: () => GooglePolyline[];
}

const routeCache = new Map<string, Promise<RoadRoute>>();

/** A consulta depende da geometria, nunca do relógio, da fase ou do ID da viagem. */
export function getRoadRoute(api: GoogleMapsLibraries, origin: LatLng, destination: LatLng): Promise<RoadRoute> {
  const key = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
  const cached = routeCache.get(key);
  if (cached) return cached;
  const pending = api.Route.computeRoutes({
    origin, destination, travelMode: 'DRIVING', routingPreference: 'TRAFFIC_UNAWARE', fields: ['path'],
  }).then(({ routes }) => {
    const route = routes?.[0];
    if (!route?.path || route.path.length < 2) throw new Error('google_maps_route_missing');
    return {
      geometry: createRoutePath(route.path.map(({ lat, lng }) => ({ lat, lng }))),
      createPolylines: () => route.createPolylines(),
    };
  }).catch((error: unknown) => {
    routeCache.delete(key);
    if (error instanceof Error) {
      const message = error.message.replace(/AIza[\w-]+/g, '[redacted]').replace(/([?&]key=)[^&\s"']+/g, '$1[redacted]');
      console.warn('RODAR: Google Maps route request failed:', message);
    }
    throw error;
  });
  routeCache.set(key, pending);
  return pending;
}
