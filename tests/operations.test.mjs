import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../.cache/tests/services/api/client.js';
import { backendDate, projectSnapshot, routeKey, taskKey } from '../.cache/tests/services/operations/adapter.js';
import { createApiRuntime } from '../.cache/tests/services/operations/runtime.js';
import { stayValue } from '../.cache/tests/utils/stay.js';

const now = new Date('2026-11-22T13:05:00Z');
const at = '2026-11-22T08:00:00';
const route = {
  id: 1, empresa_id: 1, motorista_id: 1,
  origem_nome: 'CD Jundiaí', origem_lat: -23.1857, origem_lng: -46.8978,
  destino_nome: 'CD Campinas', destino_lat: -22.9056, destino_lng: -47.0608,
  status: 'no_destino', placa: 'FIXT-001', nota_fiscal: '000.482.913', carga_descricao: '28 paletes de bebidas',
  carga_t: 28, janela_descarga: '14h às 16h', recebedor_empresa: 'Empresa fixture',
  recebedor_nome: 'Marcos, do recebimento', recebedor_telefone_e164: '',
  aproximacao_min: 15, raio_chegada_m: 300, ultima_lat: -22.9057, ultima_lng: -47.0609,
  ultima_posicao_em: at, eta_min: 0, distancia_m: 20, motorista_nome: 'Carlos Andrade',
  canal_motorista: 'fixture-channel', uid_motorista: 1001, uid_cco: 2001, uid_agente: 9001,
};
const task = {
  id: 2, rota_id: 1, tipo: 'chegada', status: 'pendente', prioridade: 'normal',
  tentativas: 1, canal_atual: 'push', criada_em: at, ultima_notificacao: at,
  confirmado_em: null, confirmado_por: null, resposta_recebedor: null, concluida_em: null,
};
const stay = {
  estadia_id: 3, rota_id: 1, inicio: at, fim: null, encerrada: false,
  horas_paradas: 301 / 60, tempo_parado: '5h01', franquia_h: 5, franquia_restante_h: 0,
  franquia_restante: '0h00', horas_excedentes: 1 / 60, capacidade_t: 28, valor_t_h: 2.5,
  valor: 1.17, valor_fmt: 'R$ 1,17', aceleracao: 1,
};
const call = {
  id: 4, rota_id: 1, task_id: null, motivo: 'aproximacao', modo: 'rtc', numero: '',
  canal: 'fixture-receiver', sessao_id: 5, agent_id: null, status: 'respondida',
  iniciada_em: '2026-11-22T07:50:00', encerrada_em: '2026-11-22T07:55:00', atendida: true,
  previsao: 'Em 30 minutos', doca: 'A-2', motivo_espera: null, resposta_resumo: 'Doca A-2',
  transcricao: [{ quem: 'recebedor', texto: 'Doca A-2', ts: 1795334100 }],
  erro: null, enviada_cco_em: at, enviada_motorista_em: null,
};
const event = { id: 6, tipo: 'chegada', rota_id: 1, timestamp: at, mensagem: 'Chegada registrada', dados: { task_id: 2 } };
const baseSnapshot = { rotas: [route], tasks: [task], estadias: [stay], ligacoes: [call], ocorrencias: [], eventos: [event] };
const sample = () => structuredClone(baseSnapshot);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(setImmediate);
  }
  assert.fail('operação não atingiu o estado esperado');
}

test('rotas publicadas sem motorista e na origem têm identidade estável e estado do servidor', () => {
  for (const status of ['publicada', 'na_origem']) {
    const data = sample();
    Object.assign(data.rotas[0], { status, motorista_id: null, motorista_nome: null, ultima_lat: null, ultima_lng: null, ultima_posicao_em: null });
    const projected = projectSnapshot(data, new Map(), now);
    assert.equal(projected.trips[0].id, routeKey(1));
    assert.equal(projected.trips[0].backend.status, status);
    assert.equal(projected.trips[0].backend.driverId, null);
    assert.equal(projected.trips[0].positionKnown, false);
  }
});

