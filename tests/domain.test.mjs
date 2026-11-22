import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOpsStore } from '../.cache/tests/services/mock/engine.js';
import { buildHistoricalData } from '../.cache/tests/services/mock/history.js';
import { buildCall } from '../.cache/tests/services/mock/calls.js';
import { ORIGIN, RECEIVERS } from '../.cache/tests/services/mock/data.js';
import { getMockRoadRoute, MOCK_ROAD_ROUTES } from '../.cache/tests/services/mock/routes.js';
import { buildTripDossier, buildTripCommunications } from '../.cache/tests/services/mock/dossier.js';
import { calculateMetrics, calculateDailySeries, percentile } from '../.cache/tests/utils/metrics.js';
import { stayValue } from '../.cache/tests/utils/stay.js';
import { brl, hhmm, pct, clock } from '../.cache/tests/utils/format.js';
import { createRoutePath, interpolateRoute } from '../.cache/tests/utils/routePath.js';
import { distanceKm } from '../.cache/tests/utils/geo.js';
import { splitRoute, getRouteHeading, getTrackingPosition } from '../.cache/tests/utils/tracking.js';
import { SIMULATION } from '../.cache/tests/lib/config.js';
import { getRoadRoute, loadGoogleMaps, loadTrackingMaps } from '../.cache/tests/lib/googleMaps.js';

const startDate = new Date(2026, 10, 22, 21, 45);
const state = (store) => store.getState();
const tick = (store, minutes) => state(store).tick(minutes);
const tripById = (store, tripId) => state(store).trips.find((trip) => trip.id === tripId);
const taskByTrip = (store, tripId) => state(store).tasks.find((task) => task.tripId === tripId);
const eventsFor = (store, tripId, type) => state(store).feed.filter((event) => event.tripId === tripId && event.type === type);

/** Uma chegada controlada; demais veículos permanecem descarregados durante o cenário. */
function arrivedFixture(responsiveness = 0) {
  const store = createOpsStore({ startDate, operatorResponsiveness: responsiveness });
  const original = state(store).trips[0];
  store.setState({
    trips: state(store).trips.map((trip, index) => index === 0
      ? { ...trip, phase: 'approaching', progress: 1, notifiedBeforeArrival: true }
      : { ...trip, phase: 'unloaded', unloadedAtMin: 100_000 }),
  });
  tick(store, 1);
  store.setState({ trips: state(store).trips.map((trip, index) => index === 0 ? { ...trip, unloadAtMin: 1000 } : trip) });
  return { store, tripId: original.id, original };
}

for (const capacity of [14, 30]) {
  test(`estadia de ${capacity} t respeita franquia e fração da hora`, () => {
    assert.equal(stayValue(0, capacity), 0);
    assert.equal(stayValue(300, capacity), 0);
    assert.equal(stayValue(301, capacity), capacity * 2.5);
    assert.equal(stayValue(360, capacity), capacity * 2.5);
    assert.equal(stayValue(361, capacity), capacity * 5);
  });
}

test('histórico reproduzível tem 63 entregas, adoção crescente e espera decrescente', () => {
  const first = buildHistoricalData();
  assert.deepEqual(buildHistoricalData(), first);
  assert.equal(first.deliveries.length, 63);
  const days = calculateDailySeries(first.deliveries);
  assert.deepEqual(days.map((day) => day.day), [-6, -5, -4, -3, -2, -1, 0]);
  assert.deepEqual(days.map((day) => first.deliveries.filter((delivery) => delivery.day === day.day && delivery.notifiedBeforeArrival).length), [4, 5, 6, 6, 7, 8, 8]);
  for (let index = 1; index < days.length; index += 1) {
    assert.ok(days[index].avisados >= days[index - 1].avisados);
    assert.ok(days[index].horasParadas < days[index - 1].horasParadas);
  }
  const eligible = first.deliveries.filter((delivery) => stayValue(delivery.waitMin, delivery.capacityTons) > 0);
  assert.equal(first.deliveries.filter((delivery) => delivery.stayCharged).length, Math.round(eligible.length * 0.15));
  assert.ok(first.deliveries.every((delivery) => delivery.voiceLatencyMs >= 700 && delivery.voiceLatencyMs <= 2000));
  for (const delivery of first.deliveries) {
    const calls = first.calls.filter((call) => call.tripId === delivery.tripId);
    assert.equal(calls.filter((call) => call.moment === 'approach').length, 1);
    assert.equal(delivery.notifiedBeforeArrival, calls.find((call) => call.moment === 'approach').answered);
    assert.equal(delivery.callAnswered, calls.some((call) => call.answered));
    if (delivery.stayCharged) assert.ok(stayValue(delivery.waitMin, delivery.capacityTons) > 0);
  }
});

test('métricas usam chamadas como denominador e excluem ações inexistentes da média', () => {
  const historical = buildHistoricalData();
  const history = [
    { ...historical.deliveries[0], tripId: 'metric-a', waitMin: 301, capacityTons: 30, stayCharged: true, ccoActionMin: null, escalated: true, reportCompleteFirst: true, contactsAvoided: 3, voiceLatencyMs: 1000, notifiedBeforeArrival: true },
    { ...historical.deliveries[1], tripId: 'metric-b', waitMin: 361, capacityTons: 14, stayCharged: false, ccoActionMin: 20, escalated: false, reportCompleteFirst: false, contactsAvoided: 4, voiceLatencyMs: 2000, notifiedBeforeArrival: false },
  ];
  const calls = [true, false, false].map((answered, index) => ({ ...historical.calls[0], id: `metric-call-${index}`, answered }));
  const metrics = calculateMetrics(history, [{ status: 'escalated' }, { status: 'closed' }, { status: 'acknowledged' }], calls);
  assert.equal(metrics.deliveries, 2);
  assert.equal(metrics.avgStoppedMin, 331);
  assert.equal(metrics.stayDue, 145);
  assert.equal(metrics.stayCharged, 75);
  assert.equal(metrics.notifiedRate, 0.5);
  assert.equal(metrics.callAnsweredRate, 1 / 3);
  assert.equal(metrics.avgCcoActionMin, 20);
  assert.equal(metrics.escalatedOpen, 1);
  assert.equal(metrics.escalatedTotal, 1);
  assert.equal(metrics.completeFirstRate, 0.5);
  assert.equal(metrics.contactsAvoided, 7);
  assert.equal(metrics.latencyP50, 1000);
  assert.equal(metrics.latencyP95, 2000);
  assert.equal(calculateDailySeries(history).reduce((sum, day) => sum + day.estadiaDevida, 0), metrics.stayDue);
  for (const value of Object.values(calculateMetrics([], [], []))) assert.equal(value, 0);
  assert.deepEqual(calculateDailySeries([]), []);
});

