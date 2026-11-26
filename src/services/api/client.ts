import {
  BACKEND_STREAM_CHANNELS,
  type BackendCall,
  type BackendDocument,
  type BackendAgentCall,
  type BackendDriverRequest,
  type BackendDriverMessage,
  type BackendDriver,
  type BackendEvent,
  type BackendFile,
  type BackendMetrics,
  type BackendNewRoute,
  type BackendOccurrence,
  type BackendReceiver,
  type BackendRequest,
  type BackendRoute,
  type BackendSnapshot,
  type BackendStay,
  type BackendSsoResult,
  type BackendStreamChannel,
  type BackendStreamMessages,
  type BackendTask,
  type BackendUnloadResult,
  type BackendUserProfile,
  type BackendOperatorCallEnvelope,
} from './types.js';

export type ApiErrorCode = 'invalid_configuration' | 'invalid_id' | 'invalid_input' | 'http_error' | 'network_error'
  | 'timeout' | 'aborted' | 'invalid_response' | 'stream_error' | 'stream_unavailable';

/** Nunca armazena corpo, URL, causa ou mensagem recebida de terceiros. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(code: ApiErrorCode, status?: number) {
    super(code === 'http_error' && status !== undefined ? `api_http_error_${status}` : `api_${code}`);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export type ApiConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';
export type ApiStreamCallbacks = {
  [K in BackendStreamChannel]?: (data: BackendStreamMessages[K]) => void;
} & {
  onStatus?: (status: ApiConnectionStatus) => void;
  onError?: (error: ApiError) => void;
};

export interface ApiEventSource {
  readonly readyState: number;
  onopen: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  close(): void;
}

export interface ApiClientOptions {
  fetch?: typeof fetch;
  eventSource?: (url: string) => ApiEventSource;
  timeoutMs?: number;
}

type ApiId = number | string;
type Guard<T> = (value: unknown) => value is T;
type Check = (value: unknown) => boolean;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text: Check = (value) => typeof value === 'string';
const numeric: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const nonnegative: Check = (value) => numeric(value) && (value as number) >= 0;
const latitude: Check = (value) => numeric(value) && (value as number) >= -90 && (value as number) <= 90;
const longitude: Check = (value) => numeric(value) && (value as number) >= -180 && (value as number) <= 180;
const integer: Check = (value) => numeric(value) && Number.isSafeInteger(value);
const positiveId: Check = (value) => integer(value) && (value as number) > 0;
const boolean: Check = (value) => typeof value === 'boolean';
const timestamp: Check = (value) => text(value) && Number.isFinite(Date.parse(value as string));
const nullable = (check: Check): Check => (value) => value === null || check(value);
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const array = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
const oneOf = (...values: string[]): Check => (value) => typeof value === 'string' && values.includes(value);
const routeStatus = oneOf('publicada', 'planejada', 'na_origem', 'em_transito', 'aproximando', 'no_destino', 'descarregada');
const shape = (value: unknown, fields: Record<string, Check>) => record(value) && Object.entries(fields).every(([key, check]) => check(value[key]));

const isRoute: Guard<BackendRoute> = (value): value is BackendRoute => shape(value, {
  id: positiveId, empresa_id: positiveId, motorista_id: nullable(positiveId),
  publicada_em: optional(nullable(timestamp)), atribuida_em: optional(nullable(timestamp)),
  origem_nome: text, origem_lat: latitude, origem_lng: longitude,
  destino_nome: text, destino_lat: latitude, destino_lng: longitude,
  status: routeStatus, placa: text, nota_fiscal: text, carga_descricao: text, carga_t: nonnegative,
  janela_descarga: text, recebedor_empresa: text, recebedor_nome: text, recebedor_telefone_e164: text,
  aproximacao_min: numeric, raio_chegada_m: numeric, ultima_lat: nullable(latitude), ultima_lng: nullable(longitude),
  raio_origem_m: optional(numeric), rastreador_lat: optional(nullable(latitude)),
  rastreador_lng: optional(nullable(longitude)), rastreador_em: optional(nullable(timestamp)),
  ultima_posicao_em: nullable(timestamp), eta_min: nullable(numeric), distancia_m: nullable(numeric),
  motorista_nome: nullable(text), canal_motorista: text,
}) && record(value) && (value.trajeto === undefined || array((point) => Array.isArray(point) && point.length === 2 && latitude(point[0]) && longitude(point[1]))(value.trajeto));

const isTask: Guard<BackendTask> = (value): value is BackendTask => shape(value, {
  id: positiveId, rota_id: positiveId, tipo: text,
  status: oneOf('pendente', 'confirmada', 'escalada_recebedor', 'concluida'),
  prioridade: oneOf('normal', 'alta', 'critica'), tentativas: integer,
  canal_atual: nullable(oneOf('push', 'painel', 'ligacao')), criada_em: timestamp,
  ultima_notificacao: nullable(timestamp), confirmado_em: nullable(timestamp),
  confirmado_por: nullable(text), resposta_recebedor: nullable(text), concluida_em: nullable(timestamp),
});

const isStay: Guard<BackendStay> = (value): value is BackendStay => shape(value, {
  estadia_id: positiveId, rota_id: positiveId, inicio: timestamp, fim: nullable(timestamp), encerrada: boolean,
  horas_paradas: numeric, tempo_parado: text, franquia_h: numeric, franquia_restante_h: numeric,
  franquia_restante: text, horas_excedentes: numeric, capacidade_t: numeric, valor_t_h: numeric,
  valor: numeric, valor_fmt: text, aceleracao: numeric,
});

const isCall: Guard<BackendCall> = (value): value is BackendCall => shape(value, {
  id: positiveId, rota_id: positiveId, task_id: nullable(positiveId),
  motivo: oneOf('aproximacao', 'cco_sem_resposta'), modo: oneOf('rtc', 'sip'),
  numero: text, canal: nullable(text), sessao_id: nullable(positiveId), agent_id: nullable(text),
  status: oneOf('chamando', 'em_andamento', 'respondida', 'nao_atendida', 'falhou'),
  iniciada_em: timestamp, encerrada_em: nullable(timestamp), atendida: boolean,
  previsao: nullable(text), doca: nullable(text), motivo_espera: nullable(text), resposta_resumo: nullable(text),
  transcricao: array((line) => shape(line, { quem: oneOf('recebedor', 'agente'), texto: text, ts: numeric })),
  erro: nullable(text), enviada_cco_em: nullable(timestamp), enviada_motorista_em: nullable(timestamp),
});

const isEvent: Guard<BackendEvent> = (value): value is BackendEvent => shape(value, {
  id: positiveId, tipo: text, rota_id: nullable(positiveId), timestamp, mensagem: text, dados: record,
});

const isOccurrence: Guard<BackendOccurrence> = (value): value is BackendOccurrence => shape(value, {
  id: positiveId, rota_id: positiveId, tipo: text, descricao: text,
  lat: nullable(latitude), lng: nullable(longitude), timestamp, transcricao: nullable(text),
});

const isDriverRequest: Guard<BackendDriverRequest> = (value): value is BackendDriverRequest => shape(value, {
  id: positiveId, rota_id: positiveId, tipo: text, assunto: text, descricao: text,
  km: nullable(numeric), rodovia: nullable(text), ocorrencia_id: nullable(positiveId),
  status: oneOf('coletando', 'aguardando_cco', 'respondido', 'timeout'),
  tentativas: integer, max_tentativas: integer, intervalo_s: numeric,
  criada_em: timestamp, ultima_notificacao: nullable(timestamp), respondida_em: nullable(timestamp),
  resposta: nullable(text), respondido_por: nullable(text), transcricao: nullable(text),
});

const isDriverMessage: Guard<BackendDriverMessage> = (value): value is BackendDriverMessage => shape(value, {
  id: positiveId, rota_id: positiveId, remetente: text, texto: text,
  status: oneOf('enviada', 'falada', 'respondida', 'offline'),
  criada_em: timestamp, falada_em: nullable(timestamp), respondida_em: nullable(timestamp),
  resposta: nullable(text), transcricao_resposta: nullable(text),
});

const isAgentCall: Guard<BackendAgentCall> = (value): value is BackendAgentCall => shape(value, {
  id: positiveId, rota_id: positiveId, destino: oneOf('operador', 'supervisor', 'motorista'), motivo: text,
  status: oneOf('iniciada', 'twilio_atendida', 'agora_tocando', 'atendida', 'sem_resposta', 'escalada', 'falhou'),
  twilio_sid: nullable(text), twilio_resultado: nullable(text), agora_canal: nullable(text), sessao_id: nullable(positiveId),
  iniciada_em: timestamp, atendida_em: nullable(timestamp), encerrada_em: nullable(timestamp), erro: nullable(text),
});

const isOperatorCallEnvelope: Guard<BackendOperatorCallEnvelope> = (value): value is BackendOperatorCallEnvelope =>
  shape(value, {
    chamada: (candidate) => candidate === null || (
      isAgentCall(candidate)
      && record(candidate)
      && optional(text)(candidate.app_id)
      && optional(text)(candidate.channel)
      && optional(positiveId)(candidate.uid)
      && optional(text)(candidate.token)
    ),
  });

const isSnapshot: Guard<BackendSnapshot> = (value): value is BackendSnapshot => shape(value, {
  rotas: array(isRoute), tasks: array(isTask), estadias: array(isStay),
  ligacoes: array(isCall), ocorrencias: array(isOccurrence), eventos: array(isEvent),
  chamados: optional(array(isDriverRequest)),
});

const isDriver: Guard<BackendDriver> = (value): value is BackendDriver => shape(value, {
  id: positiveId, empresa_id: positiveId, nome: text, telefone_e164: nullable(text), email: nullable(text),
});

const count: Check = (value) => integer(value) && (value as number) >= 0;
const isMetrics: Guard<BackendMetrics> = (value): value is BackendMetrics => shape(value, {
  entregas: count, horas_paradas_media: nullable(numeric), estadia_devida_total: numeric,
  tempo_ate_acao_cco_min_media: nullable(numeric), tasks_escaladas: count,
  pct_recebedores_avisados: nullable(numeric), pct_ligacoes_atendidas: nullable(numeric),
  pct_reportes_completos_1a: nullable(numeric), contatos_resolvidos_pelo_agente: count,
  latencia_voz_ms: (latency) => shape(latency, { p50: nullable(numeric), p95: nullable(numeric), amostras: count }),
});

const isReceiver: Guard<BackendReceiver> = (value): value is BackendReceiver => shape(value, {
  recebedor: text, responsavel: text, telefone_e164: text, entregas: count,
  espera_media_h: nullable(numeric), ligacoes: count, ligacoes_atendidas: count,
  estadia_devida: numeric, avisados_antes_da_chegada: count,
});

const isDocument: Guard<BackendDocument> = (value): value is BackendDocument => shape(value, {
  id: text, title: text, number: text, fileUri: nullable(text), mock: (mock) => mock === true,
}) && record(value) && (
  value.kind === 'NF-e' && shape(value, {
    issuer: text, recipient: text, weightKg: numeric, items: text, valueBRL: numeric,
    campos: (fields) => shape(fields, {
      numero: text, emitente: text, destinatario: text, peso_kg: numeric, itens: text, valor: numeric, chave: text,
    }),
  })
  || value.kind === 'CT-e' && shape(value, {
    carrier: text, plate: text, freightBRL: numeric,
    campos: (fields) => shape(fields, {
      numero: text, transportadora: text, placa: text, frete: numeric, nfe_referenciada: text,
    }),
  })
);

const isRequest: Guard<BackendRequest> = (value): value is BackendRequest => shape(value, {
  id: positiveId, rota_id: positiveId, pergunta: text, resposta: nullable(text),
  status: oneOf('pendente', 'perguntada', 'respondida'), criada_em: timestamp,
  respondida_em: nullable(timestamp), transcricao: nullable(text),
});

const stringId: Check = (value) => typeof value === 'string'
  && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const isUserProfile: Guard<BackendUserProfile> = (value): value is BackendUserProfile => shape(value, {
  id: stringId, email: text, role: oneOf('cco', 'driver'), name: text,
  driverId: nullable(positiveId), tripId: nullable(stringId),
}) && record(value) && (value.role === 'driver' ? positiveId(value.driverId) : value.driverId === null && value.tripId === null);

const isSsoResult: Guard<BackendSsoResult> = (value): value is BackendSsoResult => shape(value, {
  token: text, user: isUserProfile,
});

const fileCategory = oneOf('documento', 'nota_fiscal', 'comprovante', 'imagem', 'outro');
const fileMime = oneOf('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif');
const isFile: Guard<BackendFile> = (value): value is BackendFile => shape(value, {
  id: positiveId, rota_id: positiveId, nome_original: text, tipo_mime: fileMime,
  tamanho_bytes: count, categoria: fileCategory, descricao: nullable(text), criado_em: timestamp, url_download: text,
});

const e164: Check = (value) => text(value) && /^\+[1-9]\d{7,14}$/.test(value as string);
const point: Check = (value) => shape(value, { nome: text, lat: latitude, lng: longitude });
const newRoute: Check = (value) => shape(value, {
  origem: point, destino: point,
  recebedor: (receiver) => shape(receiver, { empresa: text, nome: text, telefone_e164: e164 }),
  carga_t: (weight) => numeric(weight) && (weight as number) > 0,
  carga_descricao: optional(text), placa: optional(text), nota_fiscal: optional(text),
  janela_descarga: optional(text), empresa_id: optional(positiveId), motorista_id: positiveId,
});

function isStreamData<K extends BackendStreamChannel>(channel: K, value: unknown): value is BackendStreamMessages[K] {
  switch (channel) {
    case 'snapshot': return isSnapshot(value);
    case 'evento': return isEvent(value);
    case 'task': return shape(value, { task: isTask });
    case 'posicao': return record(value) && (value.fonte === 'rastreador'
      ? shape(value, { rota_id: positiveId, lat: latitude, lng: longitude })
      : shape(value, {
        rota_id: positiveId, lat: latitude, lng: longitude, fonte: optional(oneOf('celular')),
        distancia_m: numeric, eta_min: numeric, status: routeStatus,
      }));
    case 'fala': return shape(value, { rota_id: positiveId, papel: oneOf('motorista', 'recebedor', 'operador'), texto: text });
    case 'contador': return shape(value, { estadias: array(isStay) });
    case 'reset': return shape(value, { rota_id: positiveId });
    case 'chamado': return shape(value, { chamado: isDriverRequest });
  }
  return false;
}

function normalizeBase(base: string) {
  const value = base.trim();
  if (/[\\?#\s]/.test(value) || value.startsWith('//')) throw new ApiError('invalid_configuration');
  const absolute = /^https?:\/\//i.test(value);
  if (!absolute && /^[a-z][a-z\d+.-]*:/i.test(value)) throw new ApiError('invalid_configuration');
  try {
    const parsed = new URL(absolute ? value : `/${value.replace(/^\/+/, '')}`, 'http://api.invalid');
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new ApiError('invalid_configuration');
    }
    return (absolute ? `${parsed.origin}${parsed.pathname}` : parsed.pathname).replace(/\/+$/, '');
  } catch {
    throw new ApiError('invalid_configuration');
  }
}

function encodedId(id: ApiId): string {
  const raw = typeof id === 'number' ? String(id) : id;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new ApiError('invalid_id');
  return encodeURIComponent(raw);
}

/** Transporte REST/SSE. POST nunca é repetido automaticamente. */
export class ApiClient {
  readonly baseURL: string;
  private readonly fetchRequest: typeof fetch;
  private readonly createEventSource: (url: string) => ApiEventSource;
  private readonly timeoutMs: number;
  private accessToken: string | null = null;

