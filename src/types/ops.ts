import type { LatLng } from './geo.js';

export type TripPhase = 'driving' | 'approaching' | 'waiting' | 'unloaded' | 'cancelled';

/** Viagem encerrada: descarregada ou cancelada pela central. Não entra em frota ativa, fila ou atribuição. */
export const isTripClosed = (phase: TripPhase) => phase === 'unloaded' || phase === 'cancelled';

export interface Receiver {
  id: string;
  name: string;
  position: LatLng;
  /** Perfil mock: espera média típica, em minutos. */
  typicalWaitMin: number;
  /** Chance de atender a ligação do agente. */
  answerRate: number;
}

export interface Trip {
  id: string;
  vehicleId: string;
  plate: string;
  driver: string;
  receiverId: string;
  origin: LatLng;
  capacityTons: number;
  progress: number;
  routeKm: number;
  phase: TripPhase;
  position: LatLng;
  notifiedBeforeArrival: boolean;
  arrivedAtMin?: number;
  /** Quando a descarga vai acontecer (mock), em minutos simulados. */
  unloadAtMin?: number;
  unloadedAtMin?: number;
  /** Campos de leitura do backend; o motor local não os produz. */
  source?: 'api' | 'mock';
  backendId?: number;
  positionKnown?: boolean;
  positionSource?: 'celular' | 'rastreador';
  lastPositionAt?: string | null;
  etaMin?: number | null;
  distanceRemainingKm?: number | null;
  routePoints?: LatLng[];
  backend?: {
    invoiceNumber: string;
    cargoDescription: string;
    cargoTons: number;
    originName: string;
    destinationName: string;
    arrivalWindow: string;
    receiverContact: string;
    status: string;
    driverId: number | null;
    companyId: number;
    /** Presente quando o backend cancelou a viagem; valores como recebidos. */
    cancellation?: { at: string | null; by: string | null; reason: string | null };
  };
  stay?: { waitMin: number; valueBRL: number; franchiseHours: number; capacityTons: number };
}

export interface TripMetadata {
  plate: string;
  driver: string;
  receiverId: string;
}

export type TaskStatus = 'open' | 'acknowledged' | 'escalated' | 'closed';

export interface Task {
  id: string;
  tripId: string;
  createdAtMin: number;
  attempts: number;
  status: TaskStatus;
  acknowledgedAtMin?: number;
  closedAtMin?: number;
  /** Preserva a escalada mesmo se o operador assumir depois. */
  escalatedAtMin?: number;
}

export type CallResult = 'dock_confirmed' | 'next_day' | 'no_answer' | 'answered' | 'in_progress' | 'failed';

export interface TranscriptLine {
  who: 'agent' | 'receiver';
  text: string;
  messageKey?: string;
  values?: Record<string, string | number>;
}

export interface CallLog {
  id: string;
  tripId: string;
  receiverId: string;
  plate: string;
  moment: 'approach' | 'escalation';
  atMin: number;
  answered: boolean;
  result: string;
  resultCode: CallResult;
  dock?: number | string;
  transcript: TranscriptLine[];
  occurredAt?: string;
  status?: string;
  source?: 'api' | 'mock';
}

/** Entrega concluída (histórico usado nas métricas). */
export interface Delivery {
  tripId: string;
  receiverId: string;
  day: number;
  waitMin: number;
  capacityTons: number;
  notifiedBeforeArrival: boolean;
  callAnswered: boolean;
  ccoActionMin: number | null;
  escalated: boolean;
  reportCompleteFirst: boolean;
  stayCharged: boolean;
  contactsAvoided: number;
  voiceLatencyMs: number;
  /** Identificação e horário de chegada (minuto do dia) para as tabelas de Análises. */
  plate?: string;
  driver?: string;
  arrivalMinuteOfDay?: number;
}
