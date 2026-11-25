import test from 'node:test';
import assert from 'node:assert/strict';
import { File as NodeFile } from 'node:buffer';
import { ApiClient, ApiError } from '../.cache/tests/services/api/client.js';

const at = '2026-11-22T08:00:00Z';
const route = {
  id: 1, empresa_id: 1, motorista_id: 1,
  origem_nome: 'CD fictício', origem_lat: -23.1857, origem_lng: -46.8978,
  destino_nome: 'Destino fictício', destino_lat: -22.9056, destino_lng: -47.0608,
  status: 'planejada', placa: 'TEST-001', nota_fiscal: 'NF-DEMO', carga_descricao: 'Bebidas fictícias',
  carga_t: 28, janela_descarga: '14h às 16h', recebedor_empresa: 'Empresa fictícia',
  recebedor_nome: 'Recebedor fictício', recebedor_telefone_e164: '',
  aproximacao_min: 15, raio_chegada_m: 300, ultima_lat: null, ultima_lng: null,
  ultima_posicao_em: null, eta_min: null, distancia_m: null, motorista_nome: 'Motorista fictício',
  canal_motorista: 'fixture-channel', uid_motorista: 1001, uid_cco: 2001, uid_agente: 9001,
};
const task = {
  id: 2, rota_id: 1, tipo: 'chegada', status: 'pendente', prioridade: 'normal',
  tentativas: 1, canal_atual: 'push', criada_em: at, ultima_notificacao: at,
  confirmado_em: null, confirmado_por: null, resposta_recebedor: null, concluida_em: null,
};
const stay = {
  estadia_id: 3, rota_id: 1, inicio: at, fim: null, encerrada: false,
  horas_paradas: 0, tempo_parado: '0h00', franquia_h: 5, franquia_restante_h: 5,
  franquia_restante: '5h00', horas_excedentes: 0, capacidade_t: 28, valor_t_h: 2.5,
  valor: 0, valor_fmt: 'R$ 0,00', aceleracao: 1,
};
const call = {
  id: 4, rota_id: 1, task_id: 2, motivo: 'cco_sem_resposta', modo: 'rtc', numero: '',
  canal: 'fixture-receiver', sessao_id: 5, agent_id: null, status: 'respondida',
  iniciada_em: at, encerrada_em: at, atendida: true, previsao: 'Em 30 minutos', doca: 'A-2',
  motivo_espera: null, resposta_resumo: 'Doca A-2', transcricao: [{ quem: 'recebedor', texto: 'Doca A-2', ts: 1795334400 }],
  erro: null, enviada_cco_em: at, enviada_motorista_em: null,
};
const event = { id: 6, tipo: 'chegada', rota_id: 1, timestamp: at, mensagem: 'Chegada fictícia', dados: { task_id: 2 } };
const occurrence = { id: 7, rota_id: 1, tipo: 'fila', descricao: 'Fila fictícia', lat: null, lng: null, timestamp: at, transcricao: null };
const snapshot = { rotas: [route], tasks: [task], estadias: [stay], ligacoes: [call], ocorrencias: [occurrence], eventos: [event] };
const driverMessage = {
  id: 14, rota_id: 1, remetente: 'Operador fixture', texto: 'Pare em local seguro.',
  status: 'falada', criada_em: at, falada_em: at, respondida_em: null,
  resposta: null, transcricao_resposta: null,
};
const agentCall = {
  id: 15, rota_id: 1, destino: 'operador', motivo: 'Pneu furado na BR-381',
  status: 'agora_tocando', twilio_sid: null, twilio_resultado: 'Twilio não configurado',
  agora_canal: 'agent-call-15', sessao_id: 16, iniciada_em: at, atendida_em: null,
  encerrada_em: null, erro: null,
};
const driver = { id: 8, empresa_id: 1, nome: 'Motorista fixture', telefone_e164: null, email: null };
const published = {
  ...route, status: 'publicada', motorista_id: null, motorista_nome: null,
  publicada_em: at, atribuida_em: null, raio_origem_m: 300,
  rastreador_lat: null, rastreador_lng: null, rastreador_em: null,
};
const metrics = {
  entregas: 0, horas_paradas_media: null, estadia_devida_total: 1.17,
  tempo_ate_acao_cco_min_media: null, tasks_escaladas: 2, pct_recebedores_avisados: null,
  pct_ligacoes_atendidas: null, pct_reportes_completos_1a: null, contatos_resolvidos_pelo_agente: 3,
  latencia_voz_ms: { p50: null, p95: null, amostras: 0 },
};
const receiver = {
  recebedor: 'Empresa fixture', responsavel: 'Recebedor fixture', telefone_e164: '+5511999999999',
  entregas: 0, espera_media_h: null, ligacoes: 2, ligacoes_atendidas: 1,
  estadia_devida: 1.17, avisados_antes_da_chegada: 1,
};
const invoice = {
  id: 'nfe-NF-DEMO', kind: 'NF-e', title: 'NF-e NF-DEMO', number: 'NF-DEMO',
  issuer: 'Empresa fixture', recipient: 'Recebedor fixture', weightKg: 28000, items: 'Bebidas fixture',
  valueBRL: 84230.5, fileUri: null, mock: true,
  campos: {
    numero: 'NF-DEMO', emitente: 'Empresa fixture', destinatario: 'Recebedor fixture',
    peso_kg: 28000, itens: 'Bebidas fixture', valor: 84230.5, chave: 'chave-fixture',
  },
};
const freight = {
  id: 'cte-771204', kind: 'CT-e', title: 'CT-e 771204', number: '771204',
  carrier: 'Empresa fixture', plate: 'TEST-001', freightBRL: 3120, fileUri: null, mock: true,
  campos: {
    numero: '771204', transportadora: 'Empresa fixture', placa: 'TEST-001', frete: 3120, nfe_referenciada: 'NF-DEMO',
  },
};
const centralRequest = {
  id: 9, rota_id: 1, pergunta: 'Qual o lacre?', resposta: null, status: 'perguntada',
  criada_em: at, respondida_em: null, transcricao: null,
};
const sso = {
  token: 'mock-fixture-token',
  user: { id: '1', email: 'cco@fixture.test', role: 'cco', name: 'CCO fixture', driverId: null, tripId: null },
};
const routeFile = {
  id: 12, rota_id: 1, nome_original: 'nota-fixture.pdf', tipo_mime: 'application/pdf',
  tamanho_bytes: 8, categoria: 'nota_fiscal', descricao: 'Nota da viagem fixture',
  criado_em: at, url_download: '/rotas/1/arquivos/12/download',
};
const jsonResponse = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const isApiError = (code, status) => (error) => {
  assert.ok(error instanceof ApiError);
  assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};