  /** JWT devolvido pelo /auth/sso. O backend exige papel `cco` nas ações da central quando AUTH_OBRIGATORIA=true. */
  setAccessToken(token: string | null): void {
    this.accessToken = typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  private headersFor(body: unknown): Record<string, string> | undefined {
    const headers: Record<string, string> = {};
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    return Object.keys(headers).length ? headers : undefined;
  }

  constructor(baseURL: string, options: ApiClientOptions = {}) {
    this.baseURL = normalizeBase(baseURL);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) {
      throw new ApiError('invalid_configuration');
    }
    this.fetchRequest = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof this.fetchRequest !== 'function') throw new ApiError('invalid_configuration');
    this.createEventSource = options.eventSource ?? ((url) => {
      if (typeof globalThis.EventSource !== 'function') throw new ApiError('stream_unavailable');
      return new EventSource(url);
    });
  }

  private async request<T>(method: 'GET' | 'POST', path: string, guard: Guard<T>, signal?: AbortSignal, body?: unknown,
    read?: (response: Response) => Promise<unknown>): Promise<T> {
    if (signal?.aborted) throw new ApiError('aborted');
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new ApiError(timedOut ? 'timeout' : 'aborted'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const operation = async () => {
      let response: Response;
      try {
        response = await this.fetchRequest(`${this.baseURL}${path}`, {
          method, signal: controller.signal, headers: this.headersFor(body),
          body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
      } catch {
        throw new ApiError(timedOut ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network_error');
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new ApiError('http_error', response.status);
      }
      let data: unknown;
      try { data = await (read ? read(response) : response.json()); }
      catch { throw new ApiError(timedOut ? 'timeout' : controller.signal.aborted ? 'aborted' : 'invalid_response'); }
      if (!guard(data)) throw new ApiError('invalid_response');
      return data;
    };
    try {
      return await Promise.race([operation(), aborted]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', rejectAbort);
    }
  }

  getSnapshot(signal?: AbortSignal) {
    return this.request('GET', '/cco/estado', isSnapshot, signal);
  }

  getRoute(id: ApiId, signal?: AbortSignal) {
    return this.request('GET', `/rotas/${encodedId(id)}`, isRoute, signal);
  }

  listTasks(signal?: AbortSignal) {
    return this.request('GET', '/tasks', (value): value is BackendTask[] => array(isTask)(value), signal);
  }

  listCalls(signal?: AbortSignal) {
    return this.request('GET', '/ligacoes', (value): value is BackendCall[] => array(isCall)(value), signal);
  }

  listEvents(options: { routeId?: ApiId; limit?: number } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (options.routeId !== undefined) query.set('rota_id', encodedId(options.routeId));
    if (options.limit !== undefined) {
      if (!Number.isSafeInteger(options.limit) || options.limit <= 0) throw new ApiError('invalid_id');
      query.set('limite', String(options.limit));
    }
    return this.request('GET', `/eventos${query.size ? `?${query}` : ''}`, (value): value is BackendEvent[] => array(isEvent)(value), signal);
  }

  listDriverRequests(options: { routeId?: ApiId; open?: boolean } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (options.routeId !== undefined) query.set('rota_id', encodedId(options.routeId));
    if (options.open !== undefined) query.set('abertos', String(options.open));
    return this.request(
      'GET',
      `/cco/chamados${query.size ? `?${query}` : ''}`,
      (value): value is BackendDriverRequest[] => array(isDriverRequest)(value),
      signal,
    );
  }

  respondDriverRequest(id: ApiId, resposta: string, respondidoPor = 'CCO', signal?: AbortSignal) {
    if (!text(resposta) || !resposta.trim() || resposta.length > 2000 || !text(respondidoPor) || !respondidoPor.trim()) {
      throw new ApiError('invalid_input');
    }
    return this.request(
      'POST',
      `/cco/chamados/${encodedId(id)}/responder`,
      isDriverRequest,
      signal,
      { resposta: resposta.trim(), respondido_por: respondidoPor.trim() },
    );
  }

  listDriverMessages(routeId: ApiId, signal?: AbortSignal) {
    return this.request('GET', `/rotas/${encodedId(routeId)}/mensagens`,
      (value): value is BackendDriverMessage[] => array(isDriverMessage)(value), signal);
  }

  sendDriverMessage(routeId: ApiId, remetente: string, texto: string, signal?: AbortSignal) {
    if (!text(remetente) || !remetente.trim() || remetente.length > 255 || !text(texto) || !texto.trim() || texto.length > 2000) {
      throw new ApiError('invalid_input');
    }
    return this.request('POST', `/rotas/${encodedId(routeId)}/mensagens`, isDriverMessage, signal, {
      remetente: remetente.trim(), texto: texto.trim(),
    });
  }

  listAgentCalls(options: { routeId?: ApiId; open?: boolean } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (options.routeId !== undefined) query.set('rota_id', encodedId(options.routeId));
    if (options.open !== undefined) query.set('abertas', String(options.open));
    return this.request('GET', `/cco/chamadas-agente${query.size ? `?${query}` : ''}`,
      (value): value is BackendAgentCall[] => array(isAgentCall)(value), signal);
  }

  getCurrentOperatorCall(signal?: AbortSignal) {
    return this.request('GET', '/operador/chamadas/atual', isOperatorCallEnvelope, signal);
  }

  answerOperatorCall(id: ApiId, signal?: AbortSignal) {
    return this.request('POST', `/operador/chamadas/${encodedId(id)}/atender`, isAgentCall, signal, {});
  }

  confirmTask(id: ApiId, por = 'CCO', signal?: AbortSignal) {
    return this.request('POST', `/tasks/${encodedId(id)}/confirmar`, isTask, signal, { confirmado_por: por });
  }

  confirmUnload(id: ApiId, por = 'CCO', signal?: AbortSignal) {
    return this.request('POST', `/rotas/${encodedId(id)}/descarga`,
      (value): value is BackendUnloadResult => isStay(value) || (record(value) && Object.keys(value).length === 0),
      signal, { por });
  }

  listDrivers(signal?: AbortSignal) {
    return this.request('GET', '/motoristas', (value): value is BackendDriver[] => array(isDriver)(value), signal);
  }

  listProfiles(role?: BackendUserProfile['role'], signal?: AbortSignal) {
    if (!optional(oneOf('cco', 'driver'))(role)) throw new ApiError('invalid_input');
    const query = role === undefined ? '' : `?role=${role}`;
    return this.request('GET', `/usuarios${query}`, (value): value is BackendUserProfile[] =>
      array(isUserProfile)(value) && (value as BackendUserProfile[]).every((profile) => role === undefined || profile.role === role), signal);
  }

  publishRoute(input: BackendNewRoute, signal?: AbortSignal) {
    if (!newRoute(input)) throw new ApiError('invalid_input');
    return this.request('POST', '/rotas', isRoute, signal, input);
  }

  assignRoute(routeId: ApiId, driverId: ApiId, signal?: AbortSignal) {
    const driver = Number(encodedId(driverId));
    return this.request('POST', `/rotas/${encodedId(routeId)}/atribuir`, isRoute, signal, { motorista_id: driver });
  }

  getMetrics(signal?: AbortSignal) {
    return this.request('GET', '/api/metrics', isMetrics, signal);
  }

  getReceivers(signal?: AbortSignal) {
    return this.request('GET', '/api/receivers', (value): value is BackendReceiver[] => array(isReceiver)(value), signal);
  }

  getDocuments(routeId: ApiId, signal?: AbortSignal) {
    const query = new URLSearchParams({ tripId: encodedId(routeId) });
    return this.request('GET', `/api/documents?${query}`, (value): value is BackendDocument[] => array(isDocument)(value), signal);
  }

  getRequests(routeId: ApiId, signal?: AbortSignal) {
    return this.request('GET', `/rotas/${encodedId(routeId)}/solicitacoes`,
      (value): value is BackendRequest[] => array(isRequest)(value), signal);
  }

  createRequest(routeId: ApiId, pergunta: string, signal?: AbortSignal) {
    if (!text(pergunta)) throw new ApiError('invalid_input');
    return this.request('POST', `/rotas/${encodedId(routeId)}/solicitacoes`, isRequest, signal, { pergunta });
  }

  authSso(email?: string, signal?: AbortSignal) {
    if (!optional(text)(email)) throw new ApiError('invalid_input');
    return this.request('POST', '/auth/sso', isSsoResult, signal, email === undefined ? {} : { email });
  }

  listRouteFiles(routeId: ApiId, signal?: AbortSignal) {
    return this.request('GET', `/rotas/${encodedId(routeId)}/arquivos`,
      (value): value is BackendFile[] => array(isFile)(value), signal);
  }

  uploadRouteFile(routeId: ApiId, file: File, options: { categoria?: string; descricao?: string } = {}, signal?: AbortSignal) {
    const id = encodedId(routeId);
    if (!(file instanceof Blob) || !text(file.name) || !shape(options, {
      categoria: optional(fileCategory), descricao: optional((description) => text(description) && (description as string).length <= 1000),
    })) throw new ApiError('invalid_input');
    const body = new FormData();
    body.append('arquivo', file, file.name);
    if (options.categoria !== undefined) body.append('categoria', options.categoria);
    if (options.descricao !== undefined) body.append('descricao', options.descricao);
    return this.request('POST', `/rotas/${id}/arquivos`, isFile, signal, body);
  }

  downloadRouteFile(routeId: ApiId, fileId: ApiId, signal?: AbortSignal): Promise<Blob> {
    return this.request('GET', `/rotas/${encodedId(routeId)}/arquivos/${encodedId(fileId)}/download`,
      (value): value is Blob => value instanceof Blob, signal, undefined, async (response) => {
        const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
        if (!fileMime(mime)) throw new ApiError('invalid_response');
        return response.blob();
      });
  }

  /** EventSource gerencia a reconexão; fechar remove callbacks e impede mensagens tardias. */
  subscribe(callbacks: ApiStreamCallbacks): () => void {
    let source: ApiEventSource;
    callbacks.onStatus?.('connecting');
    try {
      source = this.createEventSource(`${this.baseURL}/cco/stream`);
    } catch {
      callbacks.onStatus?.('error');
      callbacks.onError?.(new ApiError('stream_unavailable'));
      return () => {};
    }
    let closed = false;
    const listeners = new Map<BackendStreamChannel, EventListener>();
    source.onopen = () => { if (!closed) callbacks.onStatus?.('connected'); };
    source.onerror = () => {
      if (closed) return;
      const terminal = source.readyState === 2;
      callbacks.onStatus?.(terminal ? 'error' : 'reconnecting');
      if (terminal) callbacks.onError?.(new ApiError('stream_error'));
    };
    for (const channel of BACKEND_STREAM_CHANNELS) {
      const listener: EventListener = (event) => {
        if (closed) return;
        let value: unknown;
        try {
          const raw = (event as MessageEvent<unknown>).data;
          if (typeof raw !== 'string') throw new ApiError('invalid_response');
          value = JSON.parse(raw);
          if (!isStreamData(channel, value)) throw new ApiError('invalid_response');
        } catch {
          callbacks.onError?.(new ApiError('invalid_response'));
          return;
        }
        // O guard verifica o canal; a assinatura preserva seu payload específico.
        const dispatch = <K extends BackendStreamChannel>(key: K, data: BackendStreamMessages[K]) => {
          const handler = callbacks[key] as ((payload: BackendStreamMessages[K]) => void) | undefined;
          handler?.(data);
        };
        if (isStreamData(channel, value)) dispatch(channel, value);
      };
      listeners.set(channel, listener);
      source.addEventListener(channel, listener);
    }
    return () => {
      if (closed) return;
      closed = true;
      source.onopen = null;
      source.onerror = null;
      listeners.forEach((listener, channel) => source.removeEventListener(channel, listener));
      source.close();
      callbacks.onStatus?.('closed');
    };
  }
}
