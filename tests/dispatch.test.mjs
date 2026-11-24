import test from 'node:test';
import assert from 'node:assert/strict';
import { routeInput, assignmentIssue, registeredDrivers, dispatchRows, dispatchCounts, routeDispatchState, routeFileIssue, draftProgress, worstCaseReceiverCalls, ROUTE_FILE_MAX_BYTES, emptyDraft } from '../.cache/tests/features/dispatch/model.js';

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

const apiTrip = (id, status, driverId) => ({
  id: `api-route-${id}`, source: 'api', backendId: id, plate: `PLT${id}`, driver: '', receiverId: 'r', phase: 'driving',
  backend: { status, driverId, companyId: 1, originName: 'CD', destinationName: `Destino ${id}`, arrivalWindow: '', invoiceNumber: '', cargoDescription: '', cargoTons: 10, receiverContact: '' },
});
const registered = (id, name) => ({
  profile: { id: `p${id}`, email: `${id}@x.test`, role: 'driver', name, driverId: id, tripId: null },
  driver: { id, empresa_id: 1, nome: name, telefone_e164: null, email: null },
});

test('lista de dispatch: rota só é editável antes da saída; em rota e no recebedor ficam travadas', () => {
  assert.equal(routeDispatchState(apiTrip(1, 'planejada', 7)), 'editable');
  assert.equal(routeDispatchState(apiTrip(1, 'publicada', 7)), 'editable');
  assert.equal(routeDispatchState(apiTrip(1, 'na_origem', 7)), 'editable');
  assert.equal(routeDispatchState(apiTrip(1, 'em_transito', 7)), 'onRoute');
  assert.equal(routeDispatchState(apiTrip(1, 'aproximando', 7)), 'onRoute');
  assert.equal(routeDispatchState(apiTrip(1, 'no_destino', 7)), 'atReceiver');
  assert.equal(routeDispatchState(apiTrip(1, 'publicada', null)), 'unassigned');
  assert.equal(routeDispatchState(apiTrip(1, 'descarregada', 7)), null);
});

test('lista de dispatch: uma linha por motorista e por rota sem motorista, com contagem dos filtros', () => {
  const drivers = [registered(7, 'Bruna'), registered(8, 'Ana'), registered(9, 'Caio')];
  const trips = [
    apiTrip(1, 'em_transito', 7),
    apiTrip(2, 'planejada', 8),
    apiTrip(3, 'publicada', null),
    apiTrip(4, 'descarregada', 9),
    { ...apiTrip(5, 'em_transito', 9), source: 'mock' },
  ];
  const rows = dispatchRows(drivers, trips);
  assert.deepEqual(rows.map((row) => [row.key, row.state]), [
    ['driver-7', 'onRoute'],
    ['driver-8', 'editable'],
    ['route-api-route-3', 'unassigned'],
    ['driver-9', 'available'],
  ]);
  assert.deepEqual(dispatchCounts(rows), { all: 4, editable: 2, onRoute: 1, atReceiver: 0, available: 1 });
});

test('cadastro: arquivos seguem os tipos e o limite do backend', () => {
  assert.equal(routeFileIssue({ size: 1000, type: 'application/pdf' }), null);
  assert.equal(routeFileIssue({ size: 1000, type: 'image/webp' }), null);
  assert.equal(routeFileIssue({ size: 0, type: 'application/pdf' }), 'emptyFile');
  assert.equal(routeFileIssue({ size: ROUTE_FILE_MAX_BYTES + 1, type: 'application/pdf' }), 'tooLarge');
  assert.equal(routeFileIssue({ size: 1000, type: 'application/xml' }), 'type');
});

test('cadastro: etapas ficam prontas com a mesma validação da publicação', () => {
  assert.deepEqual(draftProgress(emptyDraft, null), { driver: false, route: false, ready: false });
  assert.deepEqual(draftProgress(draft, null), { driver: false, route: true, ready: false });
  assert.deepEqual(draftProgress(draft, 8), { driver: true, route: true, ready: true });
  assert.equal(draftProgress({ ...draft, receiverPhone: '119' }, 8).ready, false);
  assert.equal(worstCaseReceiverCalls(1, 3), 3);
  assert.equal(worstCaseReceiverCalls(2, 3), 6);
});
