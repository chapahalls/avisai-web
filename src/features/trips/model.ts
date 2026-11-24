import { SIMULATION } from '../../lib/config.js';
import type { EventType } from '../../types/events.js';
import type { CallLog, Trip } from '../../types/ops.js';

/** Tela 06 (motorista e viagem): categorias da linha do tempo e paradas. */

export type TimelineCategory = 'stops' | 'agent' | 'cco' | 'receiver' | 'system';

const CATEGORY: Partial<Record<EventType, TimelineCategory>> = {
  PickupConfirmed: 'stops',
  ArrivalRegistered: 'stops',
  UnloadConfirmed: 'stops',
  OccurrenceCreated: 'stops',
  ApproachDetected: 'agent',
  ReportSubmitted: 'agent',
  ReportFieldMissing: 'agent',
  DocumentQuestionAnswered: 'agent',
  DriverRequestOpened: 'agent',
  DriverRequestReminder: 'agent',
  DriverRequestAnswered: 'agent',
  DriverRequestTimeout: 'agent',
  AgentDecision: 'agent',
  AgentCallNoAnswer: 'agent',
  DriverAlert: 'agent',
  DriverOffline: 'agent',
  TaskCreated: 'cco',
  TaskEscalated: 'cco',
  TaskAcknowledged: 'cco',
  DriverMessageSent: 'cco',
  DriverMessageSpoken: 'cco',
  DriverMessageAnswered: 'cco',
  SupervisorEscalated: 'cco',
  AgoraFallbackStarted: 'cco',
  AgoraFallbackAnswered: 'cco',
  ReceiverNotified: 'receiver',
  ReceiverCallResult: 'receiver',
  TwilioCallFailed: 'receiver',
};

export const eventCategory = (type: EventType): TimelineCategory => CATEGORY[type] ?? 'system';

/** Minuto do dia (0–1440) de um minuto simulado. */
export const minuteOfDay = (simMinute: number) => ((SIMULATION.startHour * 60 + Math.floor(simMinute)) % 1440 + 1440) % 1440;

export interface TripStop {
  key: string;
  kind: 'origin' | 'receiver' | 'occurrence';
  /** Minuto simulado de início, quando conhecido. */
  startMin: number | null;
  durationMin: number | null;
  done: boolean;
}

/** Paradas conhecidas: origem, espera no recebedor e ocorrências relatadas pelo motorista. */
export function tripStops(trip: Trip, simMinutes: number, occurrenceMinutes: number[]): TripStop[] {
  const stops: TripStop[] = [{ key: 'origin', kind: 'origin', startMin: null, durationMin: null, done: trip.phase !== 'driving' || trip.progress > 0 }];
  const arrived = trip.phase === 'waiting' || trip.phase === 'unloaded';
  if (arrived) {
    const wait = trip.source === 'api' ? trip.stay?.waitMin ?? null : trip.arrivedAtMin === undefined ? null : (trip.unloadedAtMin ?? simMinutes) - trip.arrivedAtMin;
    const start = trip.arrivedAtMin ?? (wait === null ? null : simMinutes - wait);
    stops.push({ key: 'receiver', kind: 'receiver', startMin: start, durationMin: wait, done: trip.phase === 'unloaded' });
  }
  occurrenceMinutes.forEach((minute, index) => stops.push({ key: `occurrence-${index}`, kind: 'occurrence', startMin: minute, durationMin: null, done: false }));
  return stops.sort((a, b) => (a.startMin ?? -Infinity) - (b.startMin ?? -Infinity));
}

/** Doca confirmada pelo agente na ligação mais recente, se houver. */
export function confirmedDock(calls: CallLog[], tripId: string) {
  const call = calls.filter((item) => item.tripId === tripId && item.resultCode === 'dock_confirmed').sort((a, b) => b.atMin - a.atMin)[0];
  return call ? { dock: call.dock ?? null, atMin: call.atMin } : null;
}
