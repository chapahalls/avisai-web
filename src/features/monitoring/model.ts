import { BUSINESS, SIMULATION } from '../../lib/config.js';
import type { CallLog, Task, Trip } from '../../types/ops.js';

/**
 * Regras do painel de monitoramento (mockup 02-monitoramento). Tudo é derivado
 * do estado operacional já existente; nenhum campo sem fonte é inventado.
 */

export type AlertSeverity = 'critical' | 'high' | 'medium';
export type AlertKind = 'escalated' | 'noAnswer' | 'overFranchise' | 'staleSignal' | 'noPosition';

export interface MonitoringAlert {
  id: string;
  tripId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Minutos desde que o alerta começou, quando há fonte para isso. */
  sinceMin: number | null;
  taskId?: string;
  attempts?: number;
  waitMin?: number;
  staleMin?: number;
}

const severityOrder: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2 };
/** Sinal de GPS considerado desatualizado a partir deste atraso. */
export const STALE_SIGNAL_MIN = 2;

/** Espera no recebedor, em minutos; `null` quando não há fonte. */
export function waitMinutes(trip: Trip, simMinutes: number): number | null {
  if (trip.source === 'api') return trip.stay?.waitMin ?? null;
  if (trip.arrivedAtMin === undefined) return null;
  return Math.max(0, (trip.unloadedAtMin ?? simMinutes) - trip.arrivedAtMin);
}

/** Minutos desde a última posição (somente API; a Demo é contínua). */
export function signalAgeMinutes(trip: Trip, nowMs: number): number | null {
  if (trip.source !== 'api' || !trip.lastPositionAt) return null;
  return Math.max(0, (nowMs - new Date(trip.lastPositionAt).getTime()) / 60_000);
}

export function deriveAlerts(
  { trips, tasks, simMinutes }: { trips: Trip[]; tasks: Task[]; simMinutes: number },
  nowMs = Date.now(),
): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const franchise = BUSINESS.franchiseHours * 60;
  tasks.forEach((task) => {
    if (task.status !== 'open' && task.status !== 'escalated') return;
    alerts.push({
      id: `task-${task.id}`,
      tripId: task.tripId,
      taskId: task.id,
      kind: task.status === 'escalated' ? 'escalated' : 'noAnswer',
      severity: task.status === 'escalated' ? 'critical' : 'high',
      sinceMin: Math.max(0, simMinutes - (task.escalatedAtMin ?? task.createdAtMin)),
      attempts: task.attempts,
    });
  });
  trips.forEach((trip) => {
    if (trip.phase === 'unloaded') return;
    const wait = trip.phase === 'waiting' ? waitMinutes(trip, simMinutes) : null;
    if (wait !== null && wait > franchise) {
      alerts.push({ id: `stay-${trip.id}`, tripId: trip.id, kind: 'overFranchise', severity: 'high', sinceMin: wait - franchise, waitMin: wait });
    }
    if (trip.source === 'api' && trip.positionKnown === false) {
      alerts.push({ id: `gps-${trip.id}`, tripId: trip.id, kind: 'noPosition', severity: 'medium', sinceMin: null });
    } else {
      const age = signalAgeMinutes(trip, nowMs);
      if (age !== null && age >= STALE_SIGNAL_MIN && trip.phase !== 'waiting') {
        alerts.push({ id: `signal-${trip.id}`, tripId: trip.id, kind: 'staleSignal', severity: age >= 10 ? 'critical' : 'high', sinceMin: age, staleMin: age });
      }
    }
  });
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (b.sinceMin ?? 0) - (a.sinceMin ?? 0));
}

export interface OperationCounts {
  active: number;
  onRoute: number;
  approaching: number;
  atReceiver: number;
  overFranchise: number;
}

export function countOperation(trips: Trip[], simMinutes: number): OperationCounts {
  const franchise = BUSINESS.franchiseHours * 60;
  const active = trips.filter((trip) => trip.phase !== 'unloaded');
  const waiting = active.filter((trip) => trip.phase === 'waiting');
  return {
    active: active.length,
    onRoute: active.filter((trip) => trip.phase === 'driving' || trip.phase === 'approaching').length,
    approaching: active.filter((trip) => trip.phase === 'approaching').length,
    atReceiver: waiting.length,
    overFranchise: waiting.filter((trip) => (waitMinutes(trip, simMinutes) ?? 0) > franchise).length,
  };
}

/** Minutos restantes até o recebedor; `null` sem fonte. */
export function etaMinutes(trip: Trip): number | null {
  if (trip.phase === 'waiting' || trip.phase === 'unloaded') return 0;
  if (trip.source === 'api') return trip.etaMin ?? null;
  return Math.ceil((trip.routeKm * (1 - trip.progress)) / SIMULATION.speedKmh * 60);
}

/** Última ligação do agente para a viagem. */
export function latestCall(calls: CallLog[], tripId: string): CallLog | undefined {
  return calls.filter((call) => call.tripId === tripId).sort((a, b) => b.atMin - a.atMin)[0];
}

export type DockBarKind = 'waiting' | 'unloaded' | 'planned';

export interface DockBar {
  tripId: string;
  plate: string;
  kind: DockBarKind;
  /** Minuto do dia (0–1440). */
  start: number;
  end: number;
  dock?: number | string;
}

export interface DockRow {
  receiverId: string;
  bars: DockBar[];
}

/** Duração assumida para uma chegada prevista na agenda de docas. */
export const PLANNED_SLOT_MIN = 60;

/** Janelas de doca do dia por recebedor, em minutos do dia. */
export function dockWindows({ trips, calls, simMinutes }: { trips: Trip[]; calls: CallLog[]; simMinutes: number }): DockRow[] {
  const offset = SIMULATION.startHour * 60;
  const now = offset + simMinutes;
  const rows = new Map<string, DockBar[]>();
  trips.forEach((trip) => {
    const dock = latestCall(calls, trip.id)?.dock;
    let bar: DockBar | null = null;
    if (trip.phase === 'waiting' || trip.phase === 'unloaded') {
      const wait = waitMinutes(trip, simMinutes);
      const start = trip.arrivedAtMin !== undefined ? offset + trip.arrivedAtMin : wait !== null ? now - wait : null;
      if (start !== null) {
        const end = trip.unloadedAtMin !== undefined ? offset + trip.unloadedAtMin : now;
        bar = { tripId: trip.id, plate: trip.plate, kind: trip.phase === 'unloaded' ? 'unloaded' : 'waiting', start, end: Math.max(end, start + 10), dock };
      }
    } else {
      const eta = etaMinutes(trip);
      if (eta !== null) bar = { tripId: trip.id, plate: trip.plate, kind: 'planned', start: now + eta, end: now + eta + PLANNED_SLOT_MIN, dock };
    }
    if (!bar) return;
    rows.set(trip.receiverId, [...(rows.get(trip.receiverId) ?? []), bar]);
  });
  return [...rows.entries()].map(([receiverId, bars]) => ({ receiverId, bars: bars.sort((a, b) => a.start - b.start) }));
}