test('GPS do rastreador mais recente é apresentado sem trocar ETA e estado do celular', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  try {
    const stream = await testCase.boot();
    const mobile = runtime.store.getState().trips[0];
    stream.emit('posicao', { rota_id: 1, fonte: 'rastreador', lat: -23.12, lng: -46.95 });
    const truck = runtime.store.getState().trips[0];
    assert.deepEqual(truck.position, { lat: -23.12, lng: -46.95 });
    assert.equal(truck.positionSource, 'rastreador');
    assert.equal(truck.etaMin, mobile.etaMin);
    assert.equal(truck.backend.status, 'no_destino');
    assert.equal(truck.distanceRemainingKm, mobile.distanceRemainingKm);
    stream.emit('posicao', { rota_id: 1, fonte: 'celular', lat: -23.11, lng: -46.94, distancia_m: 1000, eta_min: 3, status: 'no_destino' });
    const next = runtime.store.getState().trips[0];
    assert.equal(next.positionSource, 'celular');
    assert.deepEqual(next.position, { lat: -23.11, lng: -46.94 });
    assert.equal(next.etaMin, 3);
  } finally { runtime.stop(); }
});

class StreamFixture {
  readyState = 0;
  onopen = null;
  onerror = null;
  listeners = new Map();
  closeCount = 0;
  constructor(url) { this.url = url; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  close() { this.closeCount++; this.readyState = 2; }
  open() { this.readyState = 1; this.onopen?.({}); }
  reconnecting() { this.readyState = 0; this.onerror?.({}); }
  emit(type, value) { this.listeners.get(type)?.({ data: JSON.stringify(value) }); }
}

/** Todas as requisições passam por este transporte local; nenhum endpoint real é chamado. */
function fixture(initial = sample()) {
  let current = structuredClone(initial);
  let date = now;
  const requests = [];
  const streams = [];
  const overrides = new Map();
  const api = new ApiClient('/fixture-api', {
    timeoutMs: 2000,
    eventSource(url) {
      const stream = new StreamFixture(url);
      streams.push(stream);
      return stream;
    },
    async fetch(input, options) {
      const url = new URL(input, 'http://fixture.invalid');
      const path = url.pathname.replace('/fixture-api', '');
      const request = { path, method: options.method, body: options.body ? JSON.parse(options.body) : null, signal: options.signal };
      requests.push(request);
      const override = overrides.get(`${request.method} ${path}`);
      if (override) return override(request);
      if (request.method !== 'GET') assert.fail(`ação inesperada no transporte fixture: ${path}`);
      if (path === '/cco/estado') return json(current);
      if (path === '/tasks') return json(current.tasks);
      if (path === '/ligacoes') return json(current.ligacoes);
      if (path === '/eventos') return json(current.eventos);
      const id = /^\/rotas\/(\d+)$/.exec(path)?.[1];
      if (id) {
        const item = current.rotas.find((candidate) => candidate.id === Number(id));
        return item ? json({ ...item, trajeto: item.trajeto ?? [[item.origem_lat, item.origem_lng], [item.destino_lat, item.destino_lng]] }) : json({}, 404);
      }
      assert.fail(`leitura inesperada no transporte fixture: ${path}`);
    },
  });
  const runtime = createApiRuntime(api, { now: () => date, pollMs: 60_000 });
  return {
    runtime, requests, streams, overrides,
    get current() { return current; },
    set current(value) { current = structuredClone(value); },
    set date(value) { date = value; },
    async boot() {
      runtime.start();
      streams.at(-1).open();
      await runtime.refresh();
      return streams.at(-1);
    },
  };
}

test('projeção preserva nome/NF/carga28t/UTC e valor fracionário do servidor', () => {
  const snapshot = sample();
  const original = structuredClone(snapshot);
  const result = projectSnapshot(snapshot, new Map(), now);
  const trip = result.trips[0];
  assert.equal(trip.source, 'api');
  assert.equal(trip.id, routeKey(1));
  assert.equal(trip.driver, 'Carlos Andrade');
  assert.equal(trip.capacityTons, 28);
  assert.equal(trip.backend.invoiceNumber, '000.482.913');
  assert.equal(trip.backend.cargoDescription, '28 paletes de bebidas');
  assert.equal(trip.backend.receiverContact, 'Marcos, do recebimento');
  assert.equal(trip.stay.waitMin, 301);
  assert.equal(trip.stay.valueBRL, 1.17);
  assert.notEqual(trip.stay.valueBRL, stayValue(trip.stay.waitMin, trip.capacityTons));
  assert.equal(trip.notifiedBeforeArrival, true);
  assert.equal(result.calls[0].dock, 'A-2');
  assert.deepEqual(result.calls[0].transcript[0], { who: 'receiver', text: 'Doca A-2' });
  assert.equal(result.calls[0].occurredAt, '2026-11-22T07:50:00.000Z');
  assert.equal(trip.lastPositionAt, '2026-11-22T08:00:00.000Z');
  assert.equal(backendDate('2026-11-22T08:00:00').toISOString(), '2026-11-22T08:00:00.000Z');
  assert.equal(backendDate('2026-11-22T08:00:00-03:00').toISOString(), '2026-11-22T11:00:00.000Z');
  assert.deepEqual(snapshot, original);
});

test('posição ausente fica indisponível; projeção de progresso não desloca o GPS à estrada', () => {
  const snapshot = sample();
  snapshot.rotas[0] = { ...route, ultima_lat: null, ultima_lng: null, ultima_posicao_em: null };
  const absent = projectSnapshot(snapshot, new Map(), now).trips[0];
  assert.equal(absent.positionKnown, false, 'placeholder de origem não deve ser apresentado como GPS');
  assert.equal(absent.lastPositionAt, null);
  assert.equal(absent.progress, 0);
  assert.deepEqual(absent.routePoints, [], 'rota inexistente não recebe a geometria de um mock');
  snapshot.rotas[0] = {
    ...route, origem_lat: 0, origem_lng: 0, destino_lat: 0, destino_lng: 4,
    ultima_lat: 0.1, ultima_lng: 2,
  };
  const details = new Map([[1, { ...snapshot.rotas[0], trajeto: [[0, 0], [0, 1], [0, 4]] }]]);
  const known = projectSnapshot(snapshot, details, now).trips[0];
  assert.equal(known.positionKnown, true);
  assert.deepEqual(known.position, { lat: 0.1, lng: 2 });
  assert.ok(Math.abs(known.progress - 0.5) < 1e-9);
  assert.deepEqual(known.routePoints, [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 4 }]);
});

