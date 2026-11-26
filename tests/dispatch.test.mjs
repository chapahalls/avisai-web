import test from 'node:test';
import assert from 'node:assert/strict';
import { routeInput, assignmentIssue, registeredDrivers, dispatchRows, dispatchCounts, DISPATCH_FILTERS, demoDispatchRows, demoRegisteredDrivers, routeDispatchState, routeFileIssue, draftProgress, worstCaseReceiverCalls, ROUTE_FILE_MAX_BYTES, emptyDraft, linkGeocodeResult, changeStopAddress, restoreDraft, canCancelTrip } from '../.cache/tests/features/dispatch/model.js';

const draft = {
  ...emptyDraft,
  origin: ' CD Jundiaí ', originLat: '-23,1857', originLng: '-46.8978', originSource: 'manual',
  destination: 'Campinas', destinationLat: '-22.9056', destinationLng: '-47.0608', destinationSource: 'manual',
  plate: ' cco1a23 ', invoice: '000.123', cargo: 'Produtos embalados', tons: '28,5', window: '14h–16h',
  receiverCompany: 'Recebedor', receiverName: 'Contato', receiverPhone: '+5511999999999',
};
test('publicação mantém coordenadas e carga e exige motorista cadastrado', () => {
  const input = routeInput(draft, 8);
  assert.deepEqual(input.origem, { nome: 'CD Jundiaí', lat: -23.1857, lng: -46.8978, geo: { fonte: 'manual' } });
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
  assert.deepEqual(rows.map((row) => row.status), ['em_transito', 'planejada', 'publicada', 'available']);
  assert.deepEqual(dispatchCounts(rows, DISPATCH_FILTERS), {
    all: 4, editable: 2, publicada: 1, planejada: 1, na_origem: 0, em_transito: 1, aproximando: 0, no_destino: 0, available: 1,
  });
});

test('lista de dispatch na Demo: fase simulada vira status de rota, com os mesmos cards da API', () => {
  const drivers = demoRegisteredDrivers([
    { id: 1, name: 'Motorista A', email: 'motorista.a@demo.test', phone: null, companyId: 1 },
    { id: 2, name: 'Motorista B', email: 'motorista.b@demo.test', phone: null, companyId: 1 },
    { id: 9, name: 'Nova', email: 'nova@demo.test', phone: '+5511999999999', companyId: 1 },
  ]);
  assert.equal(drivers[2].driver.telefone_e164, '+5511999999999');
  const trips = [
    { id: 'trip-1', driver: 'Motorista A', phase: 'waiting', source: 'mock' },
    { id: 'trip-2', driver: 'Motorista B', phase: 'approaching', source: 'mock' },
  ];
  const rows = demoDispatchRows(drivers, trips);
  assert.deepEqual(rows.map((row) => [row.driver.profile.name, row.status]), [['Motorista B', 'aproximando'], ['Motorista A', 'no_destino'], ['Nova', 'available']]);
  assert.deepEqual(dispatchCounts(rows, DISPATCH_FILTERS), {
    all: 3, editable: 0, publicada: 0, planejada: 0, na_origem: 0, em_transito: 0, aproximando: 1, no_destino: 1, available: 1,
  });
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

const place = { id: 'W202', endereco: 'Avenida do Atacado, 2000, Sorocaba, SP', lat: -23.5015, lng: -47.4526, tipo: 'road' };

test('resultado escolhido vincula coordenada e lugar; publicação envia endereço e vínculo', () => {
  const linked = { ...draft, destinationAddress: ' Av. do Atacado, 2000 ', ...linkGeocodeResult('destination', 'nominatim', place) };
  const input = routeInput(linked, 8);
  assert.deepEqual(input.destino, {
    nome: 'Campinas', lat: -23.5015, lng: -47.4526, endereco: 'Av. do Atacado, 2000',
    geo: { fonte: 'geocodificacao', provedor: 'nominatim', id: 'W202', endereco: 'Avenida do Atacado, 2000, Sorocaba, SP' },
  });
  assert.equal(input.origem.geo.fonte, 'manual');
});

test('sem localizar não publica: endereço sem coordenada, vínculo sem lugar ou coordenada vazia', () => {
  for (const change of [
    { originSource: '' },
    { originSource: 'geocodificacao', originGeoProvider: 'nominatim', originGeoId: '' },
    { originSource: 'geocodificacao', originGeoProvider: '', originGeoId: 'N1' },
    { destinationSource: 'manual', destinationLat: '' },
  ]) assert.throws(() => routeInput({ ...draft, ...change }, 8), /location|coordinates/);
  assert.throws(() => routeInput({ ...draft, originSource: '' }, 8), /location/);
  assert.equal(draftProgress({ ...draft, destinationSource: '' }, 8).ready, false);
});

test('editar o endereço desfaz o vínculo geocodificado, mas preserva coordenada manual', () => {
  const linked = { ...draft, ...linkGeocodeResult('origin', 'nominatim', place) };
  const changed = { ...linked, ...changeStopAddress(linked, 'origin', 'Outro endereço') };
  assert.equal(changed.originSource, '');
  assert.equal(changed.originLat, '');
  assert.equal(changed.originGeoId, '');
  assert.equal(changed.originAddress, 'Outro endereço');
  const manual = { ...draft, ...changeStopAddress(draft, 'origin', 'Rua A') };
  assert.equal(manual.originSource, 'manual');
  assert.equal(manual.originLat, '-23,1857');
});

test('rascunho antigo com coordenadas volta como manual; sem coordenadas, precisa localizar', () => {
  const old = restoreDraft({ origin: 'CD', originLat: '-23.1', originLng: '-46.8', destination: 'Loja' });
  assert.equal(old.originSource, 'manual');
  assert.equal(old.destinationSource, '');
  assert.equal(old.destinationAddress, '');
  assert.equal(restoreDraft({ originSource: 'inventado' }).originSource, '');
});

test('cancelada é viagem encerrada: some do despacho, bloqueia atribuição e não pode ser cancelada de novo', () => {
  const trip = (status) => ({ id: 'api-route-5', source: 'api', backendId: 5, phase: status === 'cancelada' ? 'cancelled' : 'driving',
    backend: { status, driverId: 9, companyId: 1 } });
  const driver = { id: 7, empresa_id: 1, nome: 'D', telefone_e164: null, email: null };
  assert.equal(routeDispatchState(trip('cancelada')), null);
  assert.equal(assignmentIssue(trip('cancelada'), driver, []), 'closed');
  assert.equal(assignmentIssue(trip('planejada'), { ...driver, id: 9 }, [{ ...trip('cancelada'), backendId: 6 }]), null);
  for (const status of ['publicada', 'planejada', 'na_origem', 'em_transito', 'aproximando']) assert.equal(canCancelTrip(trip(status)), true, status);
  for (const status of ['no_destino', 'descarregada', 'cancelada']) assert.equal(canCancelTrip(trip(status)), false, status);
  assert.equal(canCancelTrip({ ...trip('planejada'), source: 'mock' }), false);
});
