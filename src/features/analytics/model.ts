import { BUSINESS, SIMULATION } from '../../lib/config.js';
import { stayValue } from '../../utils/stay.js';
import type { CallLog, Delivery, Task, TripMetadata } from '../../types/ops.js';
import type { DomainEvent } from '../../types/events.js';

/**
 * Análises (mockup 05): tudo é derivado do histórico de entregas, das ligações,
 * das Tasks e dos eventos já existentes. Nenhuma série é inventada.
 */

export type Period = 'today' | '7d' | '30d';
export const PERIOD_DAYS: Record<Period, number> = { today: 1, '7d': 7, '30d': 30 };
export type OccurrenceKind = 'receiverNoAnswer' | 'overFranchise' | 'gateQueue' | 'backendAlert';

export interface AnalyticsFilters {
  period: Period;
  receiverId: string;
  driver: string;
  occurrence: OccurrenceKind | 'all';
}
export const ALL = 'all';

export type FeedLike = Pick<DomainEvent, 'id' | 'tripId' | 'type' | 'payload'> & { simMin?: number };

export interface AnalyticsInput {
  deliveries: Delivery[];
  calls: CallLog[];
  tasks: Task[];
  feed: FeedLike[];
  tripMeta: Record<string, TripMetadata>;
  simMinutes: number;
}

const franchiseMin = () => BUSINESS.franchiseHours * 60;
const mean = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

/** Dia relativo (0 = hoje da simulação) de um minuto simulado. */
export const dayOfSimMinute = (minute: number) => Math.floor((SIMULATION.startHour * 60 + minute) / 1440);
/** O histórico da Demo já usa minutos absolutos por dia (dia × 1440). */
export const dayOfCall = (call: CallLog) => call.tripId.startsWith('history-') ? Math.floor(call.atMin / 1440) : dayOfSimMinute(call.atMin);
export const minuteOfDayOfCall = (call: CallLog) => {
  const absolute = call.tripId.startsWith('history-') ? call.atMin : SIMULATION.startHour * 60 + call.atMin;
  return ((absolute % 1440) + 1440) % 1440;
};

export const inPeriod = (day: number, today: number, period: Period) => day <= today && day > today - PERIOD_DAYS[period];

/** Placa → motorista, a partir das entregas e das viagens conhecidas. */
export function driverByPlate(deliveries: Delivery[], tripMeta: Record<string, TripMetadata>) {
  const map = new Map<string, string>();
  Object.values(tripMeta).forEach((meta) => map.set(meta.plate, meta.driver));
  deliveries.forEach((delivery) => { if (delivery.plate && delivery.driver) map.set(delivery.plate, delivery.driver); });
  return map;
}

export function filterDeliveries(deliveries: Delivery[], filters: AnalyticsFilters, today: number) {
  return deliveries.filter((delivery) => inPeriod(delivery.day, today, filters.period)
    && (filters.receiverId === ALL || delivery.receiverId === filters.receiverId)
    && (filters.driver === ALL || delivery.driver === filters.driver));
}

export function filterCalls(calls: CallLog[], filters: AnalyticsFilters, today: number, drivers: Map<string, string>) {
  return calls.filter((call) => inPeriod(dayOfCall(call), today, filters.period)
    && (filters.receiverId === ALL || call.receiverId === filters.receiverId)
    && (filters.driver === ALL || drivers.get(call.plate) === filters.driver));
}

/* ------------------------------------------------------------------ ocorrências */

export interface OccurrenceRow {
  id: string;
  day: number;
  minuteOfDay: number | null;
  kind: OccurrenceKind;
  /** Tipo recebido do backend, quando `kind` é `backendAlert`. */
  backendType?: string;
  plate: string;
  driver: string;
  receiverId: string | null;
  detectedBy: 'agent' | 'telemetry' | 'driver' | 'backend';
  attempts: number | null;
  escalated: boolean;
  status: 'open' | 'resolved';
}

