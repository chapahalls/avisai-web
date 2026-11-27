import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { BUSINESS, SIM_MINUTES_PER_SECOND, SIMULATION } from '../../lib/config.js';
import type { DomainEvent, EventType } from '../../types/events.js';
import type { CallLog, Delivery, Task, Trip, TripMetadata } from '../../types/ops.js';
import { interpolateRoute } from '../../utils/routePath.js';
import { buildCall } from './calls.js';
import { DRIVERS, ORIGIN, PLATES, RECEIVERS, seeded } from './data.js';
import { buildHistoricalData } from './history.js';
import { getMockRoadRoute } from './routes.js';

export interface FeedEvent extends DomainEvent {
  simMin: number;
}

/** Mesma escala do backend (push → painel → ligação; normal → alta → crítica), para a Demo acompanhar a API. */
const ESCALATION_LEVELS: Array<Pick<Task, 'channel' | 'priority'>> = [
  { channel: 'push', priority: 'normal' },
  { channel: 'painel', priority: 'alta' },
  { channel: 'ligacao', priority: 'critica' },
];
const escalationLevel = (attempt: number) => ESCALATION_LEVELS[Math.min(attempt - 1, ESCALATION_LEVELS.length - 1)];

export type MobileDriverAction = 'start' | 'approach' | 'arrive' | 'occurrence' | 'message' | 'acknowledge' | 'unload' | 'advance' | 'reset';

export interface OpsState {
  simMinutes: number;
  running: boolean;
  operatorResponsiveness: number;
  trips: Trip[];
  tripMeta: Record<string, TripMetadata>;
  tasks: Task[];
  calls: CallLog[];
  historicalCalls: CallLog[];
  feed: FeedEvent[];
  history: Delivery[];
  tick: (minutes: number) => void;
  acknowledge: (taskId: string) => void;
  mobileAction: (tripId: string, action: MobileDriverAction, value?: string | number) => void;
  setResponsiveness: (value: number) => void;
  toggle: () => void;
}

export interface EngineOptions {
  seed?: number;
  startDate?: Date;
  operatorResponsiveness?: number;
}