test('projeção deduplica IDs e preserva texto do backend sem criar histórico ou eventos locais', () => {
  const snapshot = sample();
  snapshot.eventos = [event, { ...event }, {
    ...event, id: 8, tipo: 'novo_evento', mensagem: 'Texto original do backend', dados: { campo: 'fixture' },
  }];
  const result = projectSnapshot(snapshot, new Map(), now);
  assert.equal(result.feed.length, 2);
  assert.equal(new Set(result.feed.map((entry) => entry.id)).size, 2);
  assert.equal(result.feed.find((entry) => entry.id === 'api-event-8').payload.backendMessage, 'Texto original do backend');
  assert.equal(result.feed.find((entry) => entry.id === 'api-event-8').payload.backendType, 'novo_evento');
  assert.equal(Object.hasOwn(result, 'history'), false);
  assert.equal(Object.hasOwn(result, 'historicalCalls'), false);
});

test('runtime usa GPS recebido sem extrapolar, mantém estadias encerradas e aplica Task SSE', async () => {
  const snapshot = sample();
  snapshot.rotas.push({ ...route, id: 2, placa: 'FIXT-002' });
  snapshot.estadias[0] = { ...stay, encerrada: true, fim: '2026-11-22T13:01:00' };
  snapshot.estadias.push({ ...stay, estadia_id: 9, rota_id: 2 });
  const testCase = fixture(snapshot);
  const { runtime } = testCase;
  try {
    const source = await testCase.boot();
    assert.deepEqual(runtime.store.getState().history, []);
    assert.deepEqual(runtime.store.getState().historicalCalls, []);
    assert.equal(runtime.store.getState().trips.length, 2);
    assert.equal(runtime.store.getState().running, false);
    source.emit('posicao', { rota_id: 1, lat: -22.9123, lng: -47.0789, distancia_m: 2000, eta_min: 2, status: 'aproximando' });
    const trip = runtime.store.getState().trips.find((item) => item.backendId === 1);
    assert.deepEqual(trip.position, { lat: -22.9123, lng: -47.0789 });
    assert.equal(trip.distanceRemainingKm, 2);
    assert.equal(trip.etaMin, 2);
    runtime.store.getState().tick(120);
    assert.deepEqual(runtime.store.getState().trips.find((item) => item.backendId === 1).position, trip.position);
    testCase.current = {
      ...testCase.current,
      rotas: testCase.current.rotas.map((item) => item.id === 1 ? {
        ...item, ultima_lat: -22.9123, ultima_lng: -47.0789, distancia_m: 2000, eta_min: 2, status: 'aproximando',
      } : item),
    };
    testCase.date = new Date(now.getTime() + 10 * 60_000);
    await runtime.refresh();
    assert.deepEqual(runtime.store.getState().trips.find((item) => item.backendId === 1).position, trip.position);
    source.emit('contador', { estadias: [{ ...stay, estadia_id: 9, rota_id: 2, horas_paradas: 6, valor: 70 }] });
    assert.equal(runtime.store.getState().trips.find((item) => item.backendId === 1).stay.valueBRL, 1.17);
    assert.equal(runtime.store.getState().trips.find((item) => item.backendId === 2).stay.valueBRL, 70);
    source.emit('task', { task: { ...task, status: 'escalada_recebedor', tentativas: 3, prioridade: 'critica' } });
    assert.equal(runtime.store.getState().tasks[0].status, 'escalated');
    assert.equal(runtime.store.getState().tasks[0].attempts, 3);
    const size = runtime.store.getState().feed.length;
    source.emit('fala', { rota_id: 1, papel: 'motorista', texto: 'fala efêmera' });
    assert.equal(runtime.store.getState().feed.length, size);
  } finally { runtime.stop(); }
});

