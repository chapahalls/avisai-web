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