export function occurrences({ deliveries, feed, tripMeta, simMinutes }: AnalyticsInput, filters: AnalyticsFilters): OccurrenceRow[] {
  const today = dayOfSimMinute(simMinutes);
  const rows: OccurrenceRow[] = [];
  filterDeliveries(deliveries, filters, today).forEach((delivery) => {
    const base = { day: delivery.day, minuteOfDay: delivery.arrivalMinuteOfDay ?? null, plate: delivery.plate ?? '—', driver: delivery.driver ?? '—', receiverId: delivery.receiverId, status: 'resolved' as const };
    if (delivery.escalated) rows.push({ ...base, id: `${delivery.tripId}-escalation`, kind: 'receiverNoAnswer', detectedBy: 'agent', attempts: BUSINESS.maxCcoAttempts, escalated: true });
    if (delivery.waitMin > franchiseMin()) rows.push({ ...base, id: `${delivery.tripId}-stay`, kind: 'overFranchise', detectedBy: 'telemetry', attempts: null, escalated: false });
  });
  const unloaded = new Set(deliveries.map((delivery) => delivery.tripId));
  feed.forEach((event) => {
    const meta = tripMeta[event.tripId];
    const day = event.simMin === undefined ? today : dayOfSimMinute(event.simMin);
    if (!inPeriod(day, today, filters.period)) return;
    if (filters.receiverId !== ALL && meta?.receiverId !== filters.receiverId) return;
    if (filters.driver !== ALL && meta?.driver !== filters.driver) return;
    const minuteOfDay = event.simMin === undefined ? null : ((SIMULATION.startHour * 60 + event.simMin) % 1440 + 1440) % 1440;
    const base = { id: event.id, day, minuteOfDay, plate: meta?.plate ?? '—', driver: meta?.driver ?? '—', receiverId: meta?.receiverId ?? null, status: unloaded.has(event.tripId) ? 'resolved' as const : 'open' as const };
    if (event.type === 'OccurrenceCreated') rows.push({ ...base, kind: 'gateQueue', detectedBy: 'driver', attempts: null, escalated: false });
    const backendType = typeof event.payload.tipo === 'string' ? event.payload.tipo : null;
    if (event.type === 'DriverAlert' && backendType) rows.push({ ...base, kind: 'backendAlert', backendType, detectedBy: 'backend', attempts: null, escalated: event.payload.prioridade === 'critico' });
  });
  return rows
    .filter((row) => filters.occurrence === ALL || row.kind === filters.occurrence)
    .sort((a, b) => b.day - a.day || (b.minuteOfDay ?? 0) - (a.minuteOfDay ?? 0));
}