test('GPS SSE inválido não contamina o store nem interrompe posições válidas posteriores', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  try {
    const source = await testCase.boot();
    const before = runtime.store.getState();
    for (const invalid of [{ lat: 91, lng: -47 }, { lat: -23, lng: -181 }]) {
      source.emit('posicao', {
        rota_id: 1, ...invalid, distancia_m: 0, eta_min: 0, status: 'descarregada',
      });
      assert.equal(runtime.store.getState(), before, 'mensagem inválida não deve ser aplicada ao domínio');
      assert.equal(runtime.connection.getState().error, 'api_invalid_response');
      assert.equal(runtime.connection.getState().status, 'connected');
      assert.equal(source.closeCount, 0);
    }
    const position = { lat: -22.913, lng: -47.078 };
    source.emit('posicao', {
      rota_id: 1, ...position, distancia_m: 2000, eta_min: 2, status: 'aproximando',
    });
    assert.deepEqual(runtime.store.getState().trips[0].position, position);
    assert.equal(runtime.store.getState().trips[0].distanceRemainingKm, 2);
    assert.equal(runtime.store.getState().tasks[0].status, 'open');
    assert.deepEqual(runtime.store.getState().history, []);
  } finally { runtime.stop(); }
});

test('Assumir aguarda POST, bloqueia duplicata pendente e reconcilia a confirmação do servidor', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const pending = deferred();
  testCase.overrides.set('POST /tasks/2/confirmar', () => pending.promise);
  try {
    await testCase.boot();
    const id = taskKey(2);
    runtime.store.getState().acknowledge(id);
    runtime.store.getState().acknowledge(id);
    assert.deepEqual(runtime.connection.getState().pendingTaskIds, [id]);
    assert.equal(runtime.store.getState().tasks[0].status, 'open');
    assert.equal(testCase.requests.filter((request) => request.method === 'POST').length, 1);
    assert.deepEqual(testCase.requests.at(-1).body, { confirmado_por: 'CCO' });
    const confirmed = { ...task, status: 'confirmada', confirmado_em: '2026-11-22T13:05:00', confirmado_por: 'CCO' };
    testCase.current = { ...testCase.current, tasks: [confirmed] };
    pending.resolve(json(confirmed));
    await until(() => runtime.connection.getState().pendingTaskIds.length === 0);
    assert.equal(runtime.store.getState().tasks[0].status, 'acknowledged');
    assert.equal(runtime.connection.getState().actionError, null);
    runtime.store.getState().acknowledge(id);
    assert.equal(testCase.requests.filter((request) => request.method === 'POST').length, 1);
  } finally { runtime.stop(); }
});

