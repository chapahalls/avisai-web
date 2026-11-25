import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOps, useMode, useReceivers } from '../../../services/operations';
import { RECEIVERS as DEMO_RECEIVERS } from '../../../services/mock/data';
import { MOCK_ROAD_ROUTES, getMockRoadRoute } from '../../../services/mock/routes';
import { buildTripDossier } from '../../../services/mock/dossier';
import {
  loadTrackingMaps, onGoogleMapsAuthFailure,
  type GoogleMap, type TrackingMapsLibraries, type GoogleMarker, type GooglePolyline,
} from '../../../lib/googleMaps';
import { getTrackingPosition, splitRoute } from '../../../utils/tracking';
import { getTripRoute } from '../../../utils/tripRoute';
import { SIMULATION } from '../../../lib/config';
import { clock } from '../../../utils/format';
import { TripDossier } from '../../trips';
import { Icon } from '../../../components/Icon';
import type { Trip } from '../../../types/ops';
import type { LatLng } from '../../../types/geo';
import './FleetMap.css';
import { APP_ROUTES } from '../../../lib/routes';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID';
type MapStatus = 'key_missing' | 'loading' | 'ready' | 'map_error';
type FleetFilter = 'all' | 'alerts' | 'waiting' | 'driving';
const filters: FleetFilter[] = ['all', 'driving', 'waiting', 'alerts'];
const cities: Record<string, string> = { r1: 'Campinas', r2: 'Sumaré', r3: 'Americana', r4: 'Valinhos', r5: 'Campinas' };
const phaseColor = { driving: 'var(--color-brand-500)', approaching: 'var(--color-brand-500)', waiting: 'var(--color-wait-500)', unloaded: 'var(--color-ok-500)' } as const;

interface TruckMarker {
  marker: GoogleMarker;
  label: HTMLElement;
  name: HTMLElement;
  glyph: HTMLElement;
  onClick: () => void;
  tripId: string;
  displayed: number;
  from: number;
  target: number;
  started: number;
  rotation: number;
}
interface MapResources {
  api: TrackingMapsLibraries;
  map: GoogleMap;
  trucks: Map<string, TruckMarker>;
  places: GoogleMarker[];
  base: Map<string, GooglePolyline>;
  traveled: GooglePolyline;
  remaining: GooglePolyline;
  listeners: { remove(): void }[];
  dirty: boolean;
  renderedRoute: string;
}

const demoRoutePoints = DEMO_RECEIVERS.flatMap((receiver) => getMockRoadRoute(receiver.id).points);
function fleetPoints(trips: Trip[], receivers: ReturnType<typeof useReceivers>, mode: ReturnType<typeof useMode>) {
  return mode === 'demo' ? demoRoutePoints : [
    ...trips.flatMap((trip) => getTripRoute(trip).points),
    ...trips.map((trip) => trip.origin), ...receivers.map((receiver) => receiver.position),
    ...trips.filter((trip) => trip.positionKnown !== false).map((trip) => trip.position),
  ];
}
function fitRouteBounds(map: GoogleMap, points: readonly LatLng[]) {
  if (!points.length) return;
  map.fitBounds({
    north: Math.max(...points.map((point) => point.lat)), south: Math.min(...points.map((point) => point.lat)),
    east: Math.max(...points.map((point) => point.lng)), west: Math.min(...points.map((point) => point.lng)),
  }, 56);
}

// Arte vetorial própria: o rótulo mantém a orientação; somente o veículo gira na via.
const truckSvg = '<svg viewBox="0 0 24 36" fill="none" aria-hidden="true"><path d="m12 1 5 5H7l5-5Z" fill="currentColor"/><rect x="4" y="10" width="16" height="23" rx="3" fill="currentColor"/><rect x="6" y="7" width="12" height="11" rx="3" fill="currentColor"/><path d="M8 11h8M8 21h8M8 26h8" stroke="var(--color-ink-950)" stroke-width="2"/><path d="M3 13v6M21 13v6M3 28v5M21 28v5" stroke="var(--color-ink-50)" stroke-width="2" stroke-linecap="round"/></svg>';