/** Store independente permite testar o motor sem React, temporizadores ou rede. */
export function createOpsStore(options: EngineOptions = {}) {
  const seed = options.seed ?? SIMULATION.seed;
  const baseTime = new Date(options.startDate ?? new Date());
  baseTime.setHours(SIMULATION.startHour, 0, 0, 0);
  let sequence = 0;
  const id = (prefix: string) => `${prefix}-${++sequence}`;
  // As chances de resposta de um caminhão não dependem dos sorteios de outro domínio.
  const operatorRandom = PLATES.map((_, index) => seeded(seed + index));
  const routeRandom = PLATES.map((_, index) => seeded(seed + 100 + index));
  const callRandom = PLATES.map((_, index) => seeded(seed + 200 + index));
  const waitRandom = PLATES.map((_, index) => seeded(seed + 300 + index));
  const mobileMetricRandom = PLATES.map((_, index) => seeded(seed + 600 + index));
  const occurrenceRandom = seeded(seed + 400);
  const metricRandom = seeded(seed + 500);
  const reports: Record<string, boolean> = {};

  const makeTrip = (index: number, initial: boolean): Trip => {
    const receiver = RECEIVERS[initial ? index % RECEIVERS.length : Math.floor(routeRandom[index]() * RECEIVERS.length)];
    const progress = initial ? routeRandom[index]() * 0.6 : 0;
    const path = getMockRoadRoute(receiver.id);
    return {
      id: id('trip'), vehicleId: `vehicle-${index}`, plate: PLATES[index], driver: DRIVERS[index],
      receiverId: receiver.id, origin: ORIGIN, capacityTons: index % 3 === 0 ? 14 : 30,
      progress, routeKm: path.totalKm, phase: 'driving',
      position: interpolateRoute(path, progress)!, notifiedBeforeArrival: false,
    };
  };
  const event = (trip: TripMetadata & { id: string }, type: EventType, atMin: number, payload: Record<string, unknown>, source: DomainEvent['source']): FeedEvent => {
    const eventId = id('event');
    const timestamp = new Date(baseTime.getTime() + atMin * 60_000).toISOString();
    return {
      id: eventId, idempotencyKey: eventId, tripId: trip.id, type,
      occurredAt: timestamp, receivedAt: timestamp, source,
      payload: { ...payload, plate: trip.plate }, simMin: atMin,
    };
  };
  const historical = buildHistoricalData();
  const trips = PLATES.map((_, index) => makeTrip(index, true));
  const tripMeta: Record<string, TripMetadata> = {};
  trips.forEach((trip) => { tripMeta[trip.id] = { plate: trip.plate, driver: trip.driver, receiverId: trip.receiverId }; });
  historical.calls.forEach((call) => {
    tripMeta[call.tripId] = { plate: call.plate, driver: DRIVERS[PLATES.indexOf(call.plate)], receiverId: call.receiverId };
  });

  return createStore<OpsState>((set, get) => {
    const addCall = (trip: Trip, moment: CallLog['moment'], atMin: number, index: number, calls: CallLog[], feed: FeedEvent[]) => {
      const call = buildCall({
        id: id('call'), tripId: trip.id, trip, receiver: receiverById(trip.receiverId),
        moment, atMin, random: callRandom[index],
      });
      calls.push(call);
      feed.push(event(trip, 'ReceiverCallResult', atMin, {
        moment, answered: call.answered, resultCode: call.resultCode, dock: call.dock,
      }, 'agent'));
      return call;
    };
    const autoAcknowledge = (task: Task, trip: Trip, now: number, index: number, responsiveness: number, feed: FeedEvent[]): Task => {
      if (operatorRandom[index]() >= responsiveness) return task;
      feed.push(event(trip, 'TaskAcknowledged', now, { by: 'operator_mock' }, 'cco'));
      return { ...task, status: 'acknowledged', acknowledgedAtMin: now };
    };

    const advance = (step: number) => {
      const state = get();
      const now = state.simMinutes + step;
      const feed: FeedEvent[] = [];
      const calls: CallLog[] = [];
      let tasks = [...state.tasks];
      const history = [...state.history];
      const metadata = { ...state.tripMeta };
      const nextTrips = state.trips.map((trip, index): Trip => {
        const receiver = receiverById(trip.receiverId);
        if (trip.phase === 'driving' || trip.phase === 'approaching') {
          const progress = Math.min(1, trip.progress + SIMULATION.speedKmh * step / (60 * trip.routeKm));
          let next: Trip = { ...trip, progress, position: interpolateRoute(getMockRoadRoute(receiver.id), progress)! };
          const leftKm = trip.routeKm * (1 - progress);
          if (trip.phase === 'driving' && leftKm <= BUSINESS.approachKm) {
            feed.push(event(trip, 'ApproachDetected', now, { leftKm }, 'system'));
            const call = addCall(trip, 'approach', now, index, calls, feed);
            // Mesmo sem atendimento, a tentativa permanece como evidência no log.
            next = { ...next, phase: 'approaching', notifiedBeforeArrival: call.answered && progress < 1 };
            feed.push(event(trip, 'ReceiverNotified', now, { channel: 'call', delivered: call.answered, beforeArrival: progress < 1 }, 'agent'));
          }
          if (progress === 1) {
            const waitMin = Math.round(receiver.typicalWaitMin * (next.notifiedBeforeArrival ? 0.8 : 1.1) * (0.6 + waitRandom[index]() * 0.8));
            next = { ...next, phase: 'waiting', arrivedAtMin: now, unloadAtMin: now + waitMin };
            feed.push(event(trip, 'ArrivalRegistered', now, { geofence: true, voiceCheckin: true }, 'driver'));
            let task: Task = { id: id('task'), tripId: trip.id, createdAtMin: now, attempts: 1, status: 'open', ...escalationLevel(1) };
            feed.push(event(trip, 'TaskCreated', now, { attempt: 1, channel: 'push' }, 'system'));
            task = autoAcknowledge(task, next, now, index, state.operatorResponsiveness, feed);
            tasks.push(task);
            reports[trip.id] = metricRandom() < 0.75;
            feed.push(event(trip, 'ReportSubmitted', now, { completeFirst: reports[trip.id] }, 'driver'));
            if (!reports[trip.id]) feed.push(event(trip, 'ReportFieldMissing', now, { field: 'cargoCondition' }, 'agent'));
          }
          return next;
        }
        if (trip.phase === 'waiting') {
          const task = tasks.find((candidate) => candidate.tripId === trip.id && candidate.status !== 'closed');
          // A descarga encerra a espera antes de qualquer aviso devido no mesmo instante.
          if (trip.unloadAtMin !== undefined && now >= trip.unloadAtMin) {
            const unloadedAtMin = trip.unloadAtMin;
            const waitMin = unloadedAtMin - (trip.arrivedAtMin ?? unloadedAtMin);
            feed.push(event(trip, 'UnloadConfirmed', unloadedAtMin, { waitMin }, 'driver'));
            tasks = tasks.map((candidate) => candidate.tripId === trip.id ? { ...candidate, status: 'closed', closedAtMin: unloadedAtMin } : candidate);
            history.push({
              tripId: trip.id, receiverId: trip.receiverId,
              day: Math.floor((SIMULATION.startHour * 60 + unloadedAtMin) / 1440), waitMin,
              capacityTons: trip.capacityTons, notifiedBeforeArrival: trip.notifiedBeforeArrival,
              callAnswered: [...state.calls, ...calls].some((call) => call.tripId === trip.id && call.answered),
              ccoActionMin: task?.acknowledgedAtMin === undefined ? null : task.acknowledgedAtMin - task.createdAtMin,
              escalated: task?.escalatedAtMin !== undefined,
              reportCompleteFirst: reports[trip.id] ?? true, stayCharged: false,
              contactsAvoided: 2 + Math.floor(metricRandom() * 4), voiceLatencyMs: Math.round(700 + metricRandom() * 1300),
              plate: trip.plate, driver: trip.driver,
              arrivalMinuteOfDay: ((SIMULATION.startHour * 60 + (trip.arrivedAtMin ?? unloadedAtMin)) % 1440 + 1440) % 1440,
            });
            delete reports[trip.id];
            return { ...trip, phase: 'unloaded', unloadedAtMin };
          }
          if (task?.status === 'open') {
            const elapsed = now - task.createdAtMin;
            if (task.attempts < BUSINESS.maxCcoAttempts && elapsed >= task.attempts * BUSINESS.ccoAttemptIntervalMin) {
              const attempt = task.attempts + 1;
              const channel = attempt === 2 ? 'panel' : 'call';
              feed.push(event(trip, 'TaskEscalated', now, { attempt, channel, status: 'open' }, 'system'));
              const updated = autoAcknowledge({ ...task, attempts: attempt, ...escalationLevel(attempt) }, trip, now, index, state.operatorResponsiveness, feed);
              tasks = tasks.map((candidate) => candidate.id === task.id ? updated : candidate);
            } else if (task.attempts === BUSINESS.maxCcoAttempts && elapsed >= BUSINESS.maxCcoAttempts * BUSINESS.ccoAttemptIntervalMin) {
              tasks = tasks.map((candidate) => candidate.id === task.id ? { ...candidate, status: 'escalated', escalatedAtMin: now, ...escalationLevel(task.attempts) } : candidate);
              feed.push(event(trip, 'TaskEscalated', now, { attempt: task.attempts, channel: 'call', status: 'escalated' }, 'system'));
              addCall(trip, 'escalation', now, index, calls, feed);
            }
          }
          return trip;
        }
        if (now - (trip.unloadedAtMin ?? now) >= SIMULATION.nextTripAfterMin) {
          const next = makeTrip(index, false);
          metadata[next.id] = { plate: next.plate, driver: next.driver, receiverId: next.receiverId };
          feed.push(event(next, 'RouteAssigned', now, { receiverId: next.receiverId }, 'cco'));
          feed.push(event(next, 'PickupConfirmed', now, { capacityTons: next.capacityTons }, 'driver'));
          return next;
        }
        return trip;
      });
      const waiting = nextTrips.filter((trip) => trip.phase === 'waiting');
      if (waiting.length && occurrenceRandom() < SIMULATION.occurrenceRatePerMin * step) {
        const trip = waiting[Math.floor(occurrenceRandom() * waiting.length)];
        feed.push(event(trip, 'OccurrenceCreated', now, { messageKey: 'occurrences.gateQueue' }, 'driver'));
      }
      set({
        simMinutes: now, trips: nextTrips, tripMeta: metadata,
        tasks: tasks.filter((task) => task.status !== 'closed' || now - (task.closedAtMin ?? now) < 60),
        calls: [...calls.reverse(), ...state.calls],
        feed: [...feed.reverse(), ...state.feed].slice(0, SIMULATION.feedLimit), history,
      });
    };

    return {
      simMinutes: 0, running: true,
      operatorResponsiveness: options.operatorResponsiveness ?? SIMULATION.operatorResponsiveness,
      trips, tripMeta, tasks: [], calls: [], historicalCalls: historical.calls, history: historical.deliveries,
      feed: trips.flatMap((trip) => [
        event(trip, 'PickupConfirmed', 0, { capacityTons: trip.capacityTons }, 'driver'),
        event(trip, 'RouteAssigned', 0, { receiverId: trip.receiverId }, 'cco'),
      ]),
      tick: (minutes) => {
        if (!get().running || !Number.isFinite(minutes) || minutes <= 0) return;
        // Processa fronteiras de minuto mesmo ao avançar vários minutos em um teste.
        let remaining = minutes;
        while (remaining > 0) {
          const step = Math.min(1, remaining);
          advance(step);
          remaining -= step;
        }
      },
      acknowledge: (taskId) => {
        const state = get();
        const task = state.tasks.find((candidate) => candidate.id === taskId);
        if (!task || (task.status !== 'open' && task.status !== 'escalated')) return;
        const trip = state.trips.find((candidate) => candidate.id === task.tripId);
        if (!trip || trip.phase !== 'waiting') return;
        set({
          tasks: state.tasks.map((candidate) => candidate.id === taskId ? { ...candidate, status: 'acknowledged', acknowledgedAtMin: state.simMinutes } : candidate),
          feed: [event(trip, 'TaskAcknowledged', state.simMinutes, { by: 'operator' }, 'cco'), ...state.feed].slice(0, SIMULATION.feedLimit),
        });
      },
      mobileAction: (tripId, action, value) => {
        const state = get();
        if (action === 'advance') {
          const minutes = Number(value);
          if (Number.isFinite(minutes) && minutes > 0) state.tick(minutes);
          return;
        }

        const index = state.trips.findIndex((candidate) => candidate.id === tripId);
        const trip = state.trips[index];
        if (!trip) return;
        const now = state.simMinutes;

        if (action === 'reset') {
          const route = getMockRoadRoute(trip.receiverId);
          const resetTrip = {
            ...trip,
            phase: 'driving' as const,
            progress: 0,
            position: interpolateRoute(route, 0)!,
            notifiedBeforeArrival: false,
            arrivedAtMin: undefined,
            unloadAtMin: undefined,
            unloadedAtMin: undefined,
          };
          set({
            trips: state.trips.map((candidate) => candidate.id === tripId ? resetTrip : candidate),
            tasks: state.tasks.filter((candidate) => candidate.tripId !== tripId),
            calls: state.calls.filter((candidate) => candidate.tripId !== tripId),
            feed: state.feed.filter((candidate) => candidate.tripId !== tripId),
            history: state.history.filter((candidate) => candidate.tripId !== tripId),
          });
          delete reports[tripId];
          return;
        }

        if (action === 'acknowledge') {
          const task = state.tasks.find((candidate) => candidate.tripId === tripId && (candidate.status === 'open' || candidate.status === 'escalated'));
          if (task) state.acknowledge(task.id);
          return;
        }

        if (action === 'start') {
          if (trip.phase === 'unloaded' || trip.phase === 'waiting') return;
          const route = getMockRoadRoute(trip.receiverId);
          const nextTrip = { ...trip, phase: 'driving' as const, progress: 0, position: interpolateRoute(route, 0)!, notifiedBeforeArrival: false };
          set({
            trips: state.trips.map((candidate) => candidate.id === tripId ? nextTrip : candidate),
            feed: [event(nextTrip, 'PickupConfirmed', now, { capacityTons: nextTrip.capacityTons, source: 'mobile_demo' }, 'driver'), ...state.feed.filter((item) => item.tripId !== tripId || item.type !== 'PickupConfirmed')].slice(0, SIMULATION.feedLimit),
          });
          return;
        }

        if (action === 'approach') {
          if (trip.phase === 'waiting' || trip.phase === 'unloaded' || state.feed.some((item) => item.tripId === tripId && item.type === 'ApproachDetected')) return;
          const route = getMockRoadRoute(trip.receiverId);
          const progress = Math.max(0, 1 - BUSINESS.approachKm / trip.routeKm);
          const approaching = { ...trip, progress, phase: 'approaching' as const, position: interpolateRoute(route, progress)! };
          const calls: CallLog[] = [];
          const feed: FeedEvent[] = [event(approaching, 'ApproachDetected', now, { leftKm: BUSINESS.approachKm, source: 'mobile_demo' }, 'driver')];
          const call = addCall(approaching, 'approach', now, index, calls, feed);
          const nextTrip = { ...approaching, notifiedBeforeArrival: call.answered };
          feed.push(event(nextTrip, 'ReceiverNotified', now, { channel: 'call', delivered: call.answered, beforeArrival: true }, 'agent'));
          set({
            trips: state.trips.map((candidate) => candidate.id === tripId ? nextTrip : candidate),
            calls: [...calls.reverse(), ...state.calls],
            feed: [...feed.reverse(), ...state.feed].slice(0, SIMULATION.feedLimit),
          });
          return;
        }

        if (action === 'arrive') {
          if (trip.phase === 'waiting' || trip.phase === 'unloaded') return;
          const route = getMockRoadRoute(trip.receiverId);
          const calls: CallLog[] = [];
          const feed: FeedEvent[] = [];
          let notifiedBeforeArrival = trip.notifiedBeforeArrival;
          if (trip.phase === 'driving' && !state.feed.some((item) => item.tripId === tripId && item.type === 'ApproachDetected')) {
            const call = addCall(trip, 'approach', now, index, calls, feed);
            notifiedBeforeArrival = call.answered;
            feed.unshift(event(trip, 'ApproachDetected', now, { leftKm: BUSINESS.approachKm, source: 'mobile_demo' }, 'driver'));
            feed.push(event(trip, 'ReceiverNotified', now, { channel: 'call', delivered: call.answered, beforeArrival: true }, 'agent'));
          }
          const receiver = receiverById(trip.receiverId);
          const progress = 1;
          const waitMin = Math.round(receiver.typicalWaitMin * (notifiedBeforeArrival ? 0.8 : 1.1) * (0.6 + waitRandom[index]() * 0.8));
          const arrivedTrip = { ...trip, progress, position: interpolateRoute(route, progress)!, phase: 'waiting' as const, notifiedBeforeArrival, arrivedAtMin: now, unloadAtMin: now + waitMin };
          feed.push(event(arrivedTrip, 'ArrivalRegistered', now, { geofence: true, voiceCheckin: true, source: 'mobile_demo' }, 'driver'));
          let task: Task = { id: id('task'), tripId, createdAtMin: now, attempts: 1, status: 'open', ...escalationLevel(1) };
          feed.push(event(arrivedTrip, 'TaskCreated', now, { attempt: 1, channel: 'push' }, 'system'));
          task = autoAcknowledge(task, arrivedTrip, now, index, state.operatorResponsiveness, feed);
          reports[tripId] = mobileMetricRandom[index]() < 0.75;
          feed.push(event(arrivedTrip, 'ReportSubmitted', now, { completeFirst: reports[tripId], source: 'mobile_demo' }, 'driver'));
          if (!reports[tripId]) feed.push(event(arrivedTrip, 'ReportFieldMissing', now, { field: 'cargoCondition' }, 'agent'));
          set({
            trips: state.trips.map((candidate) => candidate.id === tripId ? arrivedTrip : candidate),
            tasks: [...state.tasks, task], calls: [...calls.reverse(), ...state.calls],
            feed: [...feed.reverse(), ...state.feed].slice(0, SIMULATION.feedLimit),
          });
          return;
        }

        if (action === 'occurrence' || action === 'message') {
          const text = typeof value === 'string' ? value.trim() : '';
          if (action === 'message' && !text) return;
          const type = action === 'occurrence' ? 'OccurrenceCreated' : 'DriverMessageSent';
          const payload = action === 'occurrence'
            ? text ? { details: text, source: 'mobile_demo' } : { messageKey: 'occurrences.gateQueue', source: 'mobile_demo' }
            : { text, channel: 'app', source: 'mobile_demo' };
          set({ feed: [event(trip, type, now, payload, 'driver'), ...state.feed].slice(0, SIMULATION.feedLimit) });
          return;
        }

        if (action === 'unload') {
          if (trip.phase !== 'waiting') return;
          const task = state.tasks.find((candidate) => candidate.tripId === tripId && candidate.status !== 'closed');
          const waitMin = Math.max(0, now - (trip.arrivedAtMin ?? now));
          const nextTrip = { ...trip, phase: 'unloaded' as const, unloadAtMin: now, unloadedAtMin: now };
          const delivery: Delivery = {
            tripId: trip.id, receiverId: trip.receiverId,
            day: Math.floor((SIMULATION.startHour * 60 + now) / 1440), waitMin,
            capacityTons: trip.capacityTons, notifiedBeforeArrival: trip.notifiedBeforeArrival,
            callAnswered: state.calls.some((call) => call.tripId === trip.id && call.answered),
            ccoActionMin: task?.acknowledgedAtMin === undefined ? null : task.acknowledgedAtMin - task.createdAtMin,
            escalated: task?.escalatedAtMin !== undefined, reportCompleteFirst: reports[tripId] ?? true, stayCharged: false,
            contactsAvoided: 2 + Math.floor(mobileMetricRandom[index]() * 4), voiceLatencyMs: Math.round(700 + mobileMetricRandom[index]() * 1300), plate: trip.plate, driver: trip.driver,
            arrivalMinuteOfDay: ((SIMULATION.startHour * 60 + (trip.arrivedAtMin ?? now)) % 1440 + 1440) % 1440,
          };
          const unloadEvent = event(nextTrip, 'UnloadConfirmed', now, { waitMin, source: 'mobile_demo' }, 'driver');
          set({
            trips: state.trips.map((candidate) => candidate.id === tripId ? nextTrip : candidate),
            tasks: state.tasks.map((candidate) => candidate.tripId === tripId && candidate.status !== 'closed' ? { ...candidate, status: 'closed', closedAtMin: now } : candidate),
            history: [...state.history, delivery], feed: [unloadEvent, ...state.feed].slice(0, SIMULATION.feedLimit),
          });
          delete reports[tripId];
        }
      },
      setResponsiveness: (value) => { if (Number.isFinite(value)) set({ operatorResponsiveness: Math.max(0, Math.min(1, value)) }); },
      toggle: () => set((state) => ({ running: !state.running })),
    };
  });
}

export const opsStore = createOpsStore();

export function useOps(): OpsState;
export function useOps<T>(selector: (state: OpsState) => T): T;
export function useOps<T>(selector?: (state: OpsState) => T) {
  return useStore(opsStore, selector ?? ((state: OpsState) => state as T));
}

/** A limpeza do efeito mantém somente um timer ativo, inclusive em React StrictMode. */
export function startEngine() {
  const timer = setInterval(() => opsStore.getState().tick(SIM_MINUTES_PER_SECOND), 1000);
  return () => clearInterval(timer);
}

export const receiverById = (id: string) => {
  const receiver = RECEIVERS.find((candidate) => candidate.id === id);
  if (!receiver) throw new Error(`Unknown mock receiver: ${id}`);
  return receiver;
};
export { RECEIVERS };