test('base REST aceita HTTP(S) ou prefixo relativo e rejeita URLs com credenciais e parâmetros', () => {
  for (const [input, expected] of [
    ['http://localhost:8000///', 'http://localhost:8000'],
    ['https://api.example.invalid/backend/', 'https://api.example.invalid/backend'],
    ['/api/', '/api'], ['api/v1/', '/api/v1'], ['', ''],
  ]) assert.equal(new ApiClient(input).baseURL, expected);
  for (const invalid of [
    'https://user:fixture-password@api.example.invalid',
    '/api?token=fixture-secret', '/api#fragment', '/api?', '/api#',
    '//api.example.invalid', 'file:///tmp/backend', 'javascript:fixture', 'localhost:8000',
    'https://api.example.invalid\\private', '/api prefix', 'https://',
  ]) assert.throws(() => new ApiClient(invalid), isApiError('invalid_configuration'));
  for (const timeoutMs of [0, -1, Infinity, NaN, 2_147_483_648]) {
    assert.throws(() => new ApiClient('/api', { timeoutMs }), isApiError('invalid_configuration'));
  }
});

test('REST usa endpoints e campos do backend, preservando 28 toneladas, doca textual e timestamps', async () => {
  const requests = [];
  const responses = [
    snapshot,
    { ...route, trajeto: [[route.origem_lat, route.origem_lng], [route.destino_lat, route.destino_lng]], ultima_posicao_em: '2026-11-22T08:00:00' },
    [task], [call], [event],
    { ...task, status: 'confirmada', confirmado_em: at, confirmado_por: 'Operador fictício' },
    { ...stay, encerrada: true, fim: at }, {},
  ];
  const api = new ApiClient('http://localhost:8000/api/', {
    fetch: async (url, options) => {
      requests.push({ url, options });
      assert.ok(options.signal instanceof AbortSignal);
      return jsonResponse(responses[requests.length - 1]);
    },
  });
  assert.deepEqual(await api.getSnapshot(), snapshot);
  const detail = await api.getRoute('1');
  assert.equal(detail.carga_t, 28);
  assert.equal(detail.ultima_posicao_em, '2026-11-22T08:00:00');
  assert.deepEqual(detail.trajeto[0], [route.origem_lat, route.origem_lng]);
  assert.deepEqual(await api.listTasks(), [task]);
  assert.equal((await api.listCalls())[0].doca, 'A-2');
  assert.deepEqual(await api.listEvents({ routeId: 1, limit: 200 }), [event]);
  assert.equal((await api.confirmTask(2, 'Operador fictício')).status, 'confirmada');
  assert.equal((await api.confirmUnload(1, 'Operador fictício')).encerrada, true);
  assert.deepEqual(await api.confirmUnload(1), {});
  assert.deepEqual(requests.map(({ url }) => url), [
    'http://localhost:8000/api/cco/estado', 'http://localhost:8000/api/rotas/1',
    'http://localhost:8000/api/tasks', 'http://localhost:8000/api/ligacoes',
    'http://localhost:8000/api/eventos?rota_id=1&limite=200',
    'http://localhost:8000/api/tasks/2/confirmar',
    'http://localhost:8000/api/rotas/1/descarga', 'http://localhost:8000/api/rotas/1/descarga',
  ]);
  assert.deepEqual(requests.map(({ options }) => options.method), ['GET', 'GET', 'GET', 'GET', 'GET', 'POST', 'POST', 'POST']);
  assert.deepEqual(JSON.parse(requests[5].options.body), { confirmado_por: 'Operador fictício' });
  assert.deepEqual(JSON.parse(requests[6].options.body), { por: 'Operador fictício' });
  assert.equal(requests[5].options.headers['Content-Type'], 'application/json');
  assert.ok(requests.slice(0, 5).every(({ options }) => options.body === undefined));
});