test('percentis nearest-rank selecionam a ordem correta sem modificar a amostra', () => {
  const values = [400, 100, 300, 200];
  assert.equal(percentile(values, 50), 200);
  assert.equal(percentile(values, 95), 400);
  assert.equal(percentile([700], 95), 700);
  assert.equal(percentile([], 50), 0);
  assert.deepEqual(values, [400, 100, 300, 200]);
});

test('demo padrão de 35% apresenta escalada e transcrição até 120 minutos simulados', () => {
  const store = createOpsStore({ startDate });
  assert.equal(state(store).operatorResponsiveness, 0.35);
  tick(store, 120);
  assert.ok(state(store).tasks.some((task) => task.status === 'escalated'));
  const escalation = state(store).calls.find((call) => call.moment === 'escalation');
  assert.ok(escalation);
  assert.ok(escalation.atMin <= 120);
  assert.ok(escalation.transcript.length >= 1);
  assert.match(escalation.transcript[0].text, /assistente virtual da transportadora/);
  assert.ok(escalation.transcript[0].text.includes(escalation.plate));
  const metrics = calculateMetrics(state(store).history, state(store).tasks, [...state(store).historicalCalls, ...state(store).calls]);
  assert.ok(metrics.escalatedOpen > 0);
  assert.ok(calculateDailySeries(state(store).history).length >= 7);
});

test('sem resposta, avisos ocorrem em T0/20/40 e a escalada final em T60 uma única vez', () => {
  const { store, tripId } = arrivedFixture(0);
  const createdAt = taskByTrip(store, tripId).createdAtMin;
  assert.equal(taskByTrip(store, tripId).attempts, 1);
  assert.equal(taskByTrip(store, tripId).status, 'open');
  assert.equal(eventsFor(store, tripId, 'TaskCreated')[0].payload.channel, 'push');
  tick(store, 19);
  assert.equal(taskByTrip(store, tripId).attempts, 1);
  tick(store, 1);
  assert.equal(taskByTrip(store, tripId).attempts, 2);
  assert.equal(eventsFor(store, tripId, 'TaskEscalated')[0].payload.channel, 'panel');
  tick(store, 20);
  assert.equal(taskByTrip(store, tripId).attempts, 3);
  assert.equal(taskByTrip(store, tripId).status, 'open');
  assert.equal(eventsFor(store, tripId, 'TaskEscalated')[0].payload.channel, 'call');
  tick(store, 19);
  assert.equal(taskByTrip(store, tripId).status, 'open');
  tick(store, 1);
  const escalated = taskByTrip(store, tripId);
  assert.equal(escalated.status, 'escalated');
  assert.equal(escalated.escalatedAtMin, createdAt + 60);
  tick(store, 40);
  assert.equal(state(store).calls.filter((call) => call.tripId === tripId && call.moment === 'escalation').length, 1);
  assert.deepEqual(eventsFor(store, tripId, 'TaskEscalated').map((event) => event.simMin).sort((a, b) => a - b), [createdAt + 20, createdAt + 40, createdAt + 60]);
});

test('100% de resposta assume na chegada, sem esperar a segunda tentativa', () => {
  const { store, tripId } = arrivedFixture(1);
  const task = taskByTrip(store, tripId);
  assert.equal(task.status, 'acknowledged');
  assert.equal(task.attempts, 1);
  assert.equal(task.acknowledgedAtMin, task.createdAtMin);
  tick(store, 70);
  assert.equal(eventsFor(store, tripId, 'TaskAcknowledged').length, 1);
  assert.equal(eventsFor(store, tripId, 'TaskEscalated').length, 0);
  assert.equal(state(store).calls.filter((call) => call.tripId === tripId && call.moment === 'escalation').length, 0);
});

test('resposta automática é avaliada novamente na segunda tentativa', () => {
  const { store, tripId } = arrivedFixture(0);
  state(store).setResponsiveness(1);
  tick(store, 20);
  assert.equal(taskByTrip(store, tripId).attempts, 2);
  assert.equal(taskByTrip(store, tripId).status, 'acknowledged');
  assert.equal(taskByTrip(store, tripId).acknowledgedAtMin, taskByTrip(store, tripId).createdAtMin + 20);
});

test('assumir uma Task aberta é idempotente e interrompe novos avisos', () => {
  const { store, tripId } = arrivedFixture(0);
  const task = taskByTrip(store, tripId);
  state(store).acknowledge(task.id);
  state(store).acknowledge(task.id);
  state(store).acknowledge('unknown-task');
  tick(store, 80);
  assert.equal(taskByTrip(store, tripId).status, 'acknowledged');
  assert.equal(eventsFor(store, tripId, 'TaskAcknowledged').length, 1);
  assert.equal(eventsFor(store, tripId, 'TaskEscalated').length, 0);
});

test('assumir uma escalada preserva evidência na entrega e descarga congela a espera', () => {
  const { store, tripId, original } = arrivedFixture(0);
  tick(store, 60);
  const task = taskByTrip(store, tripId);
  assert.equal(task.status, 'escalated');
  state(store).acknowledge(task.id);
  state(store).acknowledge(task.id);
  assert.equal(taskByTrip(store, tripId).status, 'acknowledged');
  assert.equal(taskByTrip(store, tripId).escalatedAtMin, task.createdAtMin + 60);
  assert.equal(eventsFor(store, tripId, 'TaskAcknowledged').length, 1);
  store.setState({ trips: state(store).trips.map((trip) => trip.id === tripId ? { ...trip, unloadAtMin: state(store).simMinutes + 1 } : trip) });
  tick(store, 1);
  const delivery = state(store).history.find((row) => row.tripId === tripId);
  const unloadedAt = tripById(store, tripId).unloadedAtMin;
  assert.equal(delivery.escalated, true);
  assert.equal(delivery.ccoActionMin, 60);
  assert.equal(delivery.waitMin, unloadedAt - task.createdAtMin);
  assert.equal(taskByTrip(store, tripId).status, 'closed');
  assert.equal(taskByTrip(store, tripId).closedAtMin, unloadedAt);
  tick(store, 29);
  assert.equal(tripById(store, tripId).phase, 'unloaded');
  assert.equal(tripById(store, tripId).unloadedAtMin, unloadedAt);
  assert.equal(state(store).history.filter((row) => row.tripId === tripId).length, 1);
  tick(store, 1);
  const next = state(store).trips.find((trip) => trip.vehicleId === original.vehicleId);
  assert.notEqual(next.id, tripId);
  assert.equal(next.phase, 'driving');
  assert.equal(next.plate, original.plate);
  assert.equal(next.driver, original.driver);
  assert.equal(next.capacityTons, original.capacityTons);
  assert.equal(state(store).tripMeta[tripId].plate, original.plate);
  assert.equal(state(store).calls.find((call) => call.tripId === tripId).plate, original.plate);
  assert.equal(eventsFor(store, tripId, 'UnloadConfirmed').length, 1);
});