test('erro500 ao Assumir limpa pending, preserva Task e não troca para registros mock', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  testCase.overrides.set('POST /tasks/2/confirmar', () => json({ detail: 'fixture-private' }, 500));
  try {
    await testCase.boot();
    runtime.store.getState().acknowledge(taskKey(2));
    await until(() => runtime.connection.getState().pendingTaskIds.length === 0);
    assert.equal(runtime.connection.getState().actionError, 'api_http_error_500');
    assert.equal(runtime.connection.getState().status, 'connected');
    assert.equal(runtime.store.getState().tasks[0].status, 'open');
    assert.deepEqual(runtime.store.getState().history, []);
    assert.deepEqual(runtime.store.getState().historicalCalls, []);
    assert.ok(runtime.store.getState().trips.every((item) => item.source === 'api'));
    assert.equal(testCase.requests.filter((request) => request.method === 'POST').length, 1);
  } finally { runtime.stop(); }
});

test('descarga aguarda servidor e reload encerra rota, Task e contador com valor recebido', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const pending = deferred();
  testCase.overrides.set('POST /rotas/1/descarga', () => pending.promise);
  try {
    await testCase.boot();
    const action = runtime.confirmUnload(routeKey(1));
    void runtime.confirmUnload(routeKey(1));
    assert.deepEqual(runtime.connection.getState().pendingUnloadIds, [routeKey(1)]);
    assert.equal(runtime.store.getState().trips[0].phase, 'waiting');
    assert.equal(testCase.requests.filter((request) => request.method === 'POST').length, 1);
    assert.deepEqual(testCase.requests.at(-1).body, { por: 'CCO' });
    const closed = { ...stay, encerrada: true, fim: '2026-11-22T13:05:00', horas_paradas: 305 / 60, valor: 5.83 };
    testCase.current = {
      ...testCase.current, rotas: [{ ...route, status: 'descarregada' }],
      tasks: [{ ...task, status: 'concluida', concluida_em: '2026-11-22T13:05:00' }], estadias: [closed],
    };
    pending.resolve(json(closed));
    await action;
    assert.equal(runtime.store.getState().trips[0].phase, 'unloaded');
    assert.equal(runtime.store.getState().trips[0].stay.waitMin, 305);
    assert.equal(runtime.store.getState().trips[0].stay.valueBRL, 5.83);
    assert.equal(runtime.store.getState().tasks[0].status, 'closed');
    assert.deepEqual(runtime.connection.getState().pendingUnloadIds, []);
    assert.deepEqual(runtime.store.getState().history, []);
  } finally { runtime.stop(); }
});