test('mensagem ao motorista e fallback do agente preservam thread, status e chamadas RTC', async () => {
  const requests = [];
  const operatorCall = { ...agentCall, app_id: 'agora-fixture', channel: 'agent-call-15', uid: 2001, token: 'token-fixture' };
  const responses = [[driverMessage], driverMessage, [agentCall], { chamada: operatorCall }, { ...agentCall, status: 'atendida', atendida_em: at }];
  const api = new ApiClient('/backend', {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(responses[requests.length - 1]);
    },
  });
  assert.deepEqual(await api.listDriverMessages(1), [driverMessage]);
  assert.deepEqual(await api.sendDriverMessage(1, ' Operador fixture ', ' Pare em local seguro. '), driverMessage);
  assert.deepEqual(await api.listAgentCalls({ routeId: 1, open: true }), [agentCall]);
  assert.deepEqual(await api.getCurrentOperatorCall(), { chamada: operatorCall });
  assert.equal((await api.answerOperatorCall(15)).status, 'atendida');
  assert.deepEqual(requests.map(({ url }) => url), [
    '/backend/rotas/1/mensagens',
    '/backend/rotas/1/mensagens',
    '/backend/cco/chamadas-agente?rota_id=1&abertas=true',
    '/backend/operador/chamadas/atual',
    '/backend/operador/chamadas/15/atender',
  ]);
  assert.deepEqual(requests.map(({ options }) => options.method), ['GET', 'POST', 'GET', 'GET', 'POST']);
  assert.deepEqual(JSON.parse(requests[1].options.body), { remetente: 'Operador fixture', texto: 'Pare em local seguro.' });
  assert.deepEqual(JSON.parse(requests[4].options.body), {});
});

test('rota publicada aceita motorista nulo, novos estados e metadados mantendo compatibilidade anterior', async () => {
  const samples = [
    published,
    {
      ...published, status: 'na_origem', motorista_id: 8, atribuida_em: at,
      rastreador_lat: -23, rastreador_lng: -47, rastreador_em: '2026-11-22T08:00:00',
    },
    route,
  ];
  const api = new ApiClient('/api', { fetch: async () => jsonResponse(samples.shift()) });
  assert.deepEqual(await api.getRoute(1), published);
  const pickup = await api.getRoute(1);
  assert.equal(pickup.status, 'na_origem');
  assert.equal(pickup.rastreador_lat, -23);
  assert.equal(pickup.motorista_id, 8);
  assert.deepEqual(await api.getRoute(1), route);
  for (const invalid of [
    { ...published, motorista_id: 0 }, { ...published, rastreador_lat: 91 },
    { ...published, rastreador_lng: -181 }, { ...published, publicada_em: 'data-inválida' },
    { ...published, raio_origem_m: '300' },
  ]) {
    const malformed = new ApiClient('/api', { fetch: async () => jsonResponse(invalid) });
    await assert.rejects(malformed.getRoute(1), isApiError('invalid_response'));
  }
});

test('publicação, atribuição, perfis persistidos, análises, documentos, solicitações e SSO seguem o contrato REST', async () => {
  const requests = [];
  const profiles = [{ id: '2', email: 'driver@fixture.test', role: 'driver', name: driver.nome, driverId: driver.id, tripId: null }];
  const newRoute = {
    origem: { nome: 'Origem fixture', lat: -23, lng: -47 },
    destino: { nome: 'Destino fixture', lat: -22, lng: -46 },
    recebedor: { empresa: 'Empresa fixture', nome: 'Recebedor fixture', telefone_e164: '+5511999999999' },
    carga_t: 28, motorista_id: 8, placa: 'TEST-001', nota_fiscal: 'NF-DEMO',
  };
  const assigned = { ...published, status: 'planejada', motorista_id: 8, motorista_nome: driver.nome, atribuida_em: at };
  const responses = [[driver], profiles, assigned, assigned, metrics, [receiver], [invoice, freight], [centralRequest], centralRequest, sso, sso];
  const api = new ApiClient('/backend', {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(responses[requests.length - 1]);
    },
  });
  assert.deepEqual(await api.listDrivers(), [driver]);
  assert.deepEqual(await api.listProfiles('driver'), profiles);
  assert.deepEqual(await api.publishRoute(newRoute), assigned);
  assert.deepEqual(await api.assignRoute('1', '8'), assigned);
  assert.deepEqual(await api.getMetrics(), metrics);
  assert.deepEqual(await api.getReceivers(), [receiver]);
  assert.deepEqual(await api.getDocuments(1), [invoice, freight]);
  assert.deepEqual(await api.getRequests(1), [centralRequest]);
  assert.deepEqual(await api.createRequest(1, centralRequest.pergunta), centralRequest);
  assert.deepEqual(await api.authSso('cco@fixture.test'), sso);
  assert.deepEqual(await api.authSso(), sso);
  assert.deepEqual(requests.map(({ url }) => url), [
    '/backend/motoristas', '/backend/usuarios?role=driver', '/backend/rotas', '/backend/rotas/1/atribuir',
    '/backend/api/metrics', '/backend/api/receivers', '/backend/api/documents?tripId=1',
    '/backend/rotas/1/solicitacoes', '/backend/rotas/1/solicitacoes', '/backend/auth/sso', '/backend/auth/sso',
  ]);
  assert.deepEqual(requests.map(({ options }) => options.method), [
    'GET', 'GET', 'POST', 'POST', 'GET', 'GET', 'GET', 'GET', 'POST', 'POST', 'POST',
  ]);
  assert.deepEqual(JSON.parse(requests[2].options.body), newRoute);
  assert.deepEqual(JSON.parse(requests[3].options.body), { motorista_id: 8 });
  assert.deepEqual(JSON.parse(requests[8].options.body), { pergunta: centralRequest.pergunta });
  assert.deepEqual(JSON.parse(requests[9].options.body), { email: 'cco@fixture.test' });
  assert.deepEqual(JSON.parse(requests[10].options.body), {});
});