function RoadMap({ trips, selected, onSelect, following, fitRequest }: {
  trips: Trip[]; selected?: Trip; onSelect: (vehicleId: string) => void; following: boolean; fitRequest: number;
}) {
  const { t, i18n } = useTranslation();
  const allTrips = useOps((state) => state.trips);
  const mode = useMode();
  const receivers = useReceivers();
  const allRoutePoints = fleetPoints(allTrips, receivers, mode);
  const routeSignature = mode === 'api' ? allTrips.map((trip) => `${trip.id}:${JSON.stringify(trip.routePoints)}`).join('|') : 'demo';
  const running = useOps((state) => state.running);
  const container = useRef<HTMLDivElement>(null);
  const resources = useRef<MapResources | undefined>(undefined);
  const latest = useRef({ trips, allTrips, selected, following, running, onSelect, t });
  latest.current = { trips, allTrips, selected, following, running, onSelect, t };
  const initialLanguage = useRef(i18n.resolvedLanguage ?? 'pt-BR');
  const [status, setStatus] = useState<MapStatus>(apiKey ? 'loading' : 'key_missing');
  const [retry, setRetry] = useState(0);

  const updateTrucks = () => {
    const current = resources.current;
    if (!current) return;
    current.dirty = true;
    const now = performance.now();
    const visible = new Set(latest.current.trips.map((trip) => trip.vehicleId));
    for (const trip of latest.current.allTrips) {
      const path = getTripRoute(trip);
      let truck = current.trucks.get(trip.vehicleId);
      if (trip.positionKnown === false) {
        if (truck) {
          truck.marker.removeEventListener('gmp-click', truck.onClick);
          truck.marker.map = null;
          current.trucks.delete(trip.vehicleId);
        }
        continue;
      }
      if (!truck) {
        const label = document.createElement('div');
        label.className = 'tracking-marker';
        const name = document.createElement('span');
        name.className = 'tracking-marker-name';
        const glyph = document.createElement('div');
        glyph.className = 'tracking-marker-glyph';
        glyph.innerHTML = truckSvg;
        label.append(glyph, name);
        const marker = new current.api.AdvancedMarkerElement({
          map: current.map, position: trip.position, title: trip.plate, gmpClickable: true, zIndex: 10,
          anchorLeft: '-50%', anchorTop: '-50%',
        });
        marker.append(label);
        const onClick = () => latest.current.onSelect(trip.vehicleId);
        marker.addEventListener('gmp-click', onClick);
        truck = { marker, label, name, glyph, onClick, tripId: trip.id, displayed: trip.progress, from: trip.progress, target: trip.progress, started: now, rotation: 0 };
        current.trucks.set(trip.vehicleId, truck);
      }
      const sameTrip = truck.tripId === trip.id;
      const parked = trip.phase === 'waiting' || trip.phase === 'unloaded';
      if (truck.target !== trip.progress || !sameTrip) {
        truck.from = sameTrip ? truck.displayed : trip.progress;
        truck.target = trip.progress;
        truck.tripId = trip.id;
        truck.started = now;
      }
      if (trip.source === 'api' || parked || !latest.current.running || !sameTrip) truck.from = truck.displayed = truck.target;
      truck.marker.map = visible.has(trip.vehicleId) ? current.map : null;
      truck.marker.title = latest.current.t('tracking.selectTruck', { plate: trip.plate, phase: latest.current.t(trip.backend ? `api.routeStatus.${trip.backend.status}` : `phase.${trip.phase}`) });
      if (trip.source === 'api') truck.marker.position = trip.position;
      truck.marker.zIndex = latest.current.selected?.vehicleId === trip.vehicleId ? 100 : 10;
      truck.label.dataset.phase = trip.phase;
      truck.label.dataset.selected = String(latest.current.selected?.vehicleId === trip.vehicleId);
      truck.label.dataset.parked = String(parked);
      truck.name.textContent = trip.plate;
      if (parked) {
        const group = latest.current.trips.filter((candidate) => candidate.receiverId === trip.receiverId && (candidate.phase === 'waiting' || candidate.phase === 'unloaded'));
        const index = Math.max(0, group.findIndex((candidate) => candidate.vehicleId === trip.vehicleId));
        // Os rótulos se distribuem; a posição GPS e o centro do veículo não mudam.
        truck.name.style.transform = `translate(${(index % 2 ? 1 : -1) * (group.length > 1 ? 45 : 0)}px, ${-Math.floor(index / 2) * 28}px)`;
      } else truck.name.style.transform = '';
      const heading = getTrackingPosition(path, truck.displayed).heading ?? 0;
      truck.rotation += (((heading - truck.rotation + 540) % 360 + 360) % 360) - 180;
      truck.glyph.style.transform = `rotate(${truck.rotation}deg)`;
    }
    for (const [vehicleId, truck] of current.trucks) {
      if (latest.current.allTrips.some((trip) => trip.vehicleId === vehicleId)) continue;
      truck.marker.removeEventListener('gmp-click', truck.onClick);
      truck.marker.map = null;
      current.trucks.delete(vehicleId);
    }
    current.base.forEach((line, receiverId) => {
      line.setOptions({ strokeOpacity: latest.current.trips.some((trip) => trip.receiverId === receiverId) ? 0.35 : 0.1 });
    });
    if (current.places[0]) {
      current.places[0].title = latest.current.allTrips[0]?.backend?.originName ?? latest.current.t('fleet.origin');
      const label = current.places[0].firstElementChild;
      if (label) label.textContent = current.places[0].title;
    }
  };

  useEffect(() => {
    if (!apiKey || !container.current) return;
    const host = container.current;
    let cancelled = false;
    let authFailed = false;
    let frame = 0;
    let owned: MapResources | undefined;
    let lastFrame = 0;
    let lastFollow = 0;
    let lastFollowPosition = '';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stopListening = onGoogleMapsAuthFailure(() => {
      authFailed = true;
      cancelAnimationFrame(frame);
      if (!cancelled) setStatus('map_error');
    });
    setStatus('loading');
    void loadTrackingMaps(apiKey, initialLanguage.current).then((api) => {
      if (cancelled || authFailed) return;
      const map = new api.Map(host, {
        center: latest.current.allTrips[0]?.origin ?? MOCK_ROAD_ROUTES.r1.snappedOrigin, zoom: 10, mapId, colorScheme: 'DARK',
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        clickableIcons: false, gestureHandling: 'cooperative',
      });
      const styles = getComputedStyle(document.documentElement);
      const brand = styles.getPropertyValue('--color-brand-500').trim();
      const muted = styles.getPropertyValue('--color-ink-300').trim();
      const white = styles.getPropertyValue('--color-ink-50').trim();
      const traveled = new api.Polyline({ map, path: [], strokeColor: white, strokeOpacity: 0.95, strokeWeight: 5, zIndex: 4, clickable: true });
      const remaining = new api.Polyline({ map, path: [], strokeColor: brand, strokeOpacity: 0, strokeWeight: 4, zIndex: 3, clickable: true,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: brand, strokeOpacity: 1, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '15px' }],
      });
      owned = { api, map, trucks: new Map(), places: [], base: new Map(), traveled, remaining, listeners: [], dirty: true, renderedRoute: '' };
      resources.current = owned;
      for (const receiver of receivers) {
        const route = latest.current.allTrips.find((trip) => trip.receiverId === receiver.id);
        const line = new api.Polyline({ map, path: route ? getTripRoute(route).points : [], strokeColor: muted, strokeWeight: 2, strokeOpacity: 0.35, clickable: true, zIndex: 1 });
        owned.base.set(receiver.id, line);
        owned.listeners.push(line.addListener('click', () => {
          const current = latest.current;
          const trip = current.trips.find((candidate) => candidate.receiverId === receiver.id && candidate.vehicleId === current.selected?.vehicleId)
            ?? current.trips.find((candidate) => candidate.receiverId === receiver.id);
          if (trip) current.onSelect(trip.vehicleId);
        }));
      }
      for (const line of [traveled, remaining]) owned.listeners.push(line.addListener('click', () => {
        if (latest.current.selected) latest.current.onSelect(latest.current.selected.vehicleId);
      }));
      const places = [
        { position: latest.current.allTrips[0]?.origin ?? MOCK_ROAD_ROUTES.r1.snappedOrigin, name: latest.current.allTrips[0]?.backend?.originName ?? latest.current.t('fleet.origin'), origin: true },
        ...receivers.map((receiver) => ({ position: receiver.position, name: receiver.name, origin: false })),
      ];
      for (const place of places) {
        const marker = new api.AdvancedMarkerElement({ map, position: place.position, title: place.name, zIndex: 2 });
        const label = document.createElement('div');
        label.className = `tracking-place${place.origin ? ' tracking-place-origin' : ''}`;
        label.textContent = place.name;
        marker.append(label);
        owned.places.push(marker);
      }
      fitRouteBounds(map, allRoutePoints);
      updateTrucks();
      setStatus('ready');
      const draw = (timestamp: number) => {
        if (cancelled || authFailed || resources.current !== owned) return;
        frame = requestAnimationFrame(draw);
        if (timestamp - lastFrame < 33) return;
        lastFrame = timestamp;
        const current = latest.current;
        for (const trip of current.allTrips) {
          const truck = owned!.trucks.get(trip.vehicleId);
          if (!truck) continue;
          const ratio = reducedMotion || !current.running ? 1 : Math.min(1, Math.max(0, (timestamp - truck.started) / 950));
          const progress = truck.from + (truck.target - truck.from) * ratio;
          if (progress === truck.displayed && !owned!.dirty) continue;
          truck.displayed = progress;
          const tracking = getTrackingPosition(getTripRoute(trip), truck.displayed);
          if (trip.source === 'api') {
            if (trip.positionKnown !== false) truck.marker.position = trip.position;
          } else if (tracking.position) truck.marker.position = tracking.position;
          const heading = tracking.heading ?? 0;
          truck.rotation += (((heading - truck.rotation + 540) % 360 + 360) % 360) - 180;
          truck.glyph.style.transform = `rotate(${truck.rotation}deg)`;
        }
        const trip = current.selected;
        if (trip) {
          const truck = owned!.trucks.get(trip.vehicleId);
          const progress = trip.source === 'api' ? trip.progress : truck?.displayed ?? trip.progress;
          const key = `${trip.id}:${progress}`;
          if (key !== owned!.renderedRoute) {
            const path = splitRoute(getTripRoute(trip), progress);
            owned!.traveled.setPath(path.traveled);
            owned!.remaining.setPath(path.remaining);
            owned!.renderedRoute = key;
          }
          const position = trip.source === 'api' ? trip.positionKnown !== false ? trip.position : undefined : getTrackingPosition(getTripRoute(trip), progress).position;
          const positionKey = position ? `${position.lat}:${position.lng}` : '';
          if (current.following && position && positionKey !== lastFollowPosition && timestamp - lastFollow >= 350) {
            map.panTo(position);
            lastFollow = timestamp;
            lastFollowPosition = positionKey;
          }
        } else if (owned!.renderedRoute !== 'none') {
          owned!.traveled.setPath([]);
          owned!.remaining.setPath([]);
          owned!.renderedRoute = 'none';
        }
        owned!.dirty = false;
      };
      frame = requestAnimationFrame(draw);
    }).catch(() => { if (!cancelled) setStatus('map_error'); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stopListening();
      owned?.listeners.forEach((listener) => listener.remove());
      owned?.trucks.forEach((truck) => { truck.marker.removeEventListener('gmp-click', truck.onClick); truck.marker.map = null; });
      owned?.places.forEach((marker) => { marker.map = null; });
      owned?.base.forEach((line) => line.setMap(null));
      owned?.traveled.setMap(null);
      owned?.remaining.setMap(null);
      if (resources.current === owned) resources.current = undefined;
      host.replaceChildren();
    };
  }, [retry, mode, routeSignature]);

  useEffect(() => { updateTrucks(); }, [trips, allTrips, running, selected?.vehicleId, t]);
  useEffect(() => {
    const map = resources.current?.map;
    if (!map || status !== 'ready') return;
    if (following && selected && selected.positionKnown !== false) { map.setZoom(14); map.panTo(selected.position); }
  }, [following, status, selected?.vehicleId]);
  useEffect(() => {
    if (resources.current && status === 'ready') fitRouteBounds(resources.current.map, allRoutePoints);
  }, [fitRequest, status]);
  const covered = status !== 'ready';
  return (
    <div className="tracking-map-stage">
      {covered && <LocalRouteMap trips={trips} selected={selected} onSelect={onSelect} />}
      <div ref={container} className="tracking-google-map" role="region" aria-label={t(mode === 'api' ? 'api.trackingSubtitle' : 'fleet.mapDescription')} inert={covered} aria-hidden={covered} />
      <div className="tracking-map-label"><span className="tracking-live-dot" /><span>{t(mode === 'api' ? 'api.region' : 'tracking.region')}</span><span className="tracking-map-source">{status === 'ready' ? 'Google Maps' : t('tracking.localMap')}</span></div>
      {covered && (
        <div className="tracking-map-notice" role="status">
          <span>{t(status === 'loading' ? 'tracking.loading' : status === 'key_missing' ? 'tracking.keyMissing' : 'tracking.mapUnavailable')}</span>
          {status === 'map_error' && <button type="button" onClick={() => setRetry((value) => value + 1)}>{t('fleet.maps.retry')}</button>}
        </div>
      )}
      <div className="tracking-map-legend"><span><i className="tracking-line-completed" />{t('tracking.traveled')}</span><span><i className="tracking-line-pending" />{t('tracking.remaining')}</span><span className="tracking-simulation-tag">{t(mode === 'api' ? 'api.gps' : 'tracking.mockGps')}</span></div>
    </div>
  );
}