test('descarga REST prevalece sobre SSE antigo e rota ou Task encerradas não reabrem', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const pending = deferred();
  const closed = {
    ...sample(),
    rotas: [{ ...route, status: 'descarregada' }],
    tasks: [{ ...task, status: 'concluida', concluida_em: '2026-11-22T13:05:00' }],
    estadias: [{ ...stay, encerrada: true, fim: '2026-11-22T13:05:00', horas_paradas: 305 / 60, valor: 5.83 }],
  };
  try {
    const source = await testCase.boot();
    testCase.current = closed;
    testCase.overrides.set('GET /cco/estado', () => pending.promise);
    const refresh = runtime.refresh();
    const currentPosition = { lat: -22.90565, lng: -47.06085 };
    source.emit('posicao', {
      rota_id: 1, ...currentPosition, distancia_m: 10, eta_min: 0, status: 'no_destino',
    });
    source.emit('task', { task: { ...task, status: 'escalada_recebedor', tentativas: 3 } });
    pending.resolve(json(closed));
    await refresh;
    let state = runtime.store.getState();
    assert.equal(state.trips[0].phase, 'unloaded');
    assert.deepEqual(state.trips[0].position, currentPosition, 'a descarga não descarta o GPS mais recente');
    assert.equal(state.trips[0].stay.valueBRL, 5.83);
    assert.equal(state.trips[0].stay.waitMin, 305);
    assert.equal(state.tasks[0].status, 'closed');
    source.emit('posicao', {
      rota_id: 1, lat: -22.9057, lng: -47.0609, distancia_m: 20, eta_min: 0, status: 'no_destino',
    });
    for (const status of ['pendente', 'escalada_recebedor']) {
      source.emit('task', { task: { ...task, status } });
      state = runtime.store.getState();
      assert.equal(state.trips[0].phase, 'unloaded');
      assert.equal(state.trips[0].stay.valueBRL, 5.83);
      assert.equal(state.trips[0].stay.waitMin, 305);
      assert.equal(state.tasks[0].status, 'closed');
    }
  } finally {
    pending.resolve(json(closed));
    runtime.stop();
  }
});

test('Task confirmada não volta a pendente ou escalada por mensagens SSE atrasadas', async () => {
  const initial = sample();
  initial.tasks[0] = { ...task, status: 'confirmada', confirmado_em: at, confirmado_por: 'CCO' };
  const testCase = fixture(initial);
  const { runtime } = testCase;
  try {
    const source = await testCase.boot();
    assert.equal(runtime.store.getState().tasks[0].status, 'acknowledged');
    for (const status of ['pendente', 'escalada_recebedor']) {
      source.emit('task', { task: { ...task, status } });
      assert.equal(runtime.store.getState().tasks[0].status, 'acknowledged');
      assert.deepEqual(runtime.connection.getState().pendingTaskIds, []);
    }
  } finally { runtime.stop(); }
});

test('reconexão SSE aplica snapshot atual e deduplica evento já incluído nele', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  try {
    const source = await testCase.boot();
    source.reconnecting();
    assert.equal(runtime.connection.getState().status, 'reconnecting');
    const next = sample();
    next.rotas[0].ultima_lat = -22.91;
    next.rotas[0].ultima_lng = -47.07;
    next.tasks[0] = { ...task, status: 'escalada_recebedor', tentativas: 3 };
    testCase.current = next;
    source.open();
    source.emit('snapshot', next);
    source.emit('evento', event);
    assert.equal(runtime.connection.getState().status, 'connected');
    assert.deepEqual(runtime.store.getState().trips[0].position, { lat: -22.91, lng: -47.07 });
    assert.equal(runtime.store.getState().tasks[0].status, 'escalated');
    assert.equal(runtime.store.getState().feed.length, 1);
  } finally { runtime.stop(); }
});