test('novos DTOs incompatíveis são rejeitados sem completar métricas, documentos ou usuários', async () => {
  for (const [payload, request] of [
    [[{ ...driver, id: null }], (api) => api.listDrivers()],
    [{ ...metrics, entregas: '0' }, (api) => api.getMetrics()],
    [{ ...metrics, latencia_voz_ms: { ...metrics.latencia_voz_ms, p95: 'sem dados' } }, (api) => api.getMetrics()],
    [[{ ...receiver, espera_media_h: '0' }], (api) => api.getReceivers()],
    [[{ ...invoice, mock: false }], (api) => api.getDocuments(1)],
    [[{ ...freight, campos: { ...freight.campos, frete: '3120' } }], (api) => api.getDocuments(1)],
    [[{ ...centralRequest, status: 'confirmada' }], (api) => api.getRequests(1)],
    [{ ...centralRequest, resposta: [] }, (api) => api.createRequest(1, 'fixture')],
    [{ ...sso, user: { ...sso.user, role: 'administrador' } }, (api) => api.authSso()],
  ]) {
    const api = new ApiClient('/api', { fetch: async () => jsonResponse(payload) });
    await assert.rejects(request(api), isApiError('invalid_response'));
  }
});

test('perfis persistidos são consultados por papel e preservam motorista sem viagem', async () => {
  const profiles = [
    { id: '2', email: 'driver@fixture.test', role: 'driver', name: 'Motorista fixture', driverId: 8, tripId: '1' },
    { id: '3', email: 'free@fixture.test', role: 'driver', name: 'Sem viagem', driverId: 9, tripId: null },
  ];
  const requests = [];
  const api = new ApiClient('/backend', { fetch: async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(requests.length === 1 ? [sso.user, ...profiles] : profiles);
  } });
  assert.deepEqual(await api.listProfiles(), [sso.user, ...profiles]);
  assert.deepEqual(await api.listProfiles('driver'), profiles);
  assert.deepEqual(requests.map(({ url }) => url), ['/backend/usuarios', '/backend/usuarios?role=driver']);
  assert.ok(requests.every(({ options }) => options.method === 'GET' && options.body === undefined));
  assert.throws(() => api.listProfiles('admin'), isApiError('invalid_input'));
});

test('perfis inválidos ou de outro papel não entram na seleção de usuários', async () => {
  const driverProfile = { id: '2', email: 'driver@fixture.test', role: 'driver', name: 'Motorista fixture', driverId: 8, tripId: null };
  for (const profile of [
    { ...sso.user, id: 'cco@fixture.test' },
    { ...sso.user, driverId: 8 },
    { ...sso.user, tripId: '1' },
    { ...driverProfile, driverId: null },
    { ...driverProfile, tripId: 'api-route-1' },
    { ...driverProfile, role: 'admin' },
  ]) {
    const api = new ApiClient('/backend', { fetch: async () => jsonResponse([profile]) });
    await assert.rejects(api.listProfiles(), isApiError('invalid_response'));
  }
  const wrongRole = new ApiClient('/backend', { fetch: async () => jsonResponse([driverProfile]) });
  await assert.rejects(wrongRole.listProfiles('cco'), isApiError('invalid_response'));
});

