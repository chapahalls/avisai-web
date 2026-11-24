import type { BackendDriver, BackendNewRoute, BackendUserProfile } from '../../services/api/types.js';
import type { Trip } from '../../types/ops.js';

export interface RouteDraft {
  origin: string; originLat: string; originLng: string;
  destination: string; destinationLat: string; destinationLng: string;
  plate: string; invoice: string; cargo: string; tons: string; window: string;
  receiverCompany: string; receiverName: string; receiverPhone: string;
}
export const emptyDraft: RouteDraft = {
  origin: '', originLat: '', originLng: '', destination: '', destinationLat: '', destinationLng: '',
  plate: '', invoice: '', cargo: '', tons: '', window: '', receiverCompany: '', receiverName: '', receiverPhone: '',
};
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

export function routeInput(draft: RouteDraft, driverId: number): BackendNewRoute {
  const required = ['origin', 'destination', 'plate', 'cargo', 'receiverCompany', 'receiverName'] as const;
  if (required.some((key) => !draft[key].trim())) throw new Error('required');
  if (!/^\+[1-9]\d{7,14}$/.test(draft.receiverPhone.trim())) throw new Error('phone');
  const tons = Number(draft.tons.replace(',', '.'));
  if (!Number.isFinite(tons) || tons <= 0) throw new Error('weight');
  if (!Number.isSafeInteger(driverId) || driverId <= 0) throw new Error('driver');
  return {
    origem: { nome: draft.origin.trim(), lat: coordinate(draft.originLat, 90), lng: coordinate(draft.originLng, 180) },
    destino: { nome: draft.destination.trim(), lat: coordinate(draft.destinationLat, 90), lng: coordinate(draft.destinationLng, 180) },
    recebedor: { empresa: draft.receiverCompany.trim(), nome: draft.receiverName.trim(), telefone_e164: draft.receiverPhone.trim() },
    placa: draft.plate.trim().toUpperCase(), nota_fiscal: draft.invoice.trim(), carga_descricao: draft.cargo.trim(),
    carga_t: tons, janela_descarga: draft.window.trim(), empresa_id: 1, motorista_id: driverId,
  };
}
/** Evita atribuições incompatíveis comuns; a validação definitiva continua no servidor. */
export function assignmentIssue(trip: Trip, driver: BackendDriver, trips: Trip[]): 'closed' | 'company' | 'busy' | null {
  if (trip.backend?.status === 'descarregada') return 'closed';
  if (trip.backend?.companyId !== driver.empresa_id) return 'company';
  if (trips.some((other) => other.backendId !== trip.backendId && other.backend?.driverId === driver.id && other.backend.status !== 'descarregada')) return 'busy';
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
  if (!status || status === 'descarregada') return null;
  if (trip.backend?.driverId === null || trip.backend?.driverId === undefined) return 'unassigned';
  if (EDITABLE_STATUSES.has(status)) return 'editable';
  if (AT_RECEIVER_STATUSES.has(status)) return 'atReceiver';
  return 'onRoute';
}

export interface DispatchRow {
  key: string;
  state: DispatchState;
  driver?: RegisteredDriver;
  trip?: Trip;
}

const stateOrder: Record<DispatchState, number> = { onRoute: 0, atReceiver: 1, editable: 2, unassigned: 3, available: 4 };

/** Uma linha por motorista cadastrado (com a viagem ativa, se houver) e uma por rota sem motorista. */
export function dispatchRows(drivers: RegisteredDriver[], trips: Trip[]): DispatchRow[] {
  const apiTrips = trips.filter((trip) => trip.source === 'api' && routeDispatchState(trip) !== null);
  const rows: DispatchRow[] = drivers.map((driver) => {
    const trip = apiTrips.find((item) => item.backend?.driverId === driver.driver.id);
    return { key: `driver-${driver.driver.id}`, driver, trip, state: trip ? routeDispatchState(trip)! : 'available' };
  });
  apiTrips.filter((trip) => routeDispatchState(trip) === 'unassigned').forEach((trip) => {
    rows.push({ key: `route-${trip.id}`, trip, state: 'unassigned' });
  });
  return rows.sort((a, b) => stateOrder[a.state] - stateOrder[b.state]
    || (a.driver?.profile.name ?? '').localeCompare(b.driver?.profile.name ?? '', 'pt-BR'));
}

export type DispatchFilter = 'all' | 'editable' | 'onRoute' | 'atReceiver' | 'available';

export function matchesDispatchFilter(row: DispatchRow, filter: DispatchFilter) {
  if (filter === 'all') return true;
  if (filter === 'editable') return row.state === 'editable' || row.state === 'unassigned';
  return row.state === filter;
}

export function dispatchCounts(rows: DispatchRow[]): Record<DispatchFilter, number> {
  const filters: DispatchFilter[] = ['all', 'editable', 'onRoute', 'atReceiver', 'available'];
  return Object.fromEntries(filters.map((filter) => [filter, rows.filter((row) => matchesDispatchFilter(row, filter)).length])) as Record<DispatchFilter, number>;
}

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
