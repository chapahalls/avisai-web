import { create } from 'zustand';
import { BUSINESS, SIM_MINUTES_PER_SECOND } from '../../lib/config';
import type { DomainEvent, EventType } from '../../types/events';
import type { CallLog, Delivery, Task, Trip } from '../../types/ops';
import { distanceKm, lerp } from '../../utils/geo';
import { buildHistory } from './history';
import { DRIVERS, ORIGIN, PLATES, RECEIVERS } from './data';

/**
 * Motor MOCK do CCO: simula a frota, os eventos que o agente gera e as ações da central.
 * Na versão real, os eventos chegam do agent-server (polling) ou por Agora Signaling.
 */
export interface FeedEvent extends DomainEvent {
  simMin: number;
}

interface OpsState {
  simMinutes: number;
  running: boolean;
  /** Demo: chance de o operador assumir uma Task a cada tentativa. */
  operatorResponsiveness: number;
  trips: Trip[];
  tasks: Task[];
  calls: CallLog[];
  feed: FeedEvent[];
  history: Delivery[];
  tick: (dMin: number) => void;
  acknowledge: (taskId: string) => void;
  setResponsiveness: (v: number) => void;
  toggle: () => void;
}

const SPEED_KMH = 70;
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function makeTrip(i: number, progress = Math.random() * 0.6): Trip {
  const r = RECEIVERS[i % RECEIVERS.length];
  return {
    id: uid('trip'),
    plate: PLATES[i % PLATES.length],
    driver: DRIVERS[i % DRIVERS.length],
    receiverId: r.id,
    origin: ORIGIN,
    capacityTons: i % 3 === 0 ? 14 : 30,
    progress,
    routeKm: distanceKm(ORIGIN, r.position),
    phase: 'driving',
    position: lerp(ORIGIN, r.position, progress),
    notifiedBeforeArrival: false,
  };
}

const RECEIVER_LINES = {
  confirmed: (dock: number) => `Pode mandar, doca ${dock} libera em 30 minutos.`,
  notToday: 'Hoje não recebemos mais, só amanhã às 7h.',
};

