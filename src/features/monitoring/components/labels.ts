import type { TFunction } from 'i18next';
import type { Trip } from '../../../types/ops';

/** Nome do motorista: API traz o nome real; a Demo usa rótulo neutro. */
export const driverName = (trip: Trip, t: TFunction) =>
  trip.source === 'api' ? trip.driver : t('drivers.name', { letter: trip.driver.slice(-1) });

/** Status da viagem: no modo API preserva o status recebido do backend. */
export const statusLabel = (trip: Trip, t: TFunction) =>
  t(trip.backend ? `api.routeStatus.${trip.backend.status}` : `phase.${trip.phase}`);

export type Tone = 'ok' | 'wait' | 'alert' | 'info' | 'muted';

export const phaseTone: Record<Trip['phase'], Tone> = {
  driving: 'ok',
  approaching: 'info',
  waiting: 'wait',
  unloaded: 'muted',
  cancelled: 'muted',
};
