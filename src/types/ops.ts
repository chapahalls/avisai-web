import type { LatLng } from './geo';

export type TripPhase = 'driving' | 'approaching' | 'waiting' | 'unloaded';

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
}

export interface CallLog {
  id: string;
  tripId: string;
  receiverId: string;
  moment: 'approach' | 'escalation';
  atMin: number;
  answered: boolean;
  result: string;
  transcript: { who: 'agent' | 'receiver'; text: string }[];
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
}