test('payload inválido de publicação e IDs inválidos não chegam ao transporte', () => {
  let requests = 0;
  const api = new ApiClient('/api', { fetch: async () => { requests++; return jsonResponse({}); } });
  const valid = {
    origem: { nome: 'Origem fixture', lat: -23, lng: -47 },
    destino: { nome: 'Destino fixture', lat: -22, lng: -46 },
    recebedor: { empresa: 'Empresa fixture', nome: 'Recebedor fixture', telefone_e164: '+5511999999999' },
    carga_t: 28,
  };
  for (const input of [
    { ...valid, carga_t: 0 }, { ...valid, origem: { ...valid.origem, lat: 91 } },
    { ...valid, recebedor: { ...valid.recebedor, telefone_e164: '123' } }, { ...valid, motorista_id: 0 },
  ]) assert.throws(() => api.publishRoute(input), isApiError('invalid_input'));
  assert.throws(() => api.createRequest(1, {}), isApiError('invalid_input'));
  assert.throws(() => api.authSso({}), isApiError('invalid_input'));
  for (const request of [
    () => api.assignRoute('../1', 8), () => api.assignRoute(1, '8?secret=fixture'),
    () => api.getDocuments('../1'), () => api.getRequests(0), () => api.createRequest(-1, 'fixture'),
  ]) assert.throws(request, isApiError('invalid_id'));
  assert.equal(requests, 0);
});

test('arquivo real usa multipart, preserva bytes e deixa o navegador definir Content-Type', async () => {
  const requests = [];
  const content = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
  const file = new NodeFile([content], 'nota-fixture.pdf', { type: 'application/pdf' });
  const api = new ApiClient('/backend', {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(options.method === 'GET' ? [routeFile] : routeFile);
    },
  });
  assert.deepEqual(await api.listRouteFiles(1), [routeFile]);
  assert.deepEqual(await api.uploadRouteFile(1, file, { categoria: 'nota_fiscal', descricao: routeFile.descricao }), routeFile);
  assert.deepEqual(await api.uploadRouteFile(1, file), routeFile);
  assert.deepEqual(requests.map(({ url }) => url), ['/backend/rotas/1/arquivos', '/backend/rotas/1/arquivos', '/backend/rotas/1/arquivos']);
  const body = requests[1].options.body;
  assert.ok(body instanceof FormData);
  assert.equal(requests[1].options.headers, undefined);
  assert.equal(body.get('arquivo').name, file.name);
  assert.equal(body.get('arquivo').type, 'application/pdf');
  assert.deepEqual(new Uint8Array(await body.get('arquivo').arrayBuffer()), content);
  assert.equal(body.get('categoria'), 'nota_fiscal');
  assert.equal(body.get('descricao'), routeFile.descricao);
  assert.equal(requests[2].options.body.has('categoria'), false);
  assert.equal(requests[2].options.body.has('descricao'), false);
});

test('download usa base e IDs confiáveis, nunca URL devolvida no metadado do arquivo', async () => {
  const urls = [];
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
  const api = new ApiClient('https://backend.fixture.invalid/api', {
    fetch: async (url) => {
      urls.push(url);
      return urls.length === 1
        ? jsonResponse([{ ...routeFile, url_download: 'https://terceiro.fixture.invalid/arquivo?token=fixture-private' }])
        : new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="nota-fixture.pdf"' } });
    },
  });
  const [metadata] = await api.listRouteFiles(1);
  const downloaded = await api.downloadRouteFile(metadata.rota_id, metadata.id);
  assert.ok(downloaded instanceof Blob);
  assert.equal(downloaded.type, 'application/pdf');
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
  assert.deepEqual(urls, [
    'https://backend.fixture.invalid/api/rotas/1/arquivos',
    'https://backend.fixture.invalid/api/rotas/1/arquivos/12/download',
  ]);
  const wrongMime = new ApiClient('/api', { fetch: async () => jsonResponse({ erro: 'fixture-private' }) });
  await assert.rejects(wrongMime.downloadRouteFile(1, 12), isApiError('invalid_response'));
});

test('arquivos rejeitam DTO, categoria e IDs inválidos e erros de upload não recebem retry', async () => {
  const file = new NodeFile(['%PDF-1.7'], 'nota-fixture.pdf', { type: 'application/pdf' });
  for (const status of [413, 415]) {
    let requests = 0;
    const api = new ApiClient('/api', {
      fetch: async () => { requests++; return new Response('fixture-private', { status }); },
    });
    await assert.rejects(api.uploadRouteFile(1, file), isApiError('http_error', status));
    assert.equal(requests, 1);
  }
  for (const invalid of [
    { ...routeFile, tamanho_bytes: '8' }, { ...routeFile, criado_em: 'invalid' }, { ...routeFile, categoria: 'xml' },
  ]) {
    const api = new ApiClient('/api', { fetch: async () => jsonResponse([invalid]) });
    await assert.rejects(api.listRouteFiles(1), isApiError('invalid_response'));
  }
  let requests = 0;
  const api = new ApiClient('/api', { fetch: async () => { requests++; return jsonResponse({}); } });
  assert.throws(() => api.uploadRouteFile(1, file, { categoria: 'xml' }), isApiError('invalid_input'));
  assert.throws(() => api.uploadRouteFile(1, file, { descricao: 'a'.repeat(1001) }), isApiError('invalid_input'));
  assert.throws(() => api.uploadRouteFile('../1', file), isApiError('invalid_id'));
  assert.throws(() => api.downloadRouteFile(1, '../12'), isApiError('invalid_id'));
  assert.equal(requests, 0);
});

