import test from 'node:test';
import assert from 'node:assert/strict';
import { routeInput, assignmentIssue, registeredDrivers } from '../.cache/tests/features/dispatch/model.js';

const draft = {
  origin: ' CD Jundiaí ', originLat: '-23,1857', originLng: '-46.8978',
  destination: 'Campinas', destinationLat: '-22.9056', destinationLng: '-47.0608',
  plate: ' cco1a23 ', invoice: '000.123', cargo: 'Produtos embalados', tons: '28,5', window: '14h–16h',
  receiverCompany: 'Recebedor', receiverName: 'Contato', receiverPhone: '+5511999999999',
};
test('publicação mantém coordenadas e carga e exige motorista cadastrado', () => {
  const input = routeInput(draft, 8);
  assert.deepEqual(input.origem, { nome: 'CD Jundiaí', lat: -23.1857, lng: -46.8978 });
  assert.equal(input.carga_t, 28.5);
  assert.equal(input.placa, 'CCO1A23');
  assert.equal(input.motorista_id, 8);
  assert.equal(input.nota_fiscal, '000.123');
});
test('rota não aceita coordenada vazia como zero, valores fora dos limites ou telefone sem país', () => {
  for (const change of [
    { originLat: '' }, { originLat: '91' }, { destinationLng: '-181' }, { destinationLat: 'NaN' },
    { tons: '0' }, { tons: '-28' }, { receiverPhone: '11999999999' }, { cargo: '   ' },
  ]) assert.throws(() => routeInput({ ...draft, ...change }, 8));
  assert.equal(routeInput({ ...draft, originLat: '0', originLng: '0' }, 8).origem.lat, 0);
  for (const driverId of [0, -1, 1.5, Number.NaN]) assert.throws(() => routeInput(draft, driverId));
});
test('somente perfil de motorista persistido e vinculado ao cadastro operacional pode ser selecionado', () => {
  const drivers = [
    { id: 8, empresa_id: 1, nome: 'Cadastro sem perfil', telefone_e164: null, email: null },
    { id: 9, empresa_id: 1, nome: 'Motorista de banco', telefone_e164: null, email: null },
  ];
  const profiles = [
    { id: '1', email: 'cco@fixture.test', role: 'cco', name: 'CCO', driverId: null, tripId: null },
    { id: '2', email: 'linked@fixture.test', role: 'driver', name: 'Usuário vinculado', driverId: 9, tripId: null },
    { id: '3', email: 'missing@fixture.test', role: 'driver', name: 'Sem cadastro operacional', driverId: 10, tripId: null },
    { id: '4', email: 'duplicate@fixture.test', role: 'driver', name: 'Duplicado', driverId: 9, tripId: null },
  ];
  assert.deepEqual(registeredDrivers(profiles, drivers).map(({ profile, driver }) => [profile.email, driver.id]), [
    ['linked@fixture.test', 9],
  ]);
});
test('atribuição impede viagem encerrada, empresas diferentes e outra viagem ativa do motorista', () => {
  const trip = { backendId: 2, backend: { status: 'publicada', driverId: null, companyId: 1 } };
  const driver = { id: 9, empresa_id: 1 };
  assert.equal(assignmentIssue(trip, driver, [trip]), null);
  assert.equal(assignmentIssue({ ...trip, backend: { ...trip.backend, status: 'descarregada' } }, driver, []), 'closed');
  assert.equal(assignmentIssue(trip, { ...driver, empresa_id: 2 }, []), 'company');
  const other = { backendId: 3, backend: { status: 'em_transito', driverId: 9, companyId: 1 } };
  assert.equal(assignmentIssue(trip, driver, [other]), 'busy');
  assert.equal(assignmentIssue(trip, driver, [{ ...other, backend: { ...other.backend, status: 'descarregada' } }]), null);
  assert.equal(assignmentIssue(trip, driver, [{ ...trip, backend: { ...trip.backend, driverId: 9 } }]), null);
});
