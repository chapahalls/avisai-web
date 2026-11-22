/**
 * Executar: node --test docs/examples/mobile-client.test.mjs
 * Compila o exemplo isoladamente em /tmp. Não usa rede, backend, voz ou navegador.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const compiled = mkdtempSync(join(tmpdir(), 'avisai-mobile-example-'));
after(() => rmSync(compiled, { recursive: true, force: true }));
writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url)),
  '--ignoreConfig', '--strict', '--target', 'ES2022', '--module', 'ESNext',
  '--lib', 'ES2022,DOM', '--skipLibCheck', '--outDir', compiled,
  fileURLToPath(new URL('./mobile-client.ts', import.meta.url)),
], { encoding: 'utf8' });
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const { MobileApi, MobileController, MobileHttpError } = await import(pathToFileURL(join(compiled, 'mobile-client.js')));

const profiles = [
  { id: '10', email: 'ana@fixture.test', name: 'Ana', role: 'driver', driverId: 1, tripId: '1' },
  { id: '11', email: 'bia@fixture.test', name: 'Bia', role: 'driver', driverId: 2, tripId: '2' },
  { id: '12', email: 'cco@fixture.test', name: 'CCO', role: 'cco', driverId: null, tripId: null },
];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const session = (profile) => ({ token: 'mock-fixture', user: profile });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const waitFor = async (condition) => {
  for (let i = 0; i < 30; i++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(condition(), 'condição assíncrona não ocorreu');
};
const file = (routeId) => ({
  id: routeId * 10, rota_id: routeId, nome_original: `rota-${routeId}.pdf`,
  tipo_mime: 'application/pdf', tamanho_bytes: 4, categoria: 'documento',
  descricao: null, criado_em: '2026-11-22T12:00:00Z',
  url_download: `/rotas/${routeId}/arquivos/${routeId * 10}/download`,
});
const route = (routeId, driverId) => ({
  tripId: String(routeId), driverId, assignedAt: null, status: 'planejada',
  company: 'Fixture', driver: { name: 'Motorista fixture' }, plate: 'FIX-0001', invoice: 'NF-FIX',
  cargo: 'Fixture', weightT: 28, unloadWindow: '14h',
  origin: { name: 'Origem', lat: -23, lng: -46 },
  destination: { name: 'Destino', lat: -22, lng: -47 },
  polyline: [[-23, -46], [-22, -47]], receiver: { company: 'Fixture', name: 'Fixture', phone: '' },
  position: { lat: null, lng: null, distanceM: null, etaMin: null },
  channel: 'fixture', driverUid: driverId, agentUid: 9,
});

function harness(t, hook = () => undefined) {
  const assignments = new Map([[1, 1], [2, 2]]);
  const requests = [], sockets = [], streams = [], states = [], messages = [], errors = [];
  const api = new MobileApi('http://fixture.invalid:8000', {
    request: async (input, init) => {
      const url = new URL(input);
      requests.push({ url, init });
      const overridden = hook(url, init);
      if (overridden !== undefined) return overridden;
      if (url.pathname === '/usuarios') return json(profiles.filter((profile) => profile.role === url.searchParams.get('role')));
      if (url.pathname === '/auth/sso') {
        const profile = profiles.find((candidate) => candidate.email === JSON.parse(init.body).email);
        return profile ? json(session(profile)) : json({ detail: 'Usuário não encontrado' }, 404);
      }
      if (url.pathname === '/api/route') {
        const driverId = Number(url.searchParams.get('driverId'));
        const routeId = assignments.get(driverId);
        return routeId ? json(route(routeId, driverId)) : json({}, 404);
      }
      if (url.pathname === '/api/documents') return json([{ id: `mock-${url.searchParams.get('tripId')}`, mock: true }]);
      const match = url.pathname.match(/^\/rotas\/(\d+)\/arquivos(?:\/(\d+)\/download)?$/);
      if (match) return match[2] ? new Response('file') : json([file(Number(match[1]))]);
      throw new Error(`Requisição inesperada: ${url}`);
    },
  });
  const controller = new MobileController(api, {
    socket: (url) => {
      const socket = {
        url, closed: false, onopen: null, onmessage: null, onerror: null, onclose: null,
        close() { this.closed = true; },
      };
      sockets.push(socket);
      return socket;
    },
    sse: (url) => {
      const listeners = new Map();
      const stream = {
        url, closed: false, listeners, onopen: null, onerror: null,
        addEventListener(channel, listener) { listeners.set(channel, listener); },
        removeEventListener(channel, listener) { if (listeners.get(channel) === listener) listeners.delete(channel); },
        close() { this.closed = true; },
        emit(channel, data) { listeners.get(channel)?.({ data: JSON.stringify(data) }); },
      };
      streams.push(stream);
      return stream;
    },
  }, {
    state: (state) => states.push(state),
    message: (channel, value) => messages.push({ channel, value }),
    error: (error) => errors.push(error),
  });
  t.after(() => controller.close());
  return { api, controller, assignments, requests, sockets, streams, states, messages, errors };
}

test('lista usa /usuarios?role=driver e login preserva PK de usuário diferente de driverId', async (t) => {
  const { controller, requests } = harness(t);
  await controller.loadProfiles();
  assert.deepEqual(controller.snapshot.profiles.map((profile) => profile.id), ['10', '11']);
  assert.equal(requests[0].url.pathname + requests[0].url.search, '/usuarios?role=driver');
  await controller.selectProfile('10');
  assert.equal(controller.snapshot.session.user.id, '10');
  assert.equal(controller.snapshot.session.user.driverId, 1);
  assert.equal(controller.snapshot.journey.route.tripId, '1');
  await assert.rejects(controller.selectProfile('12'), /indisponível/);
});

test('login rejeita perfil divergente e desconhecido sem buscar rota', async (t) => {
  const wrong = harness(t, (url) => url.pathname === '/auth/sso' ? json(session(profiles[1])) : undefined);
  await assert.rejects(wrong.api.loginMock(profiles[0]), /não corresponde/);
  assert.ok(!wrong.requests.some(({ url }) => url.pathname === '/api/route'));
  const unknown = harness(t);
  await assert.rejects(
    unknown.api.loginMock({ ...profiles[0], email: 'desconhecido@fixture.test' }),
    (error) => error instanceof MobileHttpError && error.status === 404,
  );
});

test('contrato rejeita motorista sem vínculo e CCO com vínculo operacional', async (t) => {
  for (const invalid of [
    { ...profiles[0], driverId: null },
    { ...profiles[2], driverId: 1 },
    { ...profiles[2], tripId: '1' },
  ]) {
    const app = harness(t, (url) => url.pathname === '/usuarios' ? json([invalid]) : undefined);
    await app.controller.loadProfiles();
    assert.equal(app.errors.length, 1);
    assert.deepEqual(app.controller.snapshot.profiles, []);
  }
});

test('troca limpa a viagem imediatamente, fecha WS/SSE e ignora callbacks antigos', async (t) => {
  const nextLogin = deferred();
  const app = harness(t, (url, init) =>
    url.pathname === '/auth/sso' && JSON.parse(init.body).email === profiles[1].email ? nextLogin.promise : undefined);
  await app.controller.loadProfiles();
  await app.controller.selectProfile('10');
  const oldSocketMessage = app.sockets[0].onmessage;
  const oldSsePosition = app.streams[0].listeners.get('posicao');
  const switching = app.controller.selectProfile('11');
  assert.equal(app.controller.snapshot.identity, 'signing-in');
  assert.deepEqual(app.controller.snapshot.journey, { route: null, documents: [], files: [] });
  assert.equal(app.sockets[0].closed, true);
  assert.equal(app.streams[0].closed, true);
  oldSocketMessage({ data: JSON.stringify({ canal: 'reset', dado: {} }) });
  oldSsePosition({ data: JSON.stringify({ rota_id: 1, lat: -23, lng: -46 }) });
  assert.equal(app.messages.length, 0);
  nextLogin.resolve(json(session(profiles[1])));
  await switching;
  assert.equal(app.controller.snapshot.journey.route.tripId, '2');
  assert.equal(app.controller.snapshot.session.user.id, '11');
  assert.equal(app.sockets.length, 2);
  assert.equal(app.streams.length, 2);
});

for (const lateRead of ['route', 'files']) {
  test(`resposta atrasada de ${lateRead} não contamina o novo usuário mesmo ignorando AbortSignal`, async (t) => {
    const pending = deferred();
    let oldRequest;
    const app = harness(t, (url, init) => {
      const matches = lateRead === 'route'
        ? url.pathname === '/api/route' && url.searchParams.get('driverId') === '1'
        : url.pathname === '/rotas/1/arquivos';
      if (matches) { oldRequest = init; return pending.promise; }
      return undefined;
    });
    await app.controller.loadProfiles();
    const first = app.controller.selectProfile('10');
    await waitFor(() => oldRequest);
    const stateIndex = app.states.length;
    await app.controller.selectProfile('11');
    assert.equal(oldRequest.signal.aborted, true);
    pending.resolve(json(lateRead === 'route' ? route(1, 1) : [file(1)]));
    await first;
    assert.equal(app.controller.snapshot.journey.route.tripId, '2');
    assert.deepEqual(app.controller.snapshot.journey.files.map(({ rota_id }) => rota_id), [2]);
    assert.ok(app.states.slice(stateIndex).every((state) => state.journey.route?.driverId !== 1));
    assert.equal(app.errors.length, 0);
  });
}

test('geração descarta resposta de provedor que conclui mesmo após cancelamento', async (t) => {
  const pending = deferred();
  const app = harness(t);
  const currentJourney = app.api.currentJourney.bind(app.api);
  app.api.currentJourney = (driverId, signal) =>
    driverId === 1 ? pending.promise : currentJourney(driverId, signal);
  await app.controller.loadProfiles();
  const first = app.controller.selectProfile('10');
  await waitFor(() => app.controller.snapshot.journeyLoading);
  await app.controller.selectProfile('11');
  pending.resolve({ route: route(1, 1), documents: [], files: [file(1)] });
  await first;
  assert.equal(app.controller.snapshot.session.user.id, '11');
  assert.equal(app.controller.snapshot.journey.route.tripId, '2');
  assert.equal(app.streams.length, 1);
});

test('logout durante login cancela HTTP e impede criação tardia de streams', async (t) => {
  const pending = deferred();
  let request;
  const app = harness(t, (url, init) => {
    if (url.pathname === '/auth/sso') { request = init; return pending.promise; }
    return undefined;
  });
  await app.controller.loadProfiles();
  const first = app.controller.selectProfile('10');
  app.controller.logout();
  assert.equal(request.signal.aborted, true);
  pending.resolve(json(session(profiles[0])));
  await first;
  assert.equal(app.controller.snapshot.identity, 'signed-out');
  assert.equal(app.controller.snapshot.session, null);
  assert.equal(app.sockets.length, 0);
  assert.equal(app.streams.length, 0);
});

test('mudança da viagem fecha SSE anterior e invalida download pendente', async (t) => {
  const pending = deferred();
  let downloadRequest;
  const app = harness(t, (url, init) => {
    if (url.pathname.endsWith('/download')) { downloadRequest = init; return pending.promise; }
    return undefined;
  });
  await app.controller.loadProfiles();
  await app.controller.selectProfile('10');
  const downloading = app.controller.downloadFile(10);
  await assert.rejects(app.controller.downloadFile(999), /não pertence/);
  const oldStream = app.streams[0];
  const oldPosition = oldStream.listeners.get('posicao');
  app.assignments.set(1, 3);
  await app.controller.refresh();
  assert.equal(oldStream.closed, true);
  assert.equal(downloadRequest.signal.aborted, true);
  assert.equal(app.controller.snapshot.journey.route.tripId, '3');
  oldPosition({ data: JSON.stringify({ rota_id: 1, lat: -23, lng: -46 }) });
  assert.equal(app.messages.length, 0);
  pending.resolve(new Response('old-file'));
  assert.equal(await downloading, null);
});

test('SSE filtra outra rota; reset e abertura WS fazem refetch; sem rota limpa os anexos', async (t) => {
  const app = harness(t);
  await app.controller.loadProfiles();
  await app.controller.selectProfile('10');
  const stream = app.streams[0];
  stream.emit('posicao', { rota_id: 2, lat: -23, lng: -46 });
  stream.emit('posicao', { rota_id: 1, lat: -23, lng: -46 });
  assert.equal(app.messages.length, 1);
  let before = app.requests.filter(({ url }) => url.pathname === '/api/route').length;
  stream.emit('reset', {});
  await waitFor(() => app.requests.filter(({ url }) => url.pathname === '/api/route').length > before);
  await waitFor(() => !app.controller.snapshot.journeyLoading);
  before = app.requests.filter(({ url }) => url.pathname === '/api/route').length;
  app.sockets[0].onopen();
  await waitFor(() => app.requests.filter(({ url }) => url.pathname === '/api/route').length > before);
  await waitFor(() => !app.controller.snapshot.journeyLoading);
  app.assignments.delete(1);
  await app.controller.refresh();
  assert.deepEqual(app.controller.snapshot.journey, { route: null, documents: [], files: [] });
  assert.equal(stream.closed, true);
  assert.equal(app.controller.snapshot.session.user.driverId, 1);
});

test('fechar durante a listagem descarta sua resposta e proíbe reutilizar o controlador', async (t) => {
  const pending = deferred();
  let request;
  const app = harness(t, (url, init) => {
    if (url.pathname === '/usuarios') { request = init; return pending.promise; }
    return undefined;
  });
  const loading = app.controller.loadProfiles();
  app.controller.close();
  const count = app.states.length;
  assert.equal(request.signal.aborted, true);
  pending.resolve(json(profiles));
  await loading;
  assert.equal(app.states.length, count);
  assert.deepEqual(app.controller.snapshot.profiles, []);
  await assert.rejects(app.controller.loadProfiles(), /encerrado/);
});

test('REST recuperado limpa stale sem esconder desconexão de WS ou SSE', async (t) => {
  let failRead = false;
  const app = harness(t, (url) => url.pathname === '/api/route' && failRead ? json({}, 500) : undefined);
  await app.controller.loadProfiles();
  await app.controller.selectProfile('10');
  app.sockets[0].onopen();
  await waitFor(() => !app.controller.snapshot.journeyLoading);
  assert.equal(app.controller.snapshot.connection, 'connected');
  failRead = true;
  await app.controller.refresh();
  assert.equal(app.controller.snapshot.connection, 'stale');
  failRead = false;
  await app.controller.refresh();
  assert.equal(app.controller.snapshot.connection, 'connected');
  app.sockets[0].onerror();
  await app.controller.refresh();
  assert.equal(app.controller.snapshot.connection, 'stale');
  app.sockets[0].onopen();
  await waitFor(() => !app.controller.snapshot.journeyLoading);
  app.streams[0].onerror();
  await app.controller.refresh();
  assert.equal(app.controller.snapshot.connection, 'stale');
  app.streams[0].onopen();
  await waitFor(() => !app.controller.snapshot.journeyLoading);
  assert.equal(app.controller.snapshot.connection, 'connected');
});