test('IDs inválidos não chegam à rede nem conseguem alterar o caminho da ação', () => {
  let requests = 0;
  const api = new ApiClient('/api', { fetch: async () => { requests += 1; return jsonResponse({}); } });
  for (const id of [0, -1, 1.5, Infinity, NaN, '01', '1/../2', '1?token=fixture', '1#fragment', Number.MAX_SAFE_INTEGER + 1]) {
    for (const action of [() => api.getRoute(id), () => api.confirmTask(id), () => api.confirmUnload(id)]) {
      assert.throws(action, isApiError('invalid_id'));
    }
  }
  assert.throws(() => api.listEvents({ routeId: '../1' }), isApiError('invalid_id'));
  assert.throws(() => api.listEvents({ limit: -1 }), isApiError('invalid_id'));
  assert.equal(requests, 0);
});

test('falhas HTTP e de rede ocultam corpo/URL e POST não recebe retry automático', async () => {
  let requests = 0;
  let canceledBodies = 0;
  const api = new ApiClient('/api', {
    fetch: async () => {
      requests += 1;
      return {
        ok: false, status: 503,
        body: { async cancel() { canceledBodies += 1; } },
        json() { assert.fail('corpo de erro não deve ser lido'); },
      };
    },
  });
  await assert.rejects(api.confirmTask(2), (error) => {
    assert.ok(isApiError('http_error', 503)(error));
    assert.equal(error.message, 'api_http_error_503');
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  });
  assert.equal(requests, 1);
  assert.equal(canceledBodies, 1);
  const offline = new ApiClient('/api', { fetch: async () => { throw new Error('https://fixture.invalid?key=fixture-private'); } });
  await assert.rejects(offline.getSnapshot(), (error) => {
    assert.ok(isApiError('network_error')(error));
    assert.ok(!JSON.stringify(error).includes('fixture-private'));
    assert.equal(error.message, 'api_network_error');
    return true;
  });
});

test('JSON inválido e DTOs incompatíveis falham antes de chegar ao consumidor', async () => {
  for (const response of [
    new Response('fixture-private: não é JSON', { status: 200 }),
    jsonResponse({ ...snapshot, rotas: [{ ...route, carga_t: '28' }] }),
    jsonResponse({ ...snapshot, rotas: [{ ...route, carga_t: -1 }] }),
    jsonResponse({ ...snapshot, ligacoes: [{ ...call, doca: 2 }] }),
    jsonResponse({ ...snapshot, tasks: [{ ...task, status: 'invalid-status' }] }),
    jsonResponse({ ...snapshot, eventos: [{ ...event, dados: [] }] }),
  ]) {
    const api = new ApiClient('/api', { fetch: async () => response });
    await assert.rejects(api.getSnapshot(), isApiError('invalid_response'));
  }
  const invalidGeometry = new ApiClient('/api', { fetch: async () => jsonResponse({ ...route, trajeto: [[1, 'invalid']] }) });
  await assert.rejects(invalidGeometry.getRoute(1), isApiError('invalid_response'));
});

test('REST rejeita coordenadas fora dos limites geográficos em rota, trajeto e ocorrência', async () => {
  for (const field of ['origem_lat', 'destino_lat', 'ultima_lat', 'origem_lng', 'destino_lng', 'ultima_lng']) {
    const limit = field.endsWith('_lat') ? 90 : 180;
    for (const value of [limit + 0.0001, -limit - 0.0001]) {
      const invalidRoute = { ...route, [field]: value };
      const api = new ApiClient('/api', { fetch: async () => jsonResponse({ ...snapshot, rotas: [invalidRoute] }) });
      await assert.rejects(api.getSnapshot(), isApiError('invalid_response'), `${field}=${value}`);
    }
  }
  for (const point of [[91, 0], [-91, 0], [0, 181], [0, -181]]) {
    const api = new ApiClient('/api', { fetch: async () => jsonResponse({ ...route, trajeto: [point] }) });
    await assert.rejects(api.getRoute(1), isApiError('invalid_response'));
  }
  for (const invalidOccurrence of [{ ...occurrence, lat: 91 }, { ...occurrence, lng: -181 }]) {
    const api = new ApiClient('/api', { fetch: async () => jsonResponse({ ...snapshot, ocorrencias: [invalidOccurrence] }) });
    await assert.rejects(api.getSnapshot(), isApiError('invalid_response'));
  }
  const boundaryRoute = {
    ...route, origem_lat: -90, origem_lng: -180, destino_lat: 90, destino_lng: 180,
    ultima_lat: 90, ultima_lng: -180, trajeto: [[-90, -180], [90, 180]],
  };
  const boundary = new ApiClient('/api', { fetch: async () => jsonResponse(boundaryRoute) });
  assert.deepEqual(await boundary.getRoute(1), boundaryRoute);
});