export function occurrenceCounts(rows: OccurrenceRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.kind === 'backendAlert' ? `backendAlert:${row.backendType}` : row.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------- funil e série diária */

export function requestFunnel(deliveries: Delivery[], calls: CallLog[]) {
  const answeredFirst = new Set(calls.filter((call) => call.moment === 'approach' && call.answered).map((call) => call.tripId));
  const sent = deliveries.length;
  const first = deliveries.filter((delivery) => answeredFirst.has(delivery.tripId)).length;
  const afterInsisting = deliveries.filter((delivery) => delivery.callAnswered && !answeredFirst.has(delivery.tripId)).length;
  const noAnswer = deliveries.filter((delivery) => !delivery.callAnswered).length;
  const escalated = deliveries.filter((delivery) => delivery.escalated).length;
  return [
    { key: 'sent', value: sent },
    { key: 'first', value: first },
    { key: 'afterInsisting', value: afterInsisting },
    { key: 'noAnswer', value: noAnswer },
    { key: 'escalated', value: escalated },
  ].map((step) => ({ ...step, share: sent ? step.value / sent : 0 }));
}

export function agentDailySeries(deliveries: Delivery[], calls: CallLog[], today: number, period: Period) {
  const days = Math.min(PERIOD_DAYS[period], 7);
  return Array.from({ length: days }, (_, index) => {
    const day = today - (days - 1 - index);
    return {
      day,
      offset: day - today,
      calls: calls.filter((call) => dayOfCall(call) === day).length,
      escalations: deliveries.filter((delivery) => delivery.day === day && delivery.escalated).length,
    };
  });
}

/* --------------------------------------------------------------------- KPIs Demo */

export function demoKpis(deliveries: Delivery[], calls: CallLog[], occurrenceRows: OccurrenceRow[]) {
  const approach = calls.filter((call) => call.moment === 'approach');
  return {
    trips: deliveries.length,
    drivers: new Set(deliveries.map((delivery) => delivery.driver).filter(Boolean)).size,
    receivers: new Set(deliveries.map((delivery) => delivery.receiverId)).size,
    calls: calls.length,
    answeredCalls: calls.filter((call) => call.answered).length,
    firstAnswerRate: approach.length ? approach.filter((call) => call.answered).length / approach.length : null,
    escalations: deliveries.filter((delivery) => delivery.escalated).length,
    occurrences: occurrenceRows.length,
    openOccurrences: occurrenceRows.filter((row) => row.status === 'open').length,
    avgWaitMin: mean(deliveries.map((delivery) => delivery.waitMin)),
    stayDue: deliveries.reduce((total, delivery) => total + stayValue(delivery.waitMin, delivery.capacityTons), 0),
    stayCharged: deliveries.reduce((total, delivery) => total + (delivery.stayCharged ? stayValue(delivery.waitMin, delivery.capacityTons) : 0), 0),
    contactsAvoided: deliveries.reduce((total, delivery) => total + delivery.contactsAvoided, 0),
    avgCcoActionMin: mean(deliveries.flatMap((delivery) => delivery.ccoActionMin === null ? [] : [delivery.ccoActionMin])),
    notifiedRate: mean(deliveries.map((delivery) => Number(delivery.notifiedBeforeArrival))),
  };
}

/* ---------------------------------------------------------- contatos com o CCO */

export interface ContactRow {
  id: string;
  day: number;
  minuteOfDay: number | null;
  kind: 'escalation' | 'acknowledged';
  plate: string;
  receiverId: string | null;
  attempts: number;
  actionMin: number | null;
  outcome: 'taken' | 'waiting' | 'delivered';
}

export function ccoContacts({ deliveries, tasks, tripMeta, simMinutes }: AnalyticsInput, filters: AnalyticsFilters): ContactRow[] {
  const today = dayOfSimMinute(simMinutes);
  const rows: ContactRow[] = [];
  tasks.forEach((task) => {
    if (task.escalatedAtMin === undefined && task.acknowledgedAtMin === undefined) return;
    const meta = tripMeta[task.tripId];
    const start = task.escalatedAtMin ?? task.createdAtMin;
    const day = dayOfSimMinute(start);
    if (!inPeriod(day, today, filters.period)) return;
    if (filters.receiverId !== ALL && meta?.receiverId !== filters.receiverId) return;
    if (filters.driver !== ALL && meta?.driver !== filters.driver) return;
    rows.push({
      id: task.id, day, minuteOfDay: ((SIMULATION.startHour * 60 + start) % 1440 + 1440) % 1440,
      kind: task.escalatedAtMin !== undefined ? 'escalation' : 'acknowledged',
      plate: meta?.plate ?? '—', receiverId: meta?.receiverId ?? null, attempts: task.attempts,
      actionMin: task.acknowledgedAtMin === undefined ? null : Math.max(0, task.acknowledgedAtMin - start),
      outcome: task.acknowledgedAtMin === undefined ? 'waiting' : 'taken',
    });
  });
  filterDeliveries(deliveries, filters, today).filter((delivery) => delivery.escalated).forEach((delivery) => {
    rows.push({
      id: `${delivery.tripId}-contact`, day: delivery.day, minuteOfDay: delivery.arrivalMinuteOfDay ?? null, kind: 'escalation',
      plate: delivery.plate ?? '—', receiverId: delivery.receiverId, attempts: BUSINESS.maxCcoAttempts,
      actionMin: delivery.ccoActionMin, outcome: 'delivered',
    });
  });
  return rows.sort((a, b) => b.day - a.day || (b.minuteOfDay ?? 0) - (a.minuteOfDay ?? 0));
}

/* ------------------------------------------------------- motoristas e recebedores */

export function driverStats(deliveries: Delivery[], occurrenceRows: OccurrenceRow[]) {
  const groups = new Map<string, Delivery[]>();
  deliveries.forEach((delivery) => {
    if (!delivery.driver) return;
    groups.set(delivery.driver, [...(groups.get(delivery.driver) ?? []), delivery]);
  });
  return [...groups.entries()].map(([driver, items]) => ({
    driver,
    plates: [...new Set(items.map((item) => item.plate).filter(Boolean))] as string[],
    trips: items.length,
    avgWaitMin: mean(items.map((item) => item.waitMin)),
    notifiedRate: mean(items.map((item) => Number(item.notifiedBeforeArrival))),
    escalations: items.filter((item) => item.escalated).length,
    occurrences: occurrenceRows.filter((row) => row.driver === driver).length,
    stayDue: items.reduce((total, item) => total + stayValue(item.waitMin, item.capacityTons), 0),
  })).sort((a, b) => b.trips - a.trips || a.driver.localeCompare(b.driver));
}

export function receiverStats(deliveries: Delivery[], calls: CallLog[], occurrenceRows: OccurrenceRow[]) {
  const ids = [...new Set(deliveries.map((delivery) => delivery.receiverId))];
  return ids.map((receiverId) => {
    const items = deliveries.filter((delivery) => delivery.receiverId === receiverId);
    const receiverCalls = calls.filter((call) => call.receiverId === receiverId);
    return {
      receiverId,
      deliveries: items.length,
      avgWaitMin: mean(items.map((item) => item.waitMin)),
      stoppedHours: items.reduce((total, item) => total + item.waitMin, 0) / 60,
      answerRate: receiverCalls.length ? receiverCalls.filter((call) => call.answered).length / receiverCalls.length : null,
      notifiedRate: mean(items.map((item) => Number(item.notifiedBeforeArrival))),
      occurrences: occurrenceRows.filter((row) => row.receiverId === receiverId).length,
      stayDue: items.reduce((total, item) => total + stayValue(item.waitMin, item.capacityTons), 0),
    };
  }).sort((a, b) => (b.avgWaitMin ?? 0) - (a.avgWaitMin ?? 0));
}

/* ------------------------------------------------------------------- exportação */

/** CSV com separador `;` (abre direto no Excel em pt-BR) e aspas quando necessário. */
export function toCsv(header: string[], rows: (string | number | null)[][]) {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\n');
}