test('descarga no instante do aviso impede escalada ou ligação tardia', () => {
  const { store, tripId } = arrivedFixture(0);
  const task = taskByTrip(store, tripId);
  store.setState({ trips: state(store).trips.map((trip) => trip.id === tripId ? { ...trip, unloadAtMin: task.createdAtMin + 20 } : trip) });
  tick(store, 20);
  assert.equal(tripById(store, tripId).phase, 'unloaded');
  assert.equal(eventsFor(store, tripId, 'TaskEscalated').length, 0);
  assert.equal(state(store).calls.filter((call) => call.tripId === tripId).length, 0);
});

test('pausa bloqueia todo avanço; parâmetros inválidos não movem o relógio', () => {
  const store = createOpsStore({ startDate });
  state(store).toggle();
  const paused = state(store);
  tick(store, 120);
  assert.strictEqual(state(store), paused);
  state(store).toggle();
  for (const invalid of [0, -1, NaN, Infinity]) tick(store, invalid);
  assert.equal(state(store).simMinutes, 0);
  tick(store, 1);
  assert.equal(state(store).simMinutes, 1);
});

test('eventos usam horário simulado e aproximação/chegada são únicas por viagem', () => {
  const store = createOpsStore({ startDate, operatorResponsiveness: 0 });
  const lastArrivalMin = Math.ceil(Math.max(...state(store).trips.map((trip) => trip.routeKm * (1 - trip.progress) * 60 / SIMULATION.speedKmh)));
  tick(store, lastArrivalMin);
  const base = new Date(startDate);
  base.setHours(8, 0, 0, 0);
  for (const event of state(store).feed) {
    assert.equal(Date.parse(event.occurredAt), base.getTime() + event.simMin * 60_000);
    assert.equal(event.receivedAt, event.occurredAt);
    assert.equal(event.payload.plate, state(store).tripMeta[event.tripId].plate);
  }
  for (const trip of state(store).trips) {
    assert.equal(eventsFor(store, trip.id, 'ApproachDetected').length, 1);
    assert.equal(eventsFor(store, trip.id, 'ArrivalRegistered').length, 1);
    assert.equal(eventsFor(store, trip.id, 'TaskCreated').length, 1);
    const approach = state(store).calls.filter((call) => call.tripId === trip.id && call.moment === 'approach');
    assert.equal(approach.length, 1);
    assert.equal(trip.notifiedBeforeArrival, approach[0].answered && approach[0].atMin < trip.arrivedAtMin);
  }
});

test('tentativa sem atendimento não equivale a aviso efetivo; amanhã é registrado', () => {
  const trip = { plate: 'ABC1D23', driver: 'Motorista A', receiverId: 'r1' };
  const base = { id: 'test-call', tripId: 'test-trip', trip, receiver: RECEIVERS[0], moment: 'approach', atMin: 5 };
  const noAnswer = buildCall({ ...base, random: () => 0.99 });
  assert.equal(noAnswer.answered, false);
  assert.equal(noAnswer.resultCode, 'no_answer');
  assert.equal(noAnswer.transcript.length, 1);
  const nextDay = buildCall({ ...base, random: () => 0 });
  assert.equal(nextDay.answered, true);
  assert.equal(nextDay.resultCode, 'next_day');
  assert.equal(nextDay.transcript[1].messageKey, 'calls.transcript.nextDay');
  assert.equal(nextDay.dock, undefined);
  const dockConfirmed = buildCall({ ...base, random: () => 0.5 });
  assert.equal(dockConfirmed.resultCode, 'dock_confirmed');
  assert.ok(dockConfirmed.dock >= 1 && dockConfirmed.dock <= 6);
});

test('ocorrência de fila só é gerada enquanto existe caminhão esperando', () => {
  const empty = createOpsStore({ startDate });
  empty.setState({ trips: state(empty).trips.map((trip) => ({ ...trip, phase: 'unloaded', unloadedAtMin: 100_000 })) });
  tick(empty, 300);
  assert.equal(state(empty).feed.filter((event) => event.type === 'OccurrenceCreated').length, 0);
  const { store, tripId } = arrivedFixture(0);
  tick(store, 300);
  const occurrences = state(store).feed.filter((event) => event.type === 'OccurrenceCreated');
  assert.ok(occurrences.length > 0);
  assert.ok(occurrences.every((event) => event.tripId === tripId && event.payload.messageKey === 'occurrences.gateQueue'));
});

test('ciclos repetidos preservam veículos, IDs únicos e feed limitado', () => {
  const store = createOpsStore({ startDate, operatorResponsiveness: 0 });
  const identities = new Map(state(store).trips.map((trip) => [trip.vehicleId, { plate: trip.plate, driver: trip.driver }]));
  tick(store, 1200);
  assert.equal(state(store).trips.length, 8);
  assert.equal(state(store).feed.length, 200);
  assert.ok(state(store).history.length > 63);
  for (const trip of state(store).trips) assert.deepEqual({ plate: trip.plate, driver: trip.driver }, identities.get(trip.vehicleId));
  for (const rows of [state(store).feed, state(store).calls]) assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.equal(new Set(state(store).history.map((row) => row.tripId)).size, state(store).history.length);
  assert.equal(new Set(state(store).feed.map((row) => row.idempotencyKey)).size, state(store).feed.length);
  assert.ok(state(store).calls.every((call) => state(store).tripMeta[call.tripId].plate === call.plate));
  const newDay = state(store).history.filter((delivery) => delivery.day > 0);
  assert.ok(newDay.length > 0, 'entregas após a meia-noite usam outro dia');
});

