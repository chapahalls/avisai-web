import type { BackendDriver, BackendNewRoute, BackendNewRoutePoint, BackendUserProfile } from '../../services/api/types.js';
import type { DemoDriver } from '../../services/mock/registry.js';
import { isTripClosed, type Trip } from '../../types/ops.js';

/** Coordenada sem fonte ainda não foi localizada; geocodificação exige o lugar escolhido no provedor. */
export type CoordinateSource = '' | 'geocodificacao' | 'manual';
export type StopSide = 'origin' | 'destination';

export interface RouteDraft {
  origin: string; originAddress: string; originLat: string; originLng: string;
  originSource: CoordinateSource; originGeoProvider: string; originGeoId: string; originGeoLabel: string;
  destination: string; destinationAddress: string; destinationLat: string; destinationLng: string;
  destinationSource: CoordinateSource; destinationGeoProvider: string; destinationGeoId: string; destinationGeoLabel: string;
  plate: string; invoice: string; cargo: string; tons: string; window: string;
  receiverCompany: string; receiverName: string; receiverPhone: string;
}
const emptyStop = (side: StopSide) => ({
  [side]: '', [`${side}Address`]: '', [`${side}Lat`]: '', [`${side}Lng`]: '', [`${side}Source`]: '',
  [`${side}GeoProvider`]: '', [`${side}GeoId`]: '', [`${side}GeoLabel`]: '',
});
export const emptyDraft: RouteDraft = {
  ...emptyStop('origin'), ...emptyStop('destination'),
  plate: '', invoice: '', cargo: '', tons: '', window: '', receiverCompany: '', receiverName: '', receiverPhone: '',
} as RouteDraft;

/** Campos de um lado da rota, para o componente de busca não conhecer as chaves do rascunho. */
export const stopKeys = (side: StopSide) => ({
  name: side, address: `${side}Address`, lat: `${side}Lat`, lng: `${side}Lng`, source: `${side}Source`,
  provider: `${side}GeoProvider`, placeId: `${side}GeoId`, label: `${side}GeoLabel`,
} as const satisfies Record<string, keyof RouteDraft>);

/** Resultado escolhido na busca: grava coordenada e vínculo juntos. */
export function linkGeocodeResult(side: StopSide, provider: string, result: { id: string; endereco: string; lat: number; lng: number }): Partial<RouteDraft> {
  const k = stopKeys(side);
  return { [k.lat]: String(result.lat), [k.lng]: String(result.lng), [k.source]: 'geocodificacao',
    [k.provider]: provider, [k.placeId]: result.id, [k.label]: result.endereco };
}

/** Mudar o endereço desfaz o vínculo: a coordenada antiga não corresponde mais ao texto. */
export function changeStopAddress(draft: RouteDraft, side: StopSide, address: string): Partial<RouteDraft> {
  const k = stopKeys(side);
  if (draft[k.source] !== 'geocodificacao') return { [k.address]: address };
  return { [k.address]: address, [k.lat]: '', [k.lng]: '', [k.source]: '', [k.provider]: '', [k.placeId]: '', [k.label]: '' };
}

/** Rascunho salvo antes da geocodificação: coordenadas preenchidas contam como digitadas. */
export function restoreDraft(saved: Partial<RouteDraft>): RouteDraft {
  const draft = { ...emptyDraft, ...saved };
  for (const side of ['origin', 'destination'] as const) {
    const k = stopKeys(side);
    if (!saved[k.source] && draft[k.lat].trim() && draft[k.lng].trim()) draft[k.source] = 'manual';
    if (!(['', 'geocodificacao', 'manual'] as string[]).includes(draft[k.source])) draft[k.source] = '';
  }
  return draft;
}
const coordinate = (value: string, limit: number) => {
  if (!value.trim()) throw new Error('coordinates');
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number) || Math.abs(number) > limit) throw new Error('coordinates');
  return number;
};
export interface RegisteredDriver {
  profile: BackendUserProfile;
  driver: BackendDriver;
}

/** Perfis persistidos são a fonte de elegibilidade; motoristas soltos não entram no CCO. */
export function registeredDrivers(profiles: BackendUserProfile[], drivers: BackendDriver[]): RegisteredDriver[] {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const seenDriverIds = new Set<number>();
  const result: RegisteredDriver[] = [];
  for (const profile of profiles) {
    if (profile.role !== 'driver' || profile.driverId === null || seenDriverIds.has(profile.driverId)) continue;
    const driver = driversById.get(profile.driverId);
    if (!driver) continue;
    seenDriverIds.add(driver.id);
    result.push({ profile, driver });
  }
  return result.sort((left, right) => left.profile.name.localeCompare(right.profile.name, 'pt-BR')
    || left.profile.email.localeCompare(right.profile.email, 'pt-BR'));
}