test('timeout e cancelamento abortam o fetch e limpam timer e listener externo', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Set();
  const external = new AbortController();
  const listeners = new Set();
  const add = external.signal.addEventListener.bind(external.signal);
  const remove = external.signal.removeEventListener.bind(external.signal);
  external.signal.addEventListener = (type, listener, options) => {
    if (type === 'abort') listeners.add(listener);
    add(type, listener, options);
  };
  external.signal.removeEventListener = (type, listener, options) => {
    if (type === 'abort') listeners.delete(listener);
    remove(type, listener, options);
  };
  try {
    globalThis.setTimeout = (...args) => {
      const timer = nativeSetTimeout(...args);
      timers.add(timer);
      return timer;
    };
    globalThis.clearTimeout = (timer) => { timers.delete(timer); return nativeClearTimeout(timer); };
    let requestSignal;
    const stalled = new ApiClient('/api', {
      timeoutMs: 10,
      fetch: async (_, options) => { requestSignal = options.signal; return new Promise(() => {}); },
    });
    await assert.rejects(stalled.getSnapshot(external.signal), isApiError('timeout'));
    assert.equal(requestSignal.aborted, true);
    assert.equal(timers.size, 0);
    assert.equal(listeners.size, 0);

    const cancelable = new ApiClient('/api', {
      fetch: async (_, options) => {
        requestSignal = options.signal;
        queueMicrotask(() => external.abort());
        return new Promise(() => {});
      },
    });
    await assert.rejects(cancelable.getSnapshot(external.signal), isApiError('aborted'));
    assert.equal(requestSignal.aborted, true);
    assert.equal(timers.size, 0);
    assert.equal(listeners.size, 0);
    let started = false;
    const neverStarted = new ApiClient('/api', { fetch: async () => { started = true; return jsonResponse(snapshot); } });
    await assert.rejects(neverStarted.getSnapshot(external.signal), isApiError('aborted'));
    assert.equal(started, false);
    assert.equal(timers.size, 0);

    const successful = new ApiClient('/api', { fetch: async () => jsonResponse(snapshot) });
    assert.deepEqual(await successful.getSnapshot(), snapshot);
    assert.equal(timers.size, 0);
  } finally {
    for (const timer of timers) nativeClearTimeout(timer);
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  }
});