test('formatadores respeitam idioma, centavos de BRL e virada do relógio', () => {
  assert.ok(brl(35, 'pt-BR').includes('35,00'));
  assert.ok(brl(35, 'en').includes('35.00'));
  assert.equal(hhmm(361, 'pt-BR'), '6h01');
  assert.equal(hhmm(361, 'en'), '6h 01m');
  assert.equal(pct(0.5, 'en'), '50%');
  assert.equal(clock(0), '08:00');
  assert.equal(clock(960), '00:00');
  assert.equal(clock(-1440), '08:00');
  assert.equal(clock(-481), '23:59');
});

test('chaves semânticas das transcrições e resultados existem em PT e EN', async () => {
  const locales = await Promise.all(['pt-BR', 'en'].map(async (locale) => JSON.parse(await readFile(new URL(`../src/assets/locales/${locale}.json`, import.meta.url), 'utf8'))));
  const valueAt = (locale, key) => key.split('.').reduce((current, segment) => current?.[segment], locale);
  const calls = buildHistoricalData().calls;
  const keys = new Set([
    ...calls.flatMap((call) => call.transcript.map((line) => line.messageKey)),
    ...['dock_confirmed', 'next_day', 'no_answer'].map((result) => `calls.results.${result}`),
    'channels.push', 'channels.panel', 'channels.call', 'occurrences.gateQueue',
  ]);
  for (const locale of locales) {
    for (const key of keys) assert.equal(typeof valueAt(locale, key), 'string', `tradução ausente: ${key}`);
  }
});

test('rota vazia, ponto único e percurso sem distância têm resultados definidos', () => {
  const empty = createRoutePath([]);
  assert.deepEqual(empty, { points: [], cumulativeKm: [], totalKm: 0 });
  assert.equal(interpolateRoute(empty, 0.5), undefined);
  const point = { lat: -22.9, lng: -47.1 };
  const single = createRoutePath([point]);
  assert.deepEqual(single.cumulativeKm, [0]);
  assert.equal(single.totalKm, 0);
  for (const progress of [0, 0.5, 1]) assert.deepEqual(interpolateRoute(single, progress), point);
  const repeated = createRoutePath([point, point, point]);
  assert.deepEqual(repeated.cumulativeKm, [0, 0, 0]);
  assert.equal(repeated.totalKm, 0);
  assert.deepEqual(interpolateRoute(repeated, 0.5), point);
});

test('posição na rota segue distância acumulada em vez do índice dos pontos', () => {
  const path = createRoutePath([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 4 }]);
  assert.ok(Math.abs(path.totalKm - 444.77970657823494) < 1e-9);
  assert.ok(Math.abs(path.cumulativeKm[1] / path.totalKm - 0.25) < 1e-12);
  for (const [progress, longitude] of [[0.125, 0.5], [0.25, 1], [0.5, 2], [0.75, 3]]) {
    const position = interpolateRoute(path, progress);
    assert.equal(position.lat, 0);
    assert.ok(Math.abs(position.lng - longitude) < 1e-9);
  }
});

test('progresso fora dos limites retorna a origem ou o destino da rota', () => {
  const points = [{ lat: -22.9, lng: -47.1 }, { lat: -23, lng: -47.2 }];
  const path = createRoutePath(points);
  for (const progress of [-Infinity, -1, 0, NaN]) assert.deepEqual(interpolateRoute(path, progress), points[0]);
  for (const progress of [1, 2, Infinity]) assert.deepEqual(interpolateRoute(path, progress), points[1]);
});

test('segmentos duplicados não deslocam posições nem produzem coordenadas inválidas', () => {
  const path = createRoutePath([
    { lat: 0, lng: 0 }, { lat: 0, lng: 0 }, { lat: 0, lng: 1 },
    { lat: 0, lng: 1 }, { lat: 0, lng: 4 }, { lat: 0, lng: 4 },
  ]);
  assert.equal(path.cumulativeKm[0], path.cumulativeKm[1]);
  assert.equal(path.cumulativeKm[2], path.cumulativeKm[3]);
  assert.equal(path.cumulativeKm[4], path.cumulativeKm[5]);
  for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
    const position = interpolateRoute(path, progress);
    assert.ok(Number.isFinite(position.lat) && Number.isFinite(position.lng));
    assert.ok(Math.abs(position.lng - progress * 4) < 1e-9);
  }
});

test('geometria original, caminho e posições retornadas não compartilham mutações', () => {
  const points = [{ lat: -22.9, lng: -47.1 }, { lat: -23, lng: -47.2 }];
  const original = structuredClone(points);
  const path = createRoutePath(points);
  points[0].lat = 99;
  assert.deepEqual(path.points, original);
  const before = structuredClone(path);
  const origin = interpolateRoute(path, 0);
  const middle = interpolateRoute(path, 0.5);
  const destination = interpolateRoute(path, 1);
  origin.lat = 98;
  middle.lat = 97;
  destination.lat = 96;
  assert.deepEqual(path, before);
  assert.deepEqual(points, [{ lat: 99, lng: -47.1 }, original[1]]);
  const frozen = Object.freeze(original.map((point) => Object.freeze(point)));
  assert.deepEqual(createRoutePath(frozen).points, original);
});

test('consultas da mesma rota compartilham promessa e preservam a geometria numérica', async () => {
  const origin = { lat: 0, lng: 10 };
  const destination = { lat: 0, lng: 13 };
  const points = [origin, { lat: 0, lng: 11 }, destination];
  const polylines = [{ id: 'fixture-polyline' }];
  let resolveRequest;
  let queries = 0;
  const route = {
    path: points,
    createPolylines() {
      assert.strictEqual(this, route);
      return polylines;
    },
  };
  const api = {
    Route: {
      computeRoutes(request) {
        queries += 1;
        assert.deepEqual(request.origin, origin);
        assert.deepEqual(request.destination, destination);
        return new Promise((resolve) => { resolveRequest = resolve; });
      },
    },
  };
  const first = getRoadRoute(api, origin, destination);
  const shared = getRoadRoute(api, { ...origin }, { ...destination });
  assert.strictEqual(shared, first);
  assert.equal(queries, 1);
  resolveRequest({ routes: [route] });
  const result = await first;
  assert.deepEqual(result.geometry.points, points);
  assert.equal(result.geometry.cumulativeKm.length, points.length);
  assert.ok(Math.abs(result.geometry.totalKm - 333.5847799336762) < 1e-9);
  assert.ok(Math.abs(interpolateRoute(result.geometry, 0.5).lng - 11.5) < 1e-9);
  assert.strictEqual(result.createPolylines(), polylines);
  assert.strictEqual(getRoadRoute(api, origin, destination), first);
  assert.equal(queries, 1);
  points[1].lng = 99;
  assert.equal(result.geometry.points[1].lng, 11);
});