test('contador SSE recente não é sobrescrito por snapshot REST iniciado antes dele', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const old = sample();
  const pending = deferred();
  try {
    const source = await testCase.boot();
    testCase.overrides.set('GET /cco/estado', () => pending.promise);
    const refresh = runtime.refresh();
    const latest = { ...stay, horas_paradas: 6, tempo_parado: '6h00', valor: 70 };
    source.emit('contador', { estadias: [latest] });
    assert.equal(runtime.store.getState().trips[0].stay.valueBRL, 70);
    testCase.current = { ...testCase.current, estadias: [latest] };
    testCase.overrides.delete('GET /cco/estado');
    pending.resolve(json(old));
    await refresh;
    assert.equal(runtime.store.getState().trips[0].stay.valueBRL, 70);
    assert.equal(runtime.store.getState().trips[0].stay.waitMin, 360);
  } finally { runtime.stop(); }
});

test('GPS contínuo e Task SSE durante refresh preservam dados recentes e incorporam ligação REST', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const snapshotRequest = deferred();
  const callsRequest = deferred();
  const stale = sample();
  const newCall = {
    ...call, id: 10, task_id: 2, motivo: 'cco_sem_resposta', sessao_id: 11,
    iniciada_em: '2026-11-22T13:04:00', encerrada_em: '2026-11-22T13:05:00',
  };
  try {
    const source = await testCase.boot();
    testCase.overrides.set('GET /cco/estado', () => snapshotRequest.promise);
    testCase.overrides.set('GET /ligacoes', () => callsRequest.promise);
    const previousCallsRequests = testCase.requests.filter((request) => request.path === '/ligacoes').length;
    const refresh = runtime.refresh();
    source.emit('posicao', {
      rota_id: 1, lat: -22.915, lng: -47.081, distancia_m: 2500, eta_min: 3, status: 'aproximando',
    });
    snapshotRequest.resolve(json(stale));
    await until(() => testCase.requests.filter((request) => request.path === '/ligacoes').length > previousCallsRequests);
    const latestPosition = { lat: -22.913, lng: -47.078 };
    source.emit('posicao', {
      rota_id: 1, ...latestPosition, distancia_m: 2000, eta_min: 2, status: 'aproximando',
    });
    source.emit('task', { task: { ...task, status: 'escalada_recebedor', tentativas: 3, prioridade: 'critica' } });
    callsRequest.resolve(json([newCall, call]));
    await refresh;
    const state = runtime.store.getState();
    assert.deepEqual(state.trips[0].position, latestPosition);
    assert.equal(state.trips[0].distanceRemainingKm, 2);
    assert.equal(state.trips[0].etaMin, 2);
    assert.equal(state.tasks[0].status, 'escalated');
    assert.equal(state.tasks[0].attempts, 3);
    assert.equal(state.calls.length, 2, 'GPS ativo não pode bloquear a entrada de novas ligações REST');
    assert.equal(new Set(state.calls.map((item) => item.id)).size, 2);
    assert.equal(state.feed.length, 1);
    assert.equal(runtime.connection.getState().error, null);
  } finally {
    snapshotRequest.resolve(json(stale));
    callsRequest.resolve(json([newCall, call]));
    runtime.stop();
  }
});

test('falha REST mantém dados API e reconciliação posterior recupera estado da conexão', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  try {
    await testCase.boot();
    testCase.overrides.set('GET /cco/estado', () => json({ detail: 'fixture-private' }, 500));
    await runtime.refresh();
    assert.equal(runtime.connection.getState().status, 'error');
    assert.equal(runtime.connection.getState().error, 'api_http_error_500');
    assert.equal(runtime.store.getState().trips.length, 1);
    assert.deepEqual(runtime.store.getState().history, []);
    testCase.overrides.delete('GET /cco/estado');
    await runtime.refresh();
    assert.equal(runtime.connection.getState().error, null);
    assert.equal(runtime.connection.getState().status, 'connected');
  } finally { runtime.stop(); }
});

