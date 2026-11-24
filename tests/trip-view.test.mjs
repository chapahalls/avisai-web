import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedDock, eventCategory, minuteOfDay, tripStops } from '../.cache/tests/features/trips/model.js';

const trip = (overrides) => ({
  id: 't', vehicleId: 'v', plate: 'AAA1A11', driver: 'Motorista A', receiverId: 'r', origin: { lat: 0, lng: 0 },
  capacityTons: 22, progress: 0.5, routeKm: 70, phase: 'driving', position: { lat: 0, lng: 0 }, notifiedBeforeArrival: true, ...overrides,
});

test('viagem: categorias da linha do tempo seguem quem agiu', () => {
  assert.equal(eventCategory('ArrivalRegistered'), 'stops');
  assert.equal(eventCategory('TaskEscalated'), 'cco');
  assert.equal(eventCategory('ReceiverCallResult'), 'receiver');
  assert.equal(eventCategory('ApproachDetected'), 'agent');
  assert.equal(eventCategory('RouteAssigned'), 'system');
});

test('viagem: paradas trazem a espera real no recebedor e as ocorrências relatadas', () => {
  assert.deepEqual(tripStops(trip({}), 100, []).map((stop) => stop.kind), ['origin']);
  const waiting = tripStops(trip({ phase: 'waiting', arrivedAtMin: 40 }), 100, [60]);
  assert.deepEqual(waiting.map((stop) => [stop.kind, stop.startMin, stop.durationMin]), [['origin', null, null], ['receiver', 40, 60], ['occurrence', 60, null]]);
  const api = tripStops(trip({ source: 'api', phase: 'waiting', stay: { waitMin: 30, valueBRL: 0, franchiseHours: 5, capacityTons: 22 } }), 100, []);
  assert.deepEqual(api[1], { key: 'receiver', kind: 'receiver', startMin: 70, durationMin: 30, done: false });
  assert.equal(minuteOfDay(0), 8 * 60);
});

test('viagem: doca vem da ligação confirmada mais recente', () => {
  const call = (id, atMin, resultCode, dock) => ({ id, tripId: 't', receiverId: 'r', plate: 'X', moment: 'approach', atMin, answered: true, result: '', resultCode, dock, transcript: [] });
  assert.equal(confirmedDock([call('a', 10, 'no_answer')], 't'), null);
  assert.deepEqual(confirmedDock([call('a', 10, 'dock_confirmed', 2), call('b', 30, 'dock_confirmed', 3)], 't'), { dock: 3, atMin: 30 });
});