test('falha de consulta sai do cache e permite uma nova tentativa compartilhada', async () => {
  const origin = { lat: 1, lng: 10 };
  const destination = { lat: 1, lng: 11 };
  let queries = 0;
  const api = {
    Route: {
      async computeRoutes() {
        queries += 1;
        if (queries === 1) throw new Error('fixture_route_unavailable');
        return { routes: [{ path: [origin, destination], createPolylines: () => [] }] };
      },
    },
  };
  const failed = getRoadRoute(api, origin, destination);
  assert.strictEqual(getRoadRoute(api, origin, destination), failed);
  await assert.rejects(failed, /fixture_route_unavailable/);
  const retried = getRoadRoute(api, origin, destination);
  assert.notStrictEqual(retried, failed);
  assert.strictEqual(getRoadRoute(api, origin, destination), retried);
  assert.deepEqual((await retried).geometry.points, [origin, destination]);
  assert.equal(queries, 2);
});

test('cache distingue tanto a origem quanto o destino da consulta', async () => {
  const firstOrigin = { lat: 4, lng: 10 };
  const secondOrigin = { lat: 4, lng: 11 };
  const firstDestination = { lat: 4, lng: 12 };
  const secondDestination = { lat: 4, lng: 13 };
  let queries = 0;
  const api = {
    Route: {
      async computeRoutes({ origin, destination }) {
        queries += 1;
        return { routes: [{ path: [origin, destination], createPolylines: () => [] }] };
      },
    },
  };
  const first = getRoadRoute(api, firstOrigin, firstDestination);
  const otherOrigin = getRoadRoute(api, secondOrigin, firstDestination);
  const otherDestination = getRoadRoute(api, firstOrigin, secondDestination);
  assert.notStrictEqual(otherOrigin, first);
  assert.notStrictEqual(otherDestination, first);
  assert.equal(queries, 3);
  const results = await Promise.all([first, otherOrigin, otherDestination]);
  assert.deepEqual(results.map((result) => result.geometry.points), [
    [firstOrigin, firstDestination], [secondOrigin, firstDestination], [firstOrigin, secondDestination],
  ]);
});

test('resposta sem percurso utilizável não fica presa no cache', async () => {
  for (const [index, unavailable] of [{ routes: [] }, { routes: [{ path: [{ lat: 2, lng: 10 }] }] }].entries()) {
    const origin = { lat: 2 + index, lng: 10 };
    const destination = { lat: 2 + index, lng: 11 };
    let queries = 0;
    const api = {
      Route: {
        async computeRoutes() {
          queries += 1;
          return queries === 1 ? unavailable : { routes: [{ path: [origin, destination], createPolylines: () => [] }] };
        },
      },
    };
    await assert.rejects(getRoadRoute(api, origin, destination), /google_maps_route_missing/);
    assert.deepEqual((await getRoadRoute(api, origin, destination)).geometry.points, [origin, destination]);
    assert.equal(queries, 2);
  }
});