test('stop aborta requests, fecha stream e ignora callbacks ou respostas tardias', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const pending = deferred();
  try {
    const source = await testCase.boot();
    const lateEvent = source.listeners.get('evento');
    const latePosition = source.listeners.get('posicao');
    const lateOpen = source.onopen;
    testCase.overrides.set('GET /cco/estado', () => pending.promise);
    const refresh = runtime.refresh();
    const signal = testCase.requests.at(-1).signal;
    runtime.stop();
    assert.equal(signal.aborted, true);
    assert.equal(source.closeCount, 1);
    lateOpen({});
    lateEvent({ data: JSON.stringify(event) });
    latePosition({ data: JSON.stringify({ rota_id: 1, lat: 0, lng: 0, distancia_m: 0, eta_min: 0, status: 'no_destino' }) });
    pending.resolve(json(sample()));
    await refresh;
    assert.equal(runtime.connection.getState().status, 'closed');
    assert.equal(runtime.connection.getState().error, null);
    assert.deepEqual(runtime.connection.getState().pendingTaskIds, []);
    assert.deepEqual(runtime.store.getState().trips, []);
    assert.deepEqual(runtime.store.getState().feed, []);
    assert.deepEqual(runtime.store.getState().history, []);
  } finally { runtime.stop(); }
});

test('rota cancelada vira viagem encerrada com motivo do backend e evento TripCancelled', () => {
  const cancelled = { ...route, status: 'cancelada', cancelada_em: '2026-11-22T12:00:00Z', cancelada_por: 'CCO', cancelamento_motivo: 'Pedido cancelado' };
  const data = projectSnapshot({
    ...sample(), rotas: [cancelled], tasks: [], estadias: [],
    eventos: [{ id: 9, tipo: 'rota_cancelada', rota_id: 1, timestamp: '2026-11-22T12:00:00Z', mensagem: 'Rota 1 cancelada por CCO: Pedido cancelado',
      dados: { motivo: 'Pedido cancelado', por: 'CCO', status_anterior: 'em_transito' } }],
  }, new Map(), now);
  assert.equal(data.trips[0].phase, 'cancelled');
  assert.deepEqual(data.trips[0].backend.cancellation, { at: '2026-11-22T12:00:00Z', by: 'CCO', reason: 'Pedido cancelado' });
  const feed = data.feed.find((item) => item.type === 'TripCancelled');
  assert.ok(feed);
  assert.equal(feed.source, 'cco');
});

test('cancelamento REST prevalece sobre posição SSE antiga e não reabre a viagem', async () => {
  const testCase = fixture();
  const { runtime } = testCase;
  const pending = deferred();
  const cancelled = { ...sample(), rotas: [{ ...route, status: 'cancelada', cancelamento_motivo: 'Pedido cancelado', cancelada_por: 'CCO', cancelada_em: at }],
    tasks: [], estadias: [] };
  try {
    const source = await testCase.boot();
    testCase.current = cancelled;
    testCase.overrides.set('GET /cco/estado', () => pending.promise);
    const refresh = runtime.refresh();
    source.emit('posicao', { rota_id: 1, lat: -22.9, lng: -47.06, distancia_m: 10, eta_min: 0, status: 'aproximando' });
    pending.resolve(json(cancelled));
    await refresh;
    assert.equal(runtime.store.getState().trips[0].phase, 'cancelled');
    source.emit('posicao', { rota_id: 1, lat: -22.91, lng: -47.07, distancia_m: 5, eta_min: 0, status: 'no_destino' });
    const trip = runtime.store.getState().trips[0];
    assert.equal(trip.phase, 'cancelled');
    assert.equal(trip.backend.cancellation.reason, 'Pedido cancelado');
  } finally {
    pending.resolve(json(cancelled));
    runtime.stop();
  }
});