/** Demo: o cadastro local ganha a mesma forma do par perfil + motorista da API. */
export function demoRegisteredDrivers(drivers: DemoDriver[]): RegisteredDriver[] {
  return drivers.map((driver) => ({
    profile: { id: `demo-driver-${driver.id}`, email: driver.email, role: 'driver' as const, name: driver.name, driverId: driver.id, tripId: null },
    driver: { id: driver.id, empresa_id: driver.companyId, nome: driver.name, telefone_e164: driver.phone, email: driver.email },
  }));
}

/** Todo ponto sai com latitude e longitude; geocodificado, também com o lugar escolhido no provedor. */
function stopInput(draft: RouteDraft, side: StopSide): BackendNewRoutePoint {
  const k = stopKeys(side);
  const source = draft[k.source];
  if (source === '') throw new Error('location');
  if (source === 'geocodificacao' && (!draft[k.provider].trim() || !draft[k.placeId].trim())) throw new Error('location');
  const address = draft[k.address].trim();
  return {
    nome: draft[k.name].trim(), lat: coordinate(draft[k.lat], 90), lng: coordinate(draft[k.lng], 180),
    ...(address ? { endereco: address } : {}),
    geo: source === 'manual' ? { fonte: 'manual' }
      : { fonte: 'geocodificacao', provedor: draft[k.provider].trim(), id: draft[k.placeId].trim(),
        ...(draft[k.label].trim() ? { endereco: draft[k.label].trim() } : {}) },
  };
}

export function routeInput(draft: RouteDraft, driverId: number): BackendNewRoute {
  const required = ['origin', 'destination', 'plate', 'cargo', 'receiverCompany', 'receiverName'] as const;
  if (required.some((key) => !draft[key].trim())) throw new Error('required');
  if (!/^\+[1-9]\d{7,14}$/.test(draft.receiverPhone.trim())) throw new Error('phone');
  const tons = Number(draft.tons.replace(',', '.'));
  if (!Number.isFinite(tons) || tons <= 0) throw new Error('weight');
  if (!Number.isSafeInteger(driverId) || driverId <= 0) throw new Error('driver');
  const origem = stopInput(draft, 'origin');
  const destino = stopInput(draft, 'destination');
  return {
    origem, destino,
    recebedor: { empresa: draft.receiverCompany.trim(), nome: draft.receiverName.trim(), telefone_e164: draft.receiverPhone.trim() },
    placa: draft.plate.trim().toUpperCase(), nota_fiscal: draft.invoice.trim(), carga_descricao: draft.cargo.trim(),
    carga_t: tons, janela_descarga: draft.window.trim(), empresa_id: 1, motorista_id: driverId,
  };
}
/** Mesmo critério do backend: no destino a estadia já corre e a viagem termina pela descarga. */
const CANCELLABLE_STATUSES = new Set(['publicada', 'planejada', 'na_origem', 'em_transito', 'aproximando']);
export const canCancelTrip = (trip: Trip) => trip.source === 'api' && CANCELLABLE_STATUSES.has(trip.backend?.status ?? '');
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

/** Viagens encerradas no backend: não aparecem no despacho nem aceitam atribuição. */
const CLOSED_STATUSES = new Set(['descarregada', 'cancelada']);

/** Evita atribuições incompatíveis comuns; a validação definitiva continua no servidor. */
export function assignmentIssue(trip: Trip, driver: BackendDriver, trips: Trip[]): 'closed' | 'company' | 'busy' | null {
  if (trip.backend?.status && CLOSED_STATUSES.has(trip.backend.status)) return 'closed';
  if (trip.backend?.companyId !== driver.empresa_id) return 'company';
  if (trips.some((other) => other.backendId !== trip.backendId && other.backend?.driverId === driver.id && !CLOSED_STATUSES.has(other.backend.status))) return 'busy';
  return null;
}

/* ---------------------------------------------------------------- lista (mockup 03) */

/** Estado da linha na lista de motoristas e viagens. */
export type DispatchState = 'editable' | 'onRoute' | 'atReceiver' | 'unassigned' | 'available';

/** A rota só pode ser editada enquanto o motorista não saiu. */
const EDITABLE_STATUSES = new Set(['publicada', 'planejada', 'na_origem']);
const AT_RECEIVER_STATUSES = new Set(['no_destino']);

export function routeDispatchState(trip: Trip): Exclude<DispatchState, 'available'> | null {
  const status = trip.backend?.status;
  if (!status || CLOSED_STATUSES.has(status)) return null;
  if (trip.backend?.driverId === null || trip.backend?.driverId === undefined) return 'unassigned';
  if (EDITABLE_STATUSES.has(status)) return 'editable';
  if (AT_RECEIVER_STATUSES.has(status)) return 'atReceiver';
  return 'onRoute';
}

/** Status de rota exibido e filtrável: o da API ou, na Demo, a fase simulada traduzida para o mesmo vocabulário. */
export type RouteStatusKey = 'publicada' | 'planejada' | 'na_origem' | 'em_transito' | 'aproximando' | 'no_destino';
export type RowStatus = RouteStatusKey | 'available';
export const API_ROUTE_STATUSES: RouteStatusKey[] = ['publicada', 'planejada', 'na_origem', 'em_transito', 'aproximando', 'no_destino'];
const DEMO_PHASE_STATUS: Record<Trip['phase'], RouteStatusKey | null> = { driving: 'em_transito', approaching: 'aproximando', waiting: 'no_destino', unloaded: null, cancelled: null };