test('SDK sem chave rejeita antes de acessar o navegador ou carregar recursos', async () => {
  const descriptors = new Map(['window', 'document'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const name of descriptors.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { assert.fail('carga sem chave não deve acessar o navegador'); },
      });
    }
    await assert.rejects(loadGoogleMaps('  ', 'pt-BR'), /google_maps_key_missing/);
    await assert.rejects(loadTrackingMaps('  ', 'pt-BR'), /google_maps_key_missing/);
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('SDK compartilha script, permite retry após erro e limpa timers ao concluir', async () => {
  const descriptors = new Map(['window', 'document', 'setTimeout', 'clearTimeout'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Set();
  const scripts = [];
  const target = {};
  const fakeDocument = {
    createElement(tag) {
      assert.equal(tag, 'script');
      return { removed: false, remove() { this.removed = true; } };
    },
    head: { append(script) { scripts.push(script); } },
  };
  const libraries = {
    maps: { Map: class FixtureMap {} },
    marker: { AdvancedMarkerElement: class FixtureMarker {} },
    routes: { Route: { computeRoutes: async () => ({ routes: [] }) } },
  };
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
    globalThis.setTimeout = (...args) => {
      const timer = nativeSetTimeout(...args);
      timers.add(timer);
      return timer;
    };
    globalThis.clearTimeout = (timer) => { timers.delete(timer); return nativeClearTimeout(timer); };

    const first = loadGoogleMaps('fixture-key-without-service', 'pt-BR');
    const second = loadGoogleMaps('fixture-key-without-service', 'pt-BR');
    const failures = Promise.all([
      assert.rejects(first, /google_maps_load_failed/),
      assert.rejects(second, /google_maps_load_failed/),
    ]);
    assert.equal(scripts.length, 1);
    assert.equal(timers.size, 1);
    assert.equal(scripts[0].async, true);
    scripts[0].onerror();
    await failures;
    assert.equal(scripts[0].removed, true);
    assert.equal(timers.size, 0);
    assert.equal(target.__avisaiMapsReady, undefined);

    const retried = loadGoogleMaps('fixture-key-without-service', 'en');
    // Uma falha posterior de asserção também não deve deixar rejeições sem tratamento.
    retried.catch(() => {});
    assert.equal(scripts.length, 2);
    assert.equal(timers.size, 1);
    assert.equal(new URL(scripts[1].src).searchParams.get('language'), 'en');
    target.google = { maps: { importLibrary: async (name) => libraries[name] } };
    target.__avisaiMapsReady();
    const loaded = await retried;
    assert.strictEqual(loaded.Map, libraries.maps.Map);
    assert.strictEqual(loaded.AdvancedMarkerElement, libraries.marker.AdvancedMarkerElement);
    assert.strictEqual(loaded.Route, libraries.routes.Route);
    assert.equal(timers.size, 0);
    assert.equal(target.__avisaiMapsReady, undefined);
    assert.strictEqual((await loadGoogleMaps('fixture-key-without-service', 'en')).Map, loaded.Map);
    assert.equal(scripts.length, 2);
  } finally {
    scripts.forEach((script) => script.onerror?.());
    for (const timer of timers) nativeClearTimeout(timer);
    // Restaura as propriedades globais para não interferir nos demais testes.
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('tracking compartilha o SDK e importa apenas mapa e marcador, inclusive com Google já presente', async () => {
  const descriptors = new Map(['window', 'document', 'setTimeout', 'clearTimeout'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Set();
  const scripts = [];
  const imports = [];
  const libraries = {
    maps: { Map: class FixtureMap {}, Polyline: class FixturePolyline {} },
    marker: { AdvancedMarkerElement: class FixtureMarker {} },
  };
  const sdk = {
    async importLibrary(name) {
      imports.push(name);
      assert.ok(name === 'maps' || name === 'marker', 'tracking não importa a biblioteca routes');
      return libraries[name];
    },
    Route: { computeRoutes() { assert.fail('tracking não consulta a Routes API'); } },
  };
  const target = {};
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement(tag) {
          assert.equal(tag, 'script');
          return { remove() {} };
        },
        head: { append(script) { scripts.push(script); } },
      },
    });
    globalThis.setTimeout = (...args) => {
      const timer = nativeSetTimeout(...args);
      timers.add(timer);
      return timer;
    };
    globalThis.clearTimeout = (timer) => { timers.delete(timer); return nativeClearTimeout(timer); };
    const first = loadTrackingMaps('fixture-tracking-without-service', 'pt-BR');
    const shared = loadTrackingMaps('fixture-tracking-without-service', 'pt-BR');
    first.catch(() => {});
    shared.catch(() => {});
    assert.equal(scripts.length, 1);
    assert.equal(timers.size, 1);
    target.google = { maps: sdk };
    target.__avisaiMapsReady();
    const loaded = await Promise.all([first, shared]);
    assert.equal(timers.size, 0);
    assert.equal(target.__avisaiMapsReady, undefined);
    for (const result of loaded) {
      assert.strictEqual(result.Map, libraries.maps.Map);
      assert.strictEqual(result.Polyline, libraries.maps.Polyline);
      assert.strictEqual(result.AdvancedMarkerElement, libraries.marker.AdvancedMarkerElement);
      assert.equal(Object.hasOwn(result, 'Route'), false);
    }
    assert.deepEqual(imports, ['maps', 'marker', 'maps', 'marker']);
    imports.length = 0;
    await loadTrackingMaps('fixture-tracking-without-service', 'en');
    assert.deepEqual(imports, ['maps', 'marker']);
    assert.equal(scripts.length, 1, 'SDK carregado é reutilizado');

    // O mesmo teardown de erro público limpa o cache antes do cenário Google pré-carregado.
    scripts[0].onerror();
    const existingImports = [];
    const existingSdk = {
      async importLibrary(name) {
        existingImports.push(name);
        assert.ok(name === 'maps' || name === 'marker');
        return libraries[name];
      },
    };
    target.google = { maps: existingSdk };
    imports.length = 0;
    const existing = await loadTrackingMaps('fixture-tracking-without-service', 'en');
    assert.strictEqual(existing.Map, libraries.maps.Map);
    assert.deepEqual(existingImports, ['maps', 'marker']);
    assert.deepEqual(imports, []);
    assert.equal(scripts.length, 1, 'Google presente não cria outro script');
    assert.equal(timers.size, 0);
  } finally {
    scripts.forEach((script) => script.onerror?.());
    for (const timer of timers) nativeClearTimeout(timer);
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('cinco rotas locais registram estradas OSRM, destino e atribuição verificáveis', () => {
  assert.deepEqual(Object.keys(MOCK_ROAD_ROUTES), RECEIVERS.map((receiver) => receiver.id));
  for (const receiver of RECEIVERS) {
    const fixture = MOCK_ROAD_ROUTES[receiver.id];
    const path = getMockRoadRoute(receiver.id);
    assert.deepEqual(fixture.requestedOrigin, ORIGIN);
    assert.deepEqual(fixture.requestedDestination, receiver.position);
    assert.deepEqual(path.points[0], fixture.snappedOrigin);
    assert.deepEqual(path.points.at(-1), fixture.snappedDestination);
    assert.ok(distanceKm(ORIGIN, path.points[0]) * 1000 < 50);
    assert.ok(distanceKm(receiver.position, path.points.at(-1)) * 1000 < 50);
    assert.ok(path.points.length > 100, 'a estrada conserva a geometria obtida do provedor');
    assert.ok(path.totalKm > distanceKm(ORIGIN, receiver.position) * 1.1);
    assert.ok(Math.abs(path.totalKm / fixture.distanceKm - 1) < 0.01, 'haversine dos segmentos se aproxima da distância de fonte');
    assert.ok(path.points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
    assert.ok(path.points.slice(1).every((point, index) => distanceKm(path.points[index], point) < 1));
    assert.equal(fixture.provider, 'OSRM');
    assert.equal(fixture.dataSource, 'OpenStreetMap');
    assert.match(fixture.attribution, /OpenStreetMap contributors/);
    assert.match(fixture.attributionUrl, /openstreetmap\.org\/copyright/);
    const source = new URL(fixture.sourceUrl);
    assert.equal(source.hostname, 'router.project-osrm.org');
    assert.equal(source.searchParams.get('geometries'), 'geojson');
    assert.equal(source.searchParams.get('overview'), 'full');
    assert.strictEqual(getMockRoadRoute(receiver.id), path);
  }
  assert.throws(() => getMockRoadRoute('receiver-unknown'), /Unknown mock road route/);
});

test('mutações externas dos snapshots não corrompem coordenadas, distância ou posição do motor', () => {
  const path = getMockRoadRoute('r1');
  const fixture = MOCK_ROAD_ROUTES.r1;
  const original = structuredClone(path);
  const store = createOpsStore({ startDate });
  const trip = state(store).trips[0];
  for (const mutate of [
    () => { path.points[0].lat = 90; },
    () => { path.points.push({ lat: 0, lng: 0 }); },
    () => { path.cumulativeKm[1] = -1; },
    () => { path.totalKm = 1; },
    () => { fixture.points[0].lng = 180; },
    () => { fixture.snappedOrigin.lat = 0; },
    () => { fixture.requestedDestination.lng = 0; },
    () => { MOCK_ROAD_ROUTES.r1 = {}; },
  ]) assert.throws(mutate, TypeError);
  assert.deepEqual(getMockRoadRoute('r1'), original);
  tick(store, 1);
  const next = tripById(store, trip.id);
  assert.equal(next.routeKm, original.totalKm);
  assert.deepEqual(next.position, interpolateRoute(original, next.progress));
  assert.ok(Math.abs(next.routeKm * (next.progress - trip.progress) - SIMULATION.speedKmh / 60) < 1e-10);
});

test('rota percorrida e restante encontram o mesmo ponto sem lacunas ou mutações', () => {
  const path = getMockRoadRoute('r2');
  const original = structuredClone(path);
  for (const progress of [0.01, 0.25, 0.5, 0.93]) {
    const split = splitRoute(path, progress);
    assert.deepEqual(split.traveled.at(-1), split.position);
    assert.deepEqual(split.remaining[0], split.position);
    assert.deepEqual(split.position, interpolateRoute(path, progress));
    assert.deepEqual(split.traveled[0], path.points[0]);
    assert.deepEqual(split.remaining.at(-1), path.points.at(-1));
    const traveledKm = createRoutePath(split.traveled).totalKm;
    const remainingKm = createRoutePath(split.remaining).totalKm;
    assert.ok(Math.abs(traveledKm - path.totalKm * progress) < 1e-5);
    assert.ok(Math.abs(traveledKm + remainingKm - path.totalKm) < 1e-5);
    split.traveled[0].lat = 90;
    split.remaining.at(-1).lng = 180;
    split.position.lat = -90;
    assert.deepEqual(path, original);
  }
});

test('divisão da rota limita progresso e trata caminhos vazios, pontos e duplicatas', () => {
  assert.deepEqual(splitRoute(createRoutePath([]), 0.5), { traveled: [], remaining: [], position: undefined });
  const start = { lat: 0, lng: 0 };
  const middle = { lat: 0, lng: 1 };
  const end = { lat: 0, lng: 4 };
  const path = createRoutePath([start, start, middle, middle, end, end]);
  for (const progress of [-Infinity, -1, 0, NaN]) {
    const split = splitRoute(path, progress);
    assert.deepEqual(split.traveled, [start]);
    assert.deepEqual(split.remaining, path.points);
    assert.deepEqual(split.position, start);
  }
  for (const progress of [1, 2, Infinity]) {
    const split = splitRoute(path, progress);
    assert.deepEqual(split.traveled, path.points);
    assert.deepEqual(split.remaining, [end]);
    assert.deepEqual(split.position, end);
  }
  const atVertex = splitRoute(path, path.cumulativeKm[2] / path.totalKm);
  assert.deepEqual(atVertex.position, middle);
  assert.deepEqual(atVertex.traveled.at(-1), atVertex.remaining[0]);
  assert.equal(createRoutePath(atVertex.traveled).totalKm + createRoutePath(atVertex.remaining).totalKm, path.totalKm);
  for (const progress of [0, 0.5, 1]) {
    const single = splitRoute(createRoutePath([start]), progress);
    assert.deepEqual(single.traveled, [start]);
    assert.deepEqual(single.remaining, [start]);
    assert.deepEqual(single.position, start);
  }
});

test('heading acompanha a direção da estrada, incluindo virada e segmento final', () => {
  const origin = { lat: 0, lng: 0 };
  for (const [destination, expected] of [
    [{ lat: 1, lng: 0 }, 0], [{ lat: 0, lng: 1 }, 90],
    [{ lat: -1, lng: 0 }, 180], [{ lat: 0, lng: -1 }, 270],
  ]) {
    const path = createRoutePath([origin, origin, destination, destination]);
    for (const progress of [-1, 0, 0.5, 1, 2, NaN]) assert.equal(getRouteHeading(path, progress), expected);
  }
  const turn = createRoutePath([origin, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }]);
  assert.equal(getRouteHeading(turn, 0.25), 90);
  assert.equal(getRouteHeading(turn, turn.cumulativeKm[1] / turn.totalKm), 0);
  assert.equal(getRouteHeading(turn, 1), 0);
  assert.equal(getRouteHeading(createRoutePath([]), 0), undefined);
  assert.equal(getRouteHeading(createRoutePath([origin, origin]), 0.5), undefined);
});

test('tracking em uma nova rota começa na origem sem herdar posição ou direção', () => {
  const first = createRoutePath([{ lat: 0, lng: 0 }, { lat: 0, lng: 4 }]);
  const next = createRoutePath([{ lat: 10, lng: 20 }, { lat: 11, lng: 20 }]);
  assert.deepEqual(getTrackingPosition(first, 1), { position: { lat: 0, lng: 4 }, heading: 90 });
  assert.deepEqual(getTrackingPosition(next, 0), { position: { lat: 10, lng: 20 }, heading: 0 });
  assert.deepEqual(getTrackingPosition(createRoutePath([]), 0), { position: undefined, heading: undefined });
});

test('motor avança 70 km/h ao longo das estradas e mantém ETA pela distância restante', () => {
  const store = createOpsStore({ startDate });
  const initial = structuredClone(state(store).trips);
  tick(store, 1);
  for (const trip of state(store).trips) {
    const before = initial.find((candidate) => candidate.id === trip.id);
    const path = getMockRoadRoute(trip.receiverId);
    assert.equal(trip.routeKm, path.totalKm);
    assert.deepEqual(before.position, interpolateRoute(path, before.progress));
    assert.deepEqual(trip.position, interpolateRoute(path, trip.progress));
    assert.ok(Math.abs(trip.routeKm * (trip.progress - before.progress) - SIMULATION.speedKmh / 60) < 1e-10);
    const beforeEta = before.routeKm * (1 - before.progress) * 60 / SIMULATION.speedKmh;
    const afterEta = trip.routeKm * (1 - trip.progress) * 60 / SIMULATION.speedKmh;
    assert.ok(Math.abs(beforeEta - afterEta - 1) < 1e-10);
  }
});

test('novo ciclo usa a estrada do destinatário atual e reinicia o progresso', () => {
  const { store, tripId, original } = arrivedFixture(1);
  store.setState({ trips: state(store).trips.map((trip) => trip.id === tripId ? { ...trip, unloadAtMin: 2 } : trip) });
  tick(store, 1);
  tick(store, 30);
  const next = state(store).trips.find((trip) => trip.vehicleId === original.vehicleId);
  const path = getMockRoadRoute(next.receiverId);
  assert.notEqual(next.id, tripId);
  assert.equal(next.progress, 0);
  assert.equal(next.routeKm, path.totalKm);
  assert.deepEqual(next.position, path.points[0]);
  assert.deepEqual({ plate: next.plate, driver: next.driver }, { plate: original.plate, driver: original.driver });
  tick(store, 1);
  assert.deepEqual(tripById(store, next.id).position, interpolateRoute(path, tripById(store, next.id).progress));
});

test('chamadas e atividades de outros caminhões não alteram respostas do operador', () => {
  const isolated = arrivedFixture(0.35);
  const busy = arrivedFixture(0.35);
  const originalOthers = state(createOpsStore({ startDate })).trips;
  busy.store.setState({
    trips: state(busy.store).trips.map((trip, index) => index === 0 ? trip : originalOthers[index]),
  });
  tick(isolated.store, 60);
  tick(busy.store, 60);
  assert.ok(state(busy.store).calls.length > state(isolated.store).calls.length);
  const taskResult = (store, tripId) => {
    const task = taskByTrip(store, tripId);
    return { attempts: task.attempts, status: task.status, acknowledgedAtMin: task.acknowledgedAtMin, escalatedAtMin: task.escalatedAtMin };
  };
  assert.deepEqual(taskResult(isolated.store, isolated.tripId), taskResult(busy.store, busy.tripId));
  const eventResult = (store, tripId) => state(store).feed
    .filter((event) => event.tripId === tripId && ['TaskCreated', 'TaskAcknowledged', 'TaskEscalated'].includes(event.type))
    .map((event) => ({ type: event.type, simMin: event.simMin, payload: event.payload }));
  assert.deepEqual(eventResult(isolated.store, isolated.tripId), eventResult(busy.store, busy.tripId));
});

test('dossiê fictício reconcilia notas, carga, volumes e valores para 14 e 30 toneladas', () => {
  const base = state(createOpsStore({ startDate })).trips[0];
  for (const capacityTons of [14, 30]) {
    const trip = { ...base, capacityTons };
    const dossier = buildTripDossier(trip);
    assert.equal(dossier.fictitious, true);
    assert.equal(dossier.tripId, trip.id);
    assert.equal(dossier.totalWeightKg, capacityTons * 1000);
    assert.ok(dossier.invoices.length > 0 && dossier.cargoItems.length > 0);
    assert.equal(dossier.invoices.reduce((total, invoice) => total + invoice.totalWeightKg, 0), dossier.totalWeightKg);
    assert.equal(dossier.invoices.reduce((total, invoice) => total + invoice.totalPackageCount, 0), dossier.totalPackageCount);
    assert.equal(dossier.invoices.reduce((total, invoice) => total + invoice.totalValueBRL, 0), dossier.totalValueBRL);
    const itemIds = [];
    for (const invoice of dossier.invoices) {
      assert.equal(invoice.status, 'simulated');
      assert.equal(invoice.receiverId, trip.receiverId);
      assert.match(invoice.issuedOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(invoice.totalWeightKg, invoice.cargoItems.reduce((total, item) => total + item.weightKg, 0));
      assert.equal(invoice.totalPackageCount, invoice.cargoItems.reduce((total, item) => total + item.packageCount, 0));
      assert.equal(invoice.totalValueBRL, invoice.cargoItems.reduce((total, item) => total + item.totalValueBRL, 0));
      for (const item of invoice.cargoItems) {
        itemIds.push(item.id);
        assert.ok(Number.isInteger(item.packageCount) && item.packageCount > 0);
        assert.equal(item.weightKg, item.unitWeightKg * item.packageCount);
        assert.equal(item.totalValueBRL, item.unitValueBRL * item.packageCount);
      }
    }
    assert.deepEqual(itemIds.sort(), dossier.cargoItems.map((item) => item.id).sort());
    assert.equal(new Set(itemIds).size, itemIds.length);
  }
});

test('documentos são estáveis durante a viagem e mudam de identidade no próximo ciclo', () => {
  const trip = state(createOpsStore({ startDate })).trips[0];
  const before = structuredClone(trip);
  const first = buildTripDossier(trip);
  assert.deepEqual(buildTripDossier({ ...trip, progress: 1, phase: 'unloaded', unloadedAtMin: 400 }), first);
  assert.deepEqual(trip, before);
  first.cargoItems[0].weightKg = -1;
  assert.equal(buildTripDossier(trip).totalWeightKg, trip.capacityTons * 1000);
  const next = buildTripDossier({ ...trip, id: `${trip.id}-next`, receiverId: 'r2' });
  assert.notEqual(next.tripId, first.tripId);
  assert.ok(next.invoices.every((invoice) => !first.invoices.some((previous) => previous.id === invoice.id)));
  assert.ok(next.invoices.every((invoice) => invoice.receiverId === 'r2'));
});

test('comunicações do dossiê usam somente a viagem atual e evidências disponíveis no relógio', async () => {
  const { store, tripId } = arrivedFixture(0);
  tick(store, 60);
  const trip = tripById(store, tripId);
  const future = { ...state(store).feed[0], id: 'future-event', tripId, simMin: 100, type: 'UnloadConfirmed' };
  const unrelated = { ...future, id: 'other-trip-event', tripId: 'other-trip', simMin: 2 };
  const events = [...state(store).feed, future, unrelated];
  const unchanged = structuredClone(events);
  const communications = buildTripCommunications(trip, events, state(store).simMinutes);
  assert.deepEqual(buildTripCommunications(trip, events, state(store).simMinutes), communications);
  assert.ok(communications.every((entry) => entry.fictitious && entry.tripId === tripId && entry.atMin <= state(store).simMinutes));
  assert.equal(new Set(communications.map((entry) => entry.id)).size, communications.length);
  assert.ok(!communications.some((entry) => entry.id.includes('future-event') || entry.id.includes('other-trip-event')));
  assert.ok(communications.some((entry) => entry.messageKey === 'dossier.messages.taskEscalated'));
  assert.ok(communications.some((entry) => entry.messageKey === 'dossier.messages.atGate'));
  assert.ok(!communications.some((entry) => entry.messageKey === 'dossier.messages.unloaded'));
  const completed = buildTripCommunications({ ...trip, phase: 'unloaded', unloadedAtMin: 70 }, events, 70);
  assert.ok(completed.some((entry) => entry.messageKey === 'dossier.messages.unloaded' && entry.atMin === 70));
  assert.deepEqual(events, unchanged);
  const locales = await Promise.all(['pt-BR', 'en'].map(async (locale) => JSON.parse(await readFile(new URL(`../src/assets/locales/${locale}.json`, import.meta.url), 'utf8'))));
  const dossier = buildTripDossier(trip);
  const keys = new Set([
    ...completed.flatMap((entry) => [entry.titleKey, entry.messageKey].filter(Boolean)),
    ...dossier.cargoItems.map((item) => item.descriptionKey),
    ...dossier.invoices.map((invoice) => invoice.originNameKey),
  ]);
  for (const locale of locales) {
    for (const key of keys) assert.equal(typeof key.split('.').reduce((value, segment) => value?.[segment], locale), 'string', key);
  }
});
