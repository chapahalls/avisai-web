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
    trip({ id: 't-wait', phase: 'waiting', arrivedAtMin: 0 }),
    trip({ id: 't-route' }),
  ];
  const tasks = [
    { id: 'k1', tripId: 't-route', createdAtMin: 100, attempts: 1, status: 'open' },
    { id: 'k2', tripId: 't-wait', createdAtMin: 50, attempts: 3, status: 'escalated', escalatedAtMin: 200 },
    { id: 'k3', tripId: 't-route', createdAtMin: 10, attempts: 1, status: 'closed' },
  ];
  const alerts = deriveAlerts({ trips, tasks, simMinutes: 6 * 60 });
  // Mesma severidade: o alerta mais antigo vem primeiro (260 min > 60 min).
  assert.deepEqual(alerts.map((alert) => alert.kind), ['escalated', 'noAnswer', 'overFranchise']);
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[2].waitMin, 360);
  assert.equal(alerts[2].sinceMin, 60, 'conta só o tempo além da franquia de 5h');
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