class FakeEventSource {
  readyState = 0;
  onopen = null;
  onerror = null;
  listeners = new Map();
  closeCount = 0;
  constructor(url) { this.url = url; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  close() { this.closeCount += 1; this.readyState = 2; }
  emit(type, data) { this.listeners.get(type)?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
}

test('SSE recebe todos os canais, informa reconexão nativa e unsubscribe impede callbacks tardios', () => {
  let source;
  const statuses = [];
  const errors = [];
  const received = [];
  const payloads = {
    snapshot, evento: event, task: { task },
    posicao: { rota_id: 1, lat: -23, lng: -47, distancia_m: 1200, eta_min: 1.2, status: 'aproximando' },
    fala: { rota_id: 1, papel: 'motorista', texto: 'Relato fictício' },
    contador: { estadias: [stay] }, reset: { rota_id: 1 },
    chamado: { chamado: {
      id: 8, rota_id: 1, tipo: 'chegada', assunto: 'Chegada',
      descricao: 'Aguardando orientação', km: null, rodovia: null, ocorrencia_id: null,
      status: 'aguardando_cco', tentativas: 0, max_tentativas: 5, intervalo_s: 30,
      criada_em: '2026-11-22T14:32:00Z', ultima_notificacao: null, respondida_em: null,
      resposta: null, respondido_por: null, transcricao: null,
    } },
  };
  const api = new ApiClient('/api/', { eventSource: (url) => { source = new FakeEventSource(url); return source; } });
  const close = api.subscribe({
    ...Object.fromEntries(Object.keys(payloads).map((channel) => [channel, (data) => received.push({ channel, data })])),
    onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error),
  });
  assert.equal(source.url, '/api/cco/stream');
  assert.deepEqual([...source.listeners.keys()], Object.keys(payloads));
  source.readyState = 1;
  source.onopen({});
  for (const [channel, data] of Object.entries(payloads)) source.emit(channel, data);
  assert.deepEqual(received, Object.entries(payloads).map(([channel, data]) => ({ channel, data })));
  source.readyState = 0;
  source.onerror({});
  source.readyState = 1;
  source.onopen({});
  source.readyState = 2;
  source.onerror({});
  assert.deepEqual(statuses, ['connecting', 'connected', 'reconnecting', 'connected', 'error']);
  assert.equal(errors.length, 1);
  assert.ok(isApiError('stream_error')(errors[0]));
  const lateOpen = source.onopen;
  const lateError = source.onerror;
  const lateEvent = source.listeners.get('evento');
  close();
  close();
  lateOpen({});
  lateError({});
  lateEvent({ data: JSON.stringify(event) });
  assert.equal(source.closeCount, 1);
  assert.equal(source.listeners.size, 0);
  assert.equal(source.onopen, null);
  assert.equal(source.onerror, null);
  assert.equal(received.length, Object.keys(payloads).length);
  assert.deepEqual(statuses.slice(-1), ['closed']);
});

test('SSE distingue celular e rastreador sem exigir ETA ou status do GPS do caminhão', () => {
  let source;
  const received = [];
  const errors = [];
  const api = new ApiClient('/api', { eventSource: (url) => { source = new FakeEventSource(url); return source; } });
  const close = api.subscribe({ posicao: (data) => received.push(data), onError: (error) => errors.push(error) });
  try {
    const tracker = { rota_id: 1, lat: -23, lng: -47, fonte: 'rastreador' };
    const mobile = { ...tracker, fonte: 'celular', distancia_m: 1500, eta_min: 2, status: 'na_origem' };
    const legacy = { rota_id: 1, lat: -23, lng: -47, distancia_m: 1500, eta_min: 2, status: 'planejada' };
    source.emit('posicao', tracker);
    source.emit('posicao', mobile);
    source.emit('posicao', legacy);
    assert.deepEqual(received, [tracker, mobile, legacy]);
    for (const invalid of [
      { ...tracker, fonte: 'celular' }, { ...tracker, fonte: 'desconhecida' },
      { ...tracker, lat: 91 }, { ...mobile, status: 'não-iniciado' },
    ]) source.emit('posicao', invalid);
    assert.equal(received.length, 3);
    assert.equal(errors.length, 4);
    assert.ok(errors.every((error) => isApiError('invalid_response')(error)));
    assert.equal(source.closeCount, 0);
  } finally { close(); }
});

test('SSE descarta JSON/DTO inválidos sem refletir conteúdo e mantém o stream utilizável', () => {
  let source;
  const errors = [];
  const received = [];
  const api = new ApiClient('/api', { eventSource: (url) => { source = new FakeEventSource(url); return source; } });
  const close = api.subscribe({ evento: (data) => received.push(data), onError: (error) => errors.push(error) });
  try {
    source.emit('evento', '{fixture-private');
    source.emit('evento', { ...event, id: '6' });
    source.emit('evento', { ...event, dados: null });
    source.emit('task', []);
    source.emit('posicao', { rota_id: 1, lat: 'invalid' });
    source.emit('fala', { rota_id: 1, papel: 'unknown', texto: 'fixture' });
    source.emit('reset', { rota_id: 0 });
    source.emit('contador', { estadias: [] });
    source.emit('unknown-channel', '{}');
    source.emit('evento', { ...event, tipo: 'novo_tipo_backend' });
    assert.equal(errors.length, 7);
    assert.ok(errors.every((error) => isApiError('invalid_response')(error)));
    assert.ok(errors.every((error) => !error.message.includes('fixture-private')));
    assert.equal(received.length, 1);
    assert.equal(received[0].tipo, 'novo_tipo_backend');
  } finally { close(); }
});

test('SSE ignora GPS fora dos limites, reporta erro seguro e aceita coordenadas nos limites', () => {
  let source;
  const errors = [];
  const received = [];
  const statuses = [];
  const position = { rota_id: 1, lat: 0, lng: 0, distancia_m: 1200, eta_min: 1.2, status: 'aproximando' };
  const api = new ApiClient('/api', { eventSource: (url) => { source = new FakeEventSource(url); return source; } });
  const close = api.subscribe({
    posicao: (data) => received.push(data), snapshot: (data) => received.push(data),
    onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error),
  });
  try {
    source.readyState = 1;
    source.onopen({});
    for (const invalid of [{ lat: 91 }, { lat: -91 }, { lng: 181 }, { lng: -181 }]) {
      source.emit('posicao', { ...position, ...invalid });
    }
    source.emit('snapshot', { ...snapshot, rotas: [{ ...route, ultima_lat: 91, ultima_lng: 0 }] });
    assert.equal(received.length, 0);
    assert.equal(errors.length, 5);
    assert.ok(errors.every((error) => isApiError('invalid_response')(error)));
    assert.ok(errors.every((error) => error.message === 'api_invalid_response'));
    assert.equal(source.closeCount, 0);
    assert.deepEqual(statuses, ['connecting', 'connected']);
    const boundary = { ...position, lat: -90, lng: 180 };
    source.emit('posicao', boundary);
    assert.deepEqual(received, [boundary]);
  } finally { close(); }
});

test('falha ao criar EventSource gera erro controlado sem URL ou causa', () => {
  const statuses = [];
  const errors = [];
  const api = new ApiClient('/api', { eventSource: () => { throw new Error('https://fixture.invalid?key=fixture-private'); } });
  const close = api.subscribe({ onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error) });
  assert.deepEqual(statuses, ['connecting', 'error']);
  assert.equal(errors.length, 1);
  assert.ok(isApiError('stream_unavailable')(errors[0]));
  assert.equal(Object.hasOwn(errors[0], 'cause'), false);
  assert.ok(!errors[0].message.includes('fixture-private'));
  assert.doesNotThrow(close);
});

test('token do SSO vai como Bearer em toda chamada e sai no logout', async () => {
  const requests = [];
  const api = new ApiClient('/backend', {
    fetch: async (url, options) => {
      requests.push(options.headers);
      return jsonResponse(requests.length === 1 ? sso : [driver]);
    },
  });
  await api.authSso('cco@fixture.test');
  api.setAccessToken('jwt.fixture.token');
  await api.listDrivers();
  api.setAccessToken(null);
  await api.listDrivers();
  assert.deepEqual(requests, [
    { 'Content-Type': 'application/json' },
    { Authorization: 'Bearer jwt.fixture.token' },
    undefined,
  ]);
});