export const useOps = create<OpsState>((set, get) => {
  const event = (tripId: string, type: EventType, payload: Record<string, unknown>, source: DomainEvent['source']): FeedEvent => ({
    id: uid('ev'),
    idempotencyKey: uid('ik'),
    tripId,
    type,
    occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    source,
    payload,
    simMin: get().simMinutes,
  });

  const callReceiver = (trip: Trip, moment: CallLog['moment']): { call: CallLog; ev: FeedEvent } => {
    const r = RECEIVERS.find((x) => x.id === trip.receiverId)!;
    const answered = Math.random() < r.answerRate;
    const notToday = answered && Math.random() < 0.12;
    const dock = 1 + Math.floor(Math.random() * 6);
    const transcript: CallLog['transcript'] = [
      { who: 'agent', text: `Olá, aqui é o assistente virtual da transportadora. O caminhão ${trip.plate} chega em ${moment === 'approach' ? '15 minutos' : 'está na porta há um tempo'}. Qual doca e horário?` },
    ];
    if (answered) transcript.push({ who: 'receiver', text: notToday ? RECEIVER_LINES.notToday : RECEIVER_LINES.confirmed(dock) });
    const result = !answered ? 'não atendeu' : notToday ? 'não recebe hoje' : `doca ${dock}, 30 min`;
    const call: CallLog = { id: uid('call'), tripId: trip.id, receiverId: r.id, moment, atMin: get().simMinutes, answered, result, transcript };
    return { call, ev: event(trip.id, 'ReceiverCallResult', { moment, answered, result }, 'agent') };
  };

  return {
    simMinutes: 0,
    running: true,
    operatorResponsiveness: 0.35,
    trips: Array.from({ length: 8 }, (_, i) => makeTrip(i)),
    tasks: [],
    calls: [],
    feed: [],
    history: buildHistory(),

    tick: (dMin) => {
      const s = get();
      if (!s.running) return;
      const now = s.simMinutes + dMin;
      const feed: FeedEvent[] = [];
      const calls: CallLog[] = [];
      let tasks = [...s.tasks];
      const history = [...s.history];

      const trips = s.trips.map((t, idx) => {
        const r = RECEIVERS.find((x) => x.id === t.receiverId)!;
        if (t.phase === 'driving' || t.phase === 'approaching') {
          const progress = Math.min(1, t.progress + ((SPEED_KMH / 60) * dMin) / t.routeKm);
          const position = lerp(t.origin, r.position, progress);
          const leftKm = t.routeKm * (1 - progress);
          let next: Trip = { ...t, progress, position };
          if (t.phase === 'driving' && leftKm <= BUSINESS.approachKm) {
            next = { ...next, phase: 'approaching', notifiedBeforeArrival: true };
            feed.push(event(t.id, 'ApproachDetected', { leftKm: Math.round(leftKm) }, 'system'));
            feed.push(event(t.id, 'ReceiverNotified', { channel: 'ligação' }, 'agent'));
            const c = callReceiver(next, 'approach');
            calls.push(c.call);
            feed.push(c.ev);
          }
          if (progress >= 1) {
            const wait = Math.max(40, r.typicalWaitMin * (next.notifiedBeforeArrival ? 0.8 : 1.1) * (0.6 + Math.random() * 0.8));
            next = { ...next, phase: 'waiting', arrivedAtMin: now, unloadAtMin: now + wait };
            feed.push(event(t.id, 'ArrivalRegistered', { geofence: true, voiceCheckin: true }, 'driver'));
            feed.push(event(t.id, 'TaskCreated', { priority: 'baixa' }, 'system'));
            tasks.push({ id: uid('task'), tripId: t.id, createdAtMin: now, attempts: 1, status: 'open' });
          }
          return next;
        }

        if (t.phase === 'waiting') {
          const task = tasks.find((k) => k.tripId === t.id && k.status !== 'closed');
          if (task && task.status === 'open') {
            const due = 1 + Math.floor((now - task.createdAtMin) / BUSINESS.ccoAttemptIntervalMin);
            if (due > task.attempts) {
              if (Math.random() < s.operatorResponsiveness) {
                tasks = tasks.map((k) => (k.id === task.id ? { ...k, status: 'acknowledged', acknowledgedAtMin: now } : k));
                feed.push(event(t.id, 'TaskAcknowledged', { by: 'operador' }, 'cco'));
              } else if (task.attempts >= BUSINESS.maxCcoAttempts) {
                tasks = tasks.map((k) => (k.id === task.id ? { ...k, status: 'escalated' } : k));
                const c = callReceiver(t, 'escalation');
                calls.push(c.call);
                feed.push(c.ev);
              } else {
                const attempt = task.attempts + 1;
                tasks = tasks.map((k) => (k.id === task.id ? { ...k, attempts: attempt } : k));
                feed.push(event(t.id, 'TaskEscalated', { attempt, channel: ['push', 'painel', 'ligação'][attempt - 1] }, 'system'));
              }
            }
          }
          if (t.unloadAtMin !== undefined && now >= t.unloadAtMin) {
            const waitMin = now - (t.arrivedAtMin ?? now);
            const tk = tasks.find((k) => k.tripId === t.id);
            feed.push(event(t.id, 'UnloadConfirmed', { waitMin: Math.round(waitMin) }, 'driver'));
            tasks = tasks.map((k) => (k.tripId === t.id ? { ...k, status: 'closed', closedAtMin: now } : k));
            history.push({
              tripId: t.id,
              receiverId: t.receiverId,
              day: 0,
              waitMin: Math.round(waitMin),
              capacityTons: t.capacityTons,
              notifiedBeforeArrival: t.notifiedBeforeArrival,
              callAnswered: calls.concat(s.calls).some((c) => c.tripId === t.id && c.answered),
              ccoActionMin: tk?.acknowledgedAtMin !== undefined ? Math.round(tk.acknowledgedAtMin - tk.createdAtMin) : null,
              escalated: tk?.status === 'escalated',
              reportCompleteFirst: Math.random() < 0.75,
              stayCharged: false,
              contactsAvoided: 3,
              voiceLatencyMs: Math.round(700 + Math.random() * 1100),
            });
            return { ...t, phase: 'unloaded' as const, unloadedAtMin: now };
          }
          return t;
        }

        // Descarga feita: depois de 30 min, o caminhão sai para uma nova entrega.
        if (t.phase === 'unloaded' && now - (t.unloadedAtMin ?? now) > 30) return makeTrip(idx + Math.floor(now), 0);
        return t;
      });

      if (Math.random() < 0.01 * dMin) {
        const t = trips[Math.floor(Math.random() * trips.length)];
        feed.push(event(t.id, 'OccurrenceCreated', { text: 'Fila na portaria, sem previsão' }, 'driver'));
      }

      set({
        simMinutes: now,
        trips,
        tasks: tasks.filter((k) => k.status !== 'closed' || now - (k.closedAtMin ?? now) < 60),
        calls: [...calls, ...s.calls].slice(0, 100),
        feed: [...feed.reverse(), ...s.feed].slice(0, 200),
        history,
      });
    },

    acknowledge: (taskId) => {
      const now = get().simMinutes;
      const task = get().tasks.find((k) => k.id === taskId);
      if (!task || task.status !== 'open') return;
      set((s) => ({
        tasks: s.tasks.map((k) => (k.id === taskId ? { ...k, status: 'acknowledged', acknowledgedAtMin: now } : k)),
        feed: [{ ...s.feed[0], id: uid('ev'), idempotencyKey: uid('ik'), tripId: task.tripId, type: 'TaskAcknowledged', source: 'cco', payload: { by: 'você' }, simMin: now, occurredAt: new Date().toISOString() } as FeedEvent, ...s.feed],
      }));
    },

    setResponsiveness: (v) => set({ operatorResponsiveness: v }),
    toggle: () => set((s) => ({ running: !s.running })),
  };
});

/** Loop do simulador: 1 s real = SIM_MINUTES_PER_SECOND min. */
export function startEngine() {
  const timer = setInterval(() => useOps.getState().tick(SIM_MINUTES_PER_SECOND), 1000);
  return () => clearInterval(timer);
}

export const receiverById = (id: string) => RECEIVERS.find((r) => r.id === id)!;
export { RECEIVERS };
