import test from 'node:test';
import assert from 'node:assert/strict';
import { routeInput, assignmentIssue } from '../.cache/tests/features/dispatch/model.js';

const draft = {
  origin: ' CD Jundiaí ', originLat: '-23,1857', originLng: '-46.8978',
  destination: 'Campinas', destinationLat: '-22.9056', destinationLng: '-47.0608',
  plate: ' cco1a23 ', invoice: '000.123', cargo: 'Produtos embalados', tons: '28,5', window: '14h–16h',
  receiverCompany: 'Recebedor', receiverName: 'Contato', receiverPhone: '+5511999999999',
};
test('publicação mantém coordenadas e carga e separa atribuição sem assumir motorista', () => {
  const input = routeInput(draft);
  assert.deepEqual(input.origem, { nome: 'CD Jundiaí', lat: -23.1857, lng: -46.8978 });
  assert.equal(input.carga_t, 28.5);
  assert.equal(input.placa, 'CCO1A23');
  assert.equal(input.motorista_id, null);
  assert.equal(input.nota_fiscal, '000.123');
});
test('rota não aceita coordenada vazia como zero, valores fora dos limites ou telefone sem país', () => {
  for (const change of [
    { originLat: '' }, { originLat: '91' }, { destinationLng: '-181' }, { destinationLat: 'NaN' },
    { tons: '0' }, { tons: '-28' }, { receiverPhone: '11999999999' }, { cargo: '   ' },
  ]) assert.throws(() => routeInput({ ...draft, ...change }));
  assert.equal(routeInput({ ...draft, originLat: '0', originLng: '0' }).origem.lat, 0);
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