function LocalRouteMap({ trips, selected, onSelect }: { trips: Trip[]; selected?: Trip; onSelect: (vehicleId: string) => void }) {
  const { t } = useTranslation();
  const mode = useMode();
  const receivers = useReceivers();
  const allRoutePoints = fleetPoints(trips, receivers, mode);
  const minLng = Math.min(...allRoutePoints.map((point) => point.lng)) - 0.015;
  const maxLng = Math.max(...allRoutePoints.map((point) => point.lng)) + 0.015;
  const minLat = Math.min(...allRoutePoints.map((point) => point.lat)) - 0.02;
  const maxLat = Math.max(...allRoutePoints.map((point) => point.lat)) + 0.02;
  const xy = (point: LatLng) => ({ x: 60 + (point.lng - minLng) / (maxLng - minLng) * 780, y: 60 + (maxLat - point.lat) / (maxLat - minLat) * 480 });
  const points = (path: readonly LatLng[]) => path.map((point) => { const p = xy(point); return `${p.x},${p.y}`; }).join(' ');
  const path = selected ? splitRoute(getTripRoute(selected), selected.progress) : undefined;
  const selectWithKey = (event: KeyboardEvent<SVGGElement>, vehicleId: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(vehicleId); }
  };
  return (
    <svg className="tracking-local-map" viewBox="0 0 900 600" role="group" aria-label={t(mode === 'api' ? 'api.trackingSubtitle' : 'tracking.localDescription')}>
      <defs><pattern id="local-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="var(--color-ink-700)" strokeWidth="0.5" /></pattern></defs>
      <rect width="900" height="600" fill="var(--color-ink-950)" />
      <rect width="900" height="600" fill="url(#local-map-grid)" opacity="0.45" />
      {receivers.map((receiver) => { const trip = trips.find((item) => item.receiverId === receiver.id); return trip ? <polyline key={receiver.id} points={points(getTripRoute(trip).points)} fill="none" stroke="var(--color-ink-700)" strokeWidth="3" /> : null; })}
      {path && <><polyline points={points(path.remaining)} fill="none" stroke="var(--color-brand-500)" strokeWidth="4" strokeDasharray="8 7" /><polyline points={points(path.traveled)} fill="none" stroke="var(--color-ink-50)" strokeWidth="4" /></>}
      {receivers.map((receiver) => { const p = xy(receiver.position); return <g key={receiver.id}><circle cx={p.x} cy={p.y} r="4" fill="var(--color-ink-300)" /><text x={p.x + 10} y={p.y - 10} fill="var(--color-ink-300)" fontSize="13">{cities[receiver.id] ?? receiver.name}</text></g>; })}
      {trips.filter((trip) => trip.positionKnown !== false).map((trip, index) => {
        const p = xy(trip.position);
        const parked = trip.phase === 'waiting' || trip.phase === 'unloaded';
        const group = trips.filter((item) => item.receiverId === trip.receiverId && (item.phase === 'waiting' || item.phase === 'unloaded'));
        const groupIndex = group.findIndex((item) => item.vehicleId === trip.vehicleId);
        const offsetX = parked && group.length > 1 ? (groupIndex % 2 ? 1 : -1) * 42 : 0;
        const offsetY = parked && group.length > 1 ? -Math.floor(groupIndex / 2) * 50 : 0;
        return <g key={trip.vehicleId} transform={`translate(${p.x} ${p.y})`}>
          {parked && group.length > 1 && <><circle r="3" fill={phaseColor[trip.phase]} /><path d={`M0 0L${offsetX} ${offsetY}`} stroke={phaseColor[trip.phase]} opacity="0.45" /></>}
          <g role="button" tabIndex={0} aria-label={t('tracking.selectTruck', { plate: trip.plate, phase: t(`phase.${trip.phase}`) })} onClick={() => onSelect(trip.vehicleId)} onKeyDown={(event) => selectWithKey(event, trip.vehicleId)} className="tracking-local-truck" transform={`translate(${offsetX} ${offsetY})`}>
            <circle r="23" fill="transparent" /><circle r={selected?.vehicleId === trip.vehicleId ? 15 : 10} fill="var(--color-ink-950)" stroke={phaseColor[trip.phase]} strokeWidth="3" />
            <text textAnchor="middle" dominantBaseline="central" fill="var(--color-ink-50)" fontSize="10" fontWeight="700">{index + 1}</text><text y="-22" textAnchor="middle" fill="var(--color-ink-50)" fontSize="11">{trip.plate}</text>
          </g>
        </g>;
      })}
    </svg>
  );
}

