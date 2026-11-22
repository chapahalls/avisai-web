/** Contrato de eventos. Igual ao do repositório web (avisai-web/src/types/events.ts). */
export type EventType =
  | 'RouteAssigned'
  | 'PickupConfirmed'
  | 'ReportSubmitted'
  | 'ReportFieldMissing'
  | 'OccurrenceCreated'
  | 'ApproachDetected'
  | 'ReceiverNotified'
  | 'ReceiverCallResult'
  | 'ArrivalRegistered'
  | 'TaskCreated'
  | 'TaskEscalated'
  | 'TaskAcknowledged'
  | 'UnloadConfirmed'
  | 'DocumentQuestionAnswered';

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  idempotencyKey: string;
  tripId: string;
  type: EventType;
  occurredAt: string;
  receivedAt?: string;
  source: 'driver' | 'agent' | 'cco' | 'system';
  payload: T;
}

/** Eventos que saem mesmo com rede fraca. */
export const CRITICAL_EVENTS: EventType[] = [
  'ArrivalRegistered',
  'OccurrenceCreated',
  'UnloadConfirmed',
  'ReceiverCallResult',
];
