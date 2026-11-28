import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOperation, deriveAlerts, dockWindows, PLANNED_SLOT_MIN, waitMinutes } from '../.cache/tests/features/monitoring/model.js';
import { SIMULATION } from '../.cache/tests/lib/config.js';

const trip = (overrides) => ({
  id: 'trip-1', vehicleId: 'v1', plate: 'AAA1A11', driver: 'Motorista A', receiverId: 'r1',
  origin: { lat: 0, lng: 0 }, capacityTons: 22, progress: 0.5, routeKm: 70, phase: 'driving',
  position: { lat: 0, lng: 0 }, notifiedBeforeArrival: false, ...overrides,
});

test('alertas: escalada é crítica e vem antes; espera acima da franquia vira alerta alto', () => {
  const trips = [
    trip({ id: 't-escalated', phase: 'waiting', arrivedAtMin: 0 }),
    trip({ id: 't-wait', phase: 'waiting', arrivedAtMin: 0 }),
    trip({ id: 't-route' }),
  ];
  const tasks = [
    // Tentativa 1 (push, prioridade normal): só vira alerta médio, ainda não escalou no painel.
    { id: 'k1', tripId: 't-route', createdAtMin: 100, attempts: 1, status: 'open', priority: 'normal' },
    { id: 'k2', tripId: 't-escalated', createdAtMin: 50, attempts: 3, status: 'escalated', priority: 'critica', escalatedAtMin: 200 },
    { id: 'k3', tripId: 't-route', createdAtMin: 10, attempts: 1, status: 'closed' },
  ];
  const alerts = deriveAlerts({ trips, tasks, simMinutes: 6 * 60 });
  // escalated (crítico) vem primeiro; estadia além da franquia (alto) vem antes de uma Task ainda só no push (médio).
  assert.deepEqual(alerts.map((alert) => alert.kind), ['escalated', 'overFranchise', 'noAnswer']);
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[1].waitMin, 360);
  assert.equal(alerts[1].sinceMin, 60, 'conta só o tempo além da franquia de 5h');
  assert.equal(alerts[2].severity, 'medium');
});

test('alertas: Task em tentativa 2 (painel) soma como alerta alto', () => {
  const trips = [trip({ id: 't-route' })];
  const tasks = [
    { id: 'k1', tripId: 't-route', createdAtMin: 0, attempts: 2, status: 'open', priority: 'alta' },
  ];
  const alerts = deriveAlerts({ trips, tasks, simMinutes: 60 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'high');
});

test('alertas da API: sem posição e sinal desatualizado; Demo não gera alerta de sinal', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const trips = [
    trip({ id: 'a1', source: 'api', positionKnown: false }),
    trip({ id: 'a2', source: 'api', positionKnown: true, lastPositionAt: '2026-11-24T11:45:00Z' }),
    trip({ id: 'd1' }),
  ];
  const alerts = deriveAlerts({ trips, tasks: [], simMinutes: 0 }, now);
  assert.deepEqual(alerts.map((alert) => [alert.tripId, alert.kind, alert.severity]), [
    ['a2', 'staleSignal', 'critical'],
    ['a1', 'noPosition', 'medium'],
  ]);
});

test('alertas: a mesma viagem nunca repete linha na fila, só o alerta mais grave fica', () => {
  const trips = [trip({ id: 't-wait', phase: 'waiting', arrivedAtMin: 0, source: 'api', positionKnown: false })];
  const tasks = [
    { id: 'k1', tripId: 't-wait', createdAtMin: 0, attempts: 3, status: 'escalated', priority: 'critica', escalatedAtMin: 2 },
  ];
  // t-wait gera 3 motivos (Task escalada, estadia além da franquia e posição indisponível), mas é 1 caminhão só.
  const alerts = deriveAlerts({ trips, tasks, simMinutes: 6 * 60 });
  assert.equal(alerts.length, 1, 'uma viagem ocupa só uma linha na fila, mesmo com vários motivos de alerta');
  assert.equal(alerts[0].kind, 'escalated', 'fica o alerta mais grave (crítico) da viagem');
});

test('contagem da operação e espera usam só dados existentes', () => {
  const trips = [
    trip({ id: '1' }),
    trip({ id: '2', phase: 'approaching' }),
    trip({ id: '3', phase: 'waiting', arrivedAtMin: 0 }),
    trip({ id: '4', phase: 'unloaded', arrivedAtMin: 0, unloadedAtMin: 30 }),
    trip({ id: '5', phase: 'waiting', source: 'api' }),
  ];
  assert.deepEqual(countOperation(trips, 400), { active: 4, onRoute: 2, approaching: 1, atReceiver: 2, overFranchise: 1 });
  assert.equal(waitMinutes(trips[3], 400), 30);
  assert.equal(waitMinutes(trips[4], 400), null, 'API sem estadia não inventa espera');
});

test('janelas de doca: espera real em minutos do dia e chegada prevista com duração fixa', () => {
  const offset = SIMULATION.startHour * 60;
  const rows = dockWindows({
    trips: [
      trip({ id: 'w', phase: 'waiting', arrivedAtMin: 60, receiverId: 'r1' }),
      trip({ id: 'p', progress: 0, routeKm: 70, receiverId: 'r1' }),
    ],
    calls: [{ id: 'c', tripId: 'w', receiverId: 'r1', plate: 'X', moment: 'approach', atMin: 50, answered: true, result: '', resultCode: 'dock_confirmed', dock: 3, transcript: [] }],
    simMinutes: 120,
  });
  assert.equal(rows.length, 1);
  const [waiting, planned] = rows[0].bars;
  assert.deepEqual([waiting.kind, waiting.start, waiting.end, waiting.dock], ['waiting', offset + 60, offset + 120, 3]);
  assert.equal(planned.kind, 'planned');
  assert.equal(planned.end - planned.start, PLANNED_SLOT_MIN);
});