/**
 * `onSelectTrip` ativa o modo embutido (monitoramento): a página controla a
 * seleção e mostra lista/dossiê em painéis próprios, então só o mapa aparece.
 */
export function FleetMap({ tripId, selectedTripId, onSelectTrip }: {
  tripId?: string;
  selectedTripId?: string | null;
  onSelectTrip?: (tripId: string) => void;
} = {}) {
  const embedded = Boolean(onSelectTrip);
  const { t, i18n } = useTranslation();
  const mode = useMode();
  const receivers = useReceivers();
  const activeTrips = useOps((state) => state.trips);
  const tasks = useOps((state) => state.tasks);
  const simMinutes = useOps((state) => state.simMinutes);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(activeTrips.find((trip) => !tripId || trip.id === tripId)?.vehicleId ?? null);
  const [following, setFollowing] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const panelId = useId();
  const panel = useRef<HTMLElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const selectionInitialized = useRef(false);
  const trips = tripId ? activeTrips.filter((trip) => trip.id === tripId) : activeTrips;
  const normalizedQuery = query.toLocaleLowerCase(i18n.resolvedLanguage);
  const visibleTrips = trips.filter((trip) => {
    const receiver = receivers.find((item) => item.id === trip.receiverId)!;
    const driver = trip.source === 'api' ? trip.driver : t('drivers.name', { letter: trip.driver.slice(-1) });
    const invoiceNumbers = trip.source === 'api' ? trip.backend?.invoiceNumber ?? '' : buildTripDossier(trip).invoices.map((invoice) => invoice.number).join(' ');
    const matchesQuery = `${trip.plate} ${driver} ${receiver.name} ${cities[trip.receiverId]} ${invoiceNumbers}`.toLocaleLowerCase(i18n.resolvedLanguage).includes(normalizedQuery);
    const matchesFilter = filter === 'all' || filter === 'driving' && (trip.phase === 'driving' || trip.phase === 'approaching')
      || filter === 'waiting' && trip.phase === 'waiting' || filter === 'alerts' && tasks.some((task) => task.tripId === trip.id && (task.status === 'open' || task.status === 'escalated'));
    return matchesQuery && matchesFilter;
  });
  const selected = embedded ? trips.find((trip) => trip.id === selectedTripId) : visibleTrips.find((trip) => trip.vehicleId === selectedVehicle);
  useEffect(() => {
    if (tripId) setSelectedVehicle(activeTrips.find((trip) => trip.id === tripId)?.vehicleId ?? null);
    else if (!selectionInitialized.current && activeTrips.length) {
      setSelectedVehicle(activeTrips[0].vehicleId);
      selectionInitialized.current = true;
    }
  }, [tripId, activeTrips]);
  useEffect(() => { if (!selected) setFollowing(false); }, [selected?.vehicleId]);
  const selectTruck = (vehicleId: string) => {
    if (onSelectTrip) {
      const trip = trips.find((item) => item.vehicleId === vehicleId);
      if (trip) onSelectTrip(trip.id);
      return;
    }
    setSelectedVehicle(vehicleId);
    if (window.innerWidth < 1200 && !tripId) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }));
  };
  if (!trips.length) return null;
  const distance = selected ? selected.source === 'api' ? selected.distanceRemainingKm : getTripRoute(selected).totalKm * (1 - selected.progress) : null;
  const eta = selected ? selected.source === 'api' ? selected.etaMin : Math.ceil((distance ?? 0) / SIMULATION.speedKmh * 60) : null;
  return (
    <section className={`tracking-workspace${tripId ? ' tracking-workspace-single' : ''}${embedded ? ' tracking-workspace-embedded' : ''}`} aria-label={t('tracking.title')}>
      <div className="tracking-workspace-header">
        <div className="flex min-w-0 items-center gap-3"><Icon name="truck" className="h-5 w-5 text-brand-500" /><div><h2>{t(tripId ? 'fleet.routeTitle' : embedded ? 'monitoring.map.title' : 'tracking.title')}</h2><p>{t(mode === 'api' ? 'api.trackingSubtitle' : 'tracking.subtitle')}</p></div></div>
        <div className="tracking-tools">
          <button type="button" onClick={() => { setFilter('all'); setQuery(''); setFollowing(false); setFitRequest((value) => value + 1); }} className="tracking-tool-button"><span aria-hidden="true">⌖</span>{t('tracking.fitFleet')}</button>
          <button type="button" disabled={!selected || selected.positionKnown === false} aria-pressed={following && !!selected} onClick={() => setFollowing((value) => !value)} className="tracking-tool-button"><span aria-hidden="true">◎</span>{t('tracking.follow')}</button>
        </div>
      </div>
      <div className={`tracking-workspace-body${selected && !tripId && !embedded ? ' has-selection' : ''}`}>
        {!tripId && !embedded && <aside className="tracking-fleet-list" aria-label={t('tracking.fleetList')}>
          <div className="tracking-fleet-heading"><h3>{t('tracking.fleetList')}</h3><span>{t('tracking.vehicleCount', { count: visibleTrips.length })}</span></div>
          <div className="tracking-fleet-search"><label htmlFor="fleet-search" className="sr-only">{t('tracking.search')}</label><span aria-hidden="true">⌕</span><input id="fleet-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('tracking.search')} /></div>
          <div className="tracking-fleet-filters" aria-label={t('tracking.filters')}>{filters.map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{t(`tracking.filter.${item}`)}</button>)}</div>
          <ul className="tracking-vehicles">
            {visibleTrips.map((trip, index) => {
              const receiver = receivers.find((item) => item.id === trip.receiverId)!;
              const remainingKm = trip.routeKm * (1 - trip.progress);
              const task = tasks.find((item) => item.tripId === trip.id && item.status === 'escalated');
              return <li key={trip.vehicleId}><button type="button" ref={(element) => { if (element) rows.current.set(trip.vehicleId, element); else rows.current.delete(trip.vehicleId); }} className="tracking-vehicle-row" data-selected={selected?.vehicleId === trip.vehicleId} aria-pressed={selected?.vehicleId === trip.vehicleId} aria-controls={selected ? panelId : undefined} onClick={() => selectTruck(trip.vehicleId)} style={{ '--truck-color': phaseColor[trip.phase] } as CSSProperties}>
                <span className="tracking-vehicle-top"><span className="tracking-vehicle-number">{index + 1}</span><strong>{trip.plate}</strong><span className={`tracking-phase${task ? ' tracking-phase-alert' : ''}`}>{task ? t('tasks.status.escalated') : t(trip.backend ? `api.routeStatus.${trip.backend.status}` : `phase.${trip.phase}`)}</span></span>
                <span className="tracking-vehicle-destination">{receiver.name}</span><span className="tracking-vehicle-driver">{trip.source === 'api' ? trip.driver : t('drivers.name', { letter: trip.driver.slice(-1) })}{cities[trip.receiverId] ? ` · ${cities[trip.receiverId]}` : ''}</span>
                <span className="tracking-vehicle-bottom"><span className="tracking-progress"><span style={{ width: `${trip.progress * 100}%` }} /></span><span>{trip.source === 'api' ? trip.positionKnown === false ? t('api.noPosition') : trip.etaMin === null || trip.etaMin === undefined ? '—' : t('tracking.eta', { minutes: Math.ceil(trip.etaMin) }) : remainingKm > 0 ? t('tracking.eta', { minutes: Math.ceil(remainingKm / SIMULATION.speedKmh * 60) }) : t('tracking.arrived')}</span></span>
              </button></li>;
            })}
          </ul>
          {!visibleTrips.length && <p className="tracking-no-results">{t('tracking.noResults')}</p>}
          <p className="tracking-list-footer">{t('tracking.fleetHint')}</p>
        </aside>}
        <div className="tracking-map-column">
          <RoadMap trips={visibleTrips} selected={selected} onSelect={selectTruck} following={following && !!selected} fitRequest={fitRequest} />
          {(!embedded || selected) && <div className="tracking-route-strip">
            <div><span>{selected?.plate ?? t('tracking.entireFleet')}</span><strong>{selected?.backend ? `${selected.backend.originName} → ${selected.backend.destinationName}` : selected ? t('tracking.routeDirection', { city: cities[selected.receiverId] }) : t(mode === 'api' ? 'api.region' : 'tracking.region')}</strong></div>
            <div><span>{t('tracking.distanceLeft')}</span><strong>{typeof distance === 'number' ? t('tracking.km', { value: distance.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 }) }) : '—'}</strong></div>
            <div><span>{t(mode === 'api' ? 'api.arrivalEstimate' : 'tracking.arrivalEstimate')}</span><strong>{selected ? selected.phase === 'waiting' || selected.phase === 'unloaded' ? t('tracking.arrived') : typeof eta === 'number' ? clock(simMinutes + eta) : '—' : '—'}</strong></div>
          </div>}
          <p className="tracking-attribution">{mode === 'api' ? <>{t('api.backendRoute')}{selected && !getTripRoute(selected).points.length && ` · ${t('api.noGeometry')}`}{selected?.positionKnown === false && ` · ${t('api.noPosition')}`}{selected?.positionSource && ` · ${t('api.positionSource', { source: t(`api.positionSources.${selected.positionSource}`) })}`}{selected?.lastPositionAt && ` · ${t('api.lastPosition', { time: new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'medium' }).format(new Date(selected.lastPositionAt)) })}`}{selected?.lastPositionAt && Date.now() - new Date(selected.lastPositionAt).getTime() > 120_000 && ` · ${t('api.stalePosition')}`}</> : <>{t('tracking.routeData')} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> / OSRM</>}</p>
        </div>
        {!tripId && !embedded && selected && <aside id={panelId} ref={panel} className="tracking-trip-panel" aria-label={t('tracking.selectedTruck', { plate: selected.plate })}>
          <div className="tracking-trip-panel-top"><span>{t('tracking.selectedVehicle')}</span><button type="button" onClick={() => { const vehicleId = selected.vehicleId; setSelectedVehicle(null); setFollowing(false); requestAnimationFrame(() => rows.current.get(vehicleId)?.focus()); }} aria-label={t('tracking.closeDetails')}>×</button></div>
          <div className="tracking-trip-panel-identity"><div><h3 aria-live="polite" aria-atomic="true">{selected.plate}</h3><p>{selected.source === 'api' ? selected.driver : t('drivers.name', { letter: selected.driver.slice(-1) })}</p></div><span className="tracking-phase" style={{ color: phaseColor[selected.phase] }}>{t(selected.backend ? `api.routeStatus.${selected.backend.status}` : `phase.${selected.phase}`)}</span></div>
          <TripDossier key={selected.id} tripId={selected.id} compact showCommercialValues={false} />
          <Link className="tracking-open-trip" to={APP_ROUTES.trip(selected.id)}>{t('tracking.fullTrip')}<span aria-hidden="true">↗</span></Link>
        </aside>}
      </div>
    </section>
  );
}