export interface DispatchRow {
  key: string;
  state: DispatchState;
  status: RowStatus;
  driver?: RegisteredDriver;
  trip?: Trip;
}

const stateOrder: Record<DispatchState, number> = { onRoute: 0, atReceiver: 1, editable: 2, unassigned: 3, available: 4 };

const apiStatus = (trip: Trip): RowStatus => (API_ROUTE_STATUSES as string[]).includes(trip.backend?.status ?? '') ? trip.backend!.status as RouteStatusKey : 'available';

/** Uma linha por motorista cadastrado (com a viagem ativa, se houver) e uma por rota sem motorista. */
export function dispatchRows(drivers: RegisteredDriver[], trips: Trip[]): DispatchRow[] {
  const apiTrips = trips.filter((trip) => trip.source === 'api' && routeDispatchState(trip) !== null);
  const rows: DispatchRow[] = drivers.map((driver) => {
    const trip = apiTrips.find((item) => item.backend?.driverId === driver.driver.id);
    return { key: `driver-${driver.driver.id}`, driver, trip, state: trip ? routeDispatchState(trip)! : 'available', status: trip ? apiStatus(trip) : 'available' };
  });
  apiTrips.filter((trip) => routeDispatchState(trip) === 'unassigned').forEach((trip) => {
    rows.push({ key: `route-${trip.id}`, trip, state: 'unassigned', status: apiStatus(trip) });
  });
  return rows.sort((a, b) => stateOrder[a.state] - stateOrder[b.state]
    || (a.driver?.profile.name ?? '').localeCompare(b.driver?.profile.name ?? '', 'pt-BR'));
}

/** Demo: a viagem simulada do motorista (pelo nome) define a situação; descarregada = disponível. */
export function demoDispatchRows(drivers: RegisteredDriver[], trips: Trip[]): DispatchRow[] {
  const rows: DispatchRow[] = drivers.map((driver) => {
    const trip = trips.find((item) => item.source !== 'api' && item.driver === driver.profile.name && !isTripClosed(item.phase));
    const state: DispatchState = !trip ? 'available' : trip.phase === 'waiting' ? 'atReceiver' : 'onRoute';
    return { key: `driver-${driver.driver.id}`, driver, trip, state, status: trip ? DEMO_PHASE_STATUS[trip.phase] ?? 'available' : 'available' };
  });
  return rows.sort((a, b) => stateOrder[a.state] - stateOrder[b.state]
    || (a.driver?.profile.name ?? '').localeCompare(b.driver?.profile.name ?? '', 'pt-BR'));
}

/** Cards de filtro, iguais na Demo e na API: todos, rota editável, um por status de rota e disponível. */
export type DispatchFilter = 'all' | 'editable' | RowStatus;
export const DISPATCH_FILTERS: DispatchFilter[] = ['all', 'editable', ...API_ROUTE_STATUSES, 'available'];

export function matchesDispatchFilter(row: DispatchRow, filter: DispatchFilter) {
  if (filter === 'all') return true;
  if (filter === 'editable') return row.state === 'editable' || row.state === 'unassigned';
  return row.status === filter;
}

export function dispatchCounts(rows: DispatchRow[], filters: DispatchFilter[]): Partial<Record<DispatchFilter, number>> {
  return Object.fromEntries(filters.map((filter) => [filter, rows.filter((row) => matchesDispatchFilter(row, filter)).length]));
}

export const DISPATCH_PAGE_SIZE = 15;

/* -------------------------------------------------------------- cadastro (mockup 04) */

/** Tipos e tamanho aceitos pelo backend de arquivos da viagem. */
export const ROUTE_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const ROUTE_FILE_MAX_BYTES = 10 * 1024 * 1024;

export function routeFileIssue(file: { size: number; type: string }): 'emptyFile' | 'tooLarge' | 'type' | null {
  if (file.size === 0) return 'emptyFile';
  if (file.size > ROUTE_FILE_MAX_BYTES) return 'tooLarge';
  if (!(ROUTE_FILE_TYPES as readonly string[]).includes(file.type)) return 'type';
  return null;
}

/** Etapas prontas para publicar (mesma validação de `routeInput`, sem lançar). */
export function draftProgress(draft: RouteDraft, driverId: number | null) {
  const tons = Number(draft.tons.replace(',', '.'));
  const vehicle = Boolean(draft.plate.trim()) && Number.isFinite(tons) && tons > 0;
  let route = true;
  try { routeInput(draft, driverId ?? 1); } catch { route = false; }
  return { driver: driverId !== null && vehicle, route, ready: driverId !== null && route };
}

/** Pior caso de ligações ao recebedor: cada entrega × tentativas do AI. */
export const worstCaseReceiverCalls = (deliveries: number, attempts: number) => Math.max(0, deliveries) * Math.max(0, attempts);
