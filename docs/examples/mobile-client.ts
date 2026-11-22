/**
 * Modelo de leitura do app do MOTORISTA, baseado nos contratos existentes.
 * Não importa src/ e não executa automaticamente. Lê anexos reais; não faz upload.
 * SSE exige uma implementação de EventSource fornecida pelo ambiente mobile.
 */
export type StatusRota = 'publicada' | 'planejada' | 'na_origem' | 'em_transito'
  | 'aproximando' | 'no_destino' | 'descarregada';

export interface UserProfile {
  id: string; // PK de Usuario serializada; não é o e-mail nem driverId
  email: string; role: 'driver' | 'cco'; name: string;
  driverId: number | null; tripId: string | null;
}
export interface MockSession {
  token: string; // fake: não autoriza os endpoints atuais
  user: UserProfile;
}
export interface Driver {
  id: number; empresa_id: number; nome: string;
  email: string | null; telefone_e164: string | null;
}
export interface MobileRoute {
  tripId: string; driverId: number | null; assignedAt: string | null; status: StatusRota;
  company: string; driver: { name: string }; plate: string; invoice: string;
  cargo: string; weightT: number; unloadWindow: string;
  origin: { name: string; lat: number; lng: number };
  destination: { name: string; lat: number; lng: number };
  polyline: [number, number][]; // [latitude, longitude]
  receiver: { company: string; name: string; phone: string };
  position: { lat: number | null; lng: number | null; distanceM: number | null; etaMin: number | null };
  channel: string; driverUid: number; agentUid: number;
}
interface MockDocumentBase {
  id: string; title: string; number: string; fileUri: null; mock: true;
  campos: Record<string, string | number>;
}
export type DocumentMetadata =
  | MockDocumentBase & { kind: 'NF-e'; issuer: string; recipient: string; weightKg: number; items: string; valueBRL: number }
  | MockDocumentBase & { kind: 'CT-e'; carrier: string; plate: string; freightBRL: number };
export interface RouteFile {
  id: number; rota_id: number; nome_original: string; tipo_mime: string; tamanho_bytes: number;
  categoria: 'documento' | 'nota_fiscal' | 'comprovante' | 'imagem' | 'outro';
  descricao: string | null; criado_em: string; url_download: string;
}
export interface Journey {
  route: MobileRoute | null;
  documents: DocumentMetadata[]; // metadados NF-e/CT-e MOCK
  files: RouteFile[]; // anexos binários enviados pelo CCO
}
export interface BackendEvent {
  id: number; tipo: string; rota_id: number | null; timestamp: string;
  mensagem: string; dados: Record<string, unknown>;
}
export type PositionFrame =
  | { rota_id: number; fonte?: 'celular'; lat: number; lng: number; distancia_m: number; eta_min: number; status: StatusRota }
  | { rota_id: number; fonte: 'rastreador'; lat: number; lng: number };

export type StreamChannel = 'snapshot' | 'evento' | 'task' | 'posicao' | 'fala' | 'contador' | 'reset';
const channels: StreamChannel[] = ['snapshot', 'evento', 'task', 'posicao', 'fala', 'contador', 'reset'];
type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const numericId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const profileId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const isProfile = (value: unknown): value is UserProfile =>
  isRecord(value) && profileId(value.id) && typeof value.email === 'string' && value.email.length > 0
  && typeof value.name === 'string' && (value.role === 'driver' || value.role === 'cco')
  && (value.tripId === null || profileId(value.tripId))
  && (value.role === 'driver' ? numericId(value.driverId) : value.driverId === null && value.tripId === null);

/** Transportes injetáveis: adaptar as APIs WebSocket/EventSource do app. */
export interface SocketTransport {
  onopen: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close(): void;
}
export interface SseTransport {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(channel: string, listener: (event: { data: string }) => void): void;
  removeEventListener(channel: string, listener: (event: { data: string }) => void): void;
  close(): void;
}
export type SocketFactory = (url: string) => SocketTransport;
export type SseFactory = (url: string) => SseTransport;

/** Adaptadores opcionais para ambientes com os transportes globais. */
export const browserSocket: SocketFactory = (url) => {
  const source = new WebSocket(url);
  const transport: SocketTransport = { onopen: null, onmessage: null, onerror: null, onclose: null, close: () => source.close() };
  source.onopen = () => transport.onopen?.();
  source.onmessage = (message) => transport.onmessage?.({ data: message.data });
  source.onerror = () => transport.onerror?.();
  source.onclose = () => transport.onclose?.();
  return transport;
};
export const browserSse: SseFactory = (url) => {
  const source = new EventSource(url);
  const listeners = new Map<(event: { data: string }) => void, EventListener>();
  const transport: SseTransport = {
    onopen: null, onerror: null,
    addEventListener: (channel, listener) => {
      const wrapper: EventListener = (event) => listener({ data: String((event as MessageEvent<unknown>).data) });
      listeners.set(listener, wrapper);
      source.addEventListener(channel, wrapper);
    },
    removeEventListener: (channel, listener) => {
      const wrapper = listeners.get(listener);
      if (wrapper) source.removeEventListener(channel, wrapper);
      listeners.delete(listener);
    },
    close: () => source.close(),
  };
  source.onopen = () => transport.onopen?.();
  source.onerror = () => transport.onerror?.();
  return transport;
};

export class MobileHttpError extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}
function id(value: number): string {
  if (!numericId(value)) throw new Error('ID inválido');
  return String(value);
}
function tripId(value: string): string {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('tripId inválido');
  return value;
}
function checkAbort(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Operação cancelada');
  error.name = 'AbortError';
  throw error;
}
function parseEvent(value: unknown): BackendEvent | null {
  if (!isRecord(value) || !numericId(value.id) || typeof value.tipo !== 'string'
    || !(value.rota_id === null || numericId(value.rota_id)) || typeof value.timestamp !== 'string'
    || typeof value.mensagem !== 'string' || !isRecord(value.dados)) return null;
  return value as unknown as BackendEvent;
}
/** Mesmo com filtro do servidor, não incorporar dados de outra viagem. */
function routeMessage(channel: StreamChannel, value: unknown, route: number): unknown | undefined {
  if (!isRecord(value)) return undefined;
  if (channel === 'snapshot') {
    const filtered: JsonRecord = { ...value };
    for (const field of ['rotas', 'tasks', 'estadias', 'ligacoes', 'ocorrencias', 'eventos']) {
      if (!Array.isArray(value[field])) return undefined;
      filtered[field] = value[field].filter((item: unknown) =>
        isRecord(item) && item[field === 'rotas' ? 'id' : 'rota_id'] === route);
    }
    return filtered;
  }
  if (channel === 'contador') {
    if (!Array.isArray(value.estadias)) return undefined;
    return { estadias: value.estadias.filter((stay: unknown) => isRecord(stay) && stay.rota_id === route) };
  }
  if (channel === 'task') return isRecord(value.task) && value.task.rota_id === route ? value : undefined;
  return value.rota_id === route ? value : undefined;
}

export class MobileApi {
  private readonly base: string;
  private readonly request: typeof fetch;
  constructor(baseURL: string, private readonly options: {
    request?: typeof fetch;
    token?: () => string | undefined;
  } = {}) {
    const parsed = new URL(baseURL);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('URL de API inválida');
    }
    this.base = parsed.toString().replace(/\/$/, '');
    this.request = options.request ?? fetch;
  }

  private headers(body: unknown): Record<string, string> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.options.token?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async json<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    checkAbort(signal);
    const response = await this.request(`${this.base}${path}`, {
      method, headers: this.headers(body),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    checkAbort(signal);
    if (!response.ok) throw new MobileHttpError(response.status);
    const value = await response.json() as T;
    checkAbort(signal);
    return value;
  }

  /** Perfis públicos da demonstração; o filtro não é controle de acesso. */
  async listProfiles(role?: UserProfile['role'], signal?: AbortSignal): Promise<UserProfile[]> {
    const profiles = await this.json<unknown>('GET', `/usuarios${role ? `?role=${role}` : ''}`, undefined, signal);
    if (!Array.isArray(profiles) || !profiles.every(isProfile)) throw new Error('Lista de perfis inválida');
    return role ? profiles.filter((profile) => profile.role === role) : profiles;
  }

  /** Somente demo. Validar o perfil escolhido, sem inferir a identidade pelo nome/e-mail. */
  async loginMock(profile: UserProfile, signal?: AbortSignal): Promise<MockSession> {
    if (!isProfile(profile) || profile.role !== 'driver' || !numericId(profile.driverId)) {
      throw new Error('Perfil não é motorista');
    }
    const email = profile.email.trim().toLowerCase();
    const value = await this.json<unknown>('POST', '/auth/sso', { email }, signal);
    if (!isRecord(value) || typeof value.token !== 'string' || !isProfile(value.user)) {
      throw new Error('Sessão MOCK inválida');
    }
    const session = value as unknown as MockSession;
    if (session.user.id !== profile.id || session.user.email.toLowerCase() !== email
      || session.user.role !== 'driver' || session.user.driverId !== profile.driverId) {
      throw new Error('Identidade MOCK não corresponde ao perfil escolhido');
    }
    return session; // não configurar token fake como credencial real
  }

  async currentRoute(driverId: number, signal?: AbortSignal): Promise<MobileRoute | null> {
    try {
      const route = await this.json<MobileRoute>('GET', `/api/route?driverId=${id(driverId)}`, undefined, signal);
      if (route.driverId !== driverId) throw new Error('Rota pertence a outro motorista');
      tripId(route.tripId);
      return route;
    } catch (error) {
      if (error instanceof MobileHttpError && error.status === 404) return null;
      throw error;
    }
  }

  documents(routeId: string, signal?: AbortSignal): Promise<DocumentMetadata[]> {
    return this.json('GET', `/api/documents?tripId=${tripId(routeId)}`, undefined, signal);
  }

  async listFiles(routeId: string, signal?: AbortSignal): Promise<RouteFile[]> {
    const route = tripId(routeId);
    const files = await this.json<RouteFile[]>('GET', `/rotas/${route}/arquivos`, undefined, signal);
    if (!Array.isArray(files) || files.some((file) => !numericId(file.id) || file.rota_id !== Number(route))) {
      throw new Error('Anexo pertence a outra rota ou possui ID inválido');
    }
    return files;
  }

  /** Retorna Blob; o app decide salvar/abrir usando o adaptador nativo/browser. */
  async downloadFile(routeId: string, fileId: number, signal?: AbortSignal): Promise<Blob> {
    checkAbort(signal);
    const response = await this.request(`${this.base}/rotas/${tripId(routeId)}/arquivos/${id(fileId)}/download`, {
      method: 'GET', headers: this.headers(undefined), signal,
    });
    checkAbort(signal);
    if (!response.ok) throw new MobileHttpError(response.status);
    const blob = await response.blob();
    checkAbort(signal);
    return blob;
  }

  async currentJourney(driverId: number, signal?: AbortSignal): Promise<Journey> {
    const route = await this.currentRoute(driverId, signal);
    if (!route) return { route: null, documents: [], files: [] };
    const [documents, files] = await Promise.all([
      this.documents(route.tripId, signal), this.listFiles(route.tripId, signal),
    ]);
    return { route, documents, files };
  }

  /** Atribuições novas são WS por motorista; SSE não aceita esse filtro. */
  watchAssignments(driverId: number, createSocket: SocketFactory, callbacks: {
    refresh: () => void;
    status: (value: 'connecting' | 'connected' | 'stale') => void;
    error: (error: unknown) => void;
  }): () => void {
    const driver = id(driverId);
    let active = true;
    let socket: SocketTransport | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!active) return;
      callbacks.status('connecting');
      try {
        socket = createSocket(`${this.base.replace(/^http/, 'ws')}/ws?motorista_id=${driver}`);
      } catch (error) {
        callbacks.status('stale'); callbacks.error(error);
        reconnect = setTimeout(connect, 2_000);
        return;
      }
      const current = socket;
      const isCurrent = () => active && socket === current;
      current.onopen = () => { if (isCurrent()) { callbacks.status('connected'); callbacks.refresh(); } };
      current.onmessage = ({ data }) => {
        if (!isCurrent()) return;
        try {
          const frame: unknown = JSON.parse(String(data));
          // Seleção vem de currentRoute; não escolher um item pelo índice do snapshot.
          if (!isRecord(frame)) return;
          if (frame.canal === 'reset') { callbacks.refresh(); return; }
          if (frame.canal !== 'evento') return;
          const event = parseEvent(frame.dado);
          // Inclui reatribuição de uma rota antiga: reconsultar, não manter a seleção anterior.
          if (event?.tipo === 'rota_atribuida') callbacks.refresh();
          if (event?.tipo === 'descarga' || event?.tipo === 'arquivo_adicionado') callbacks.refresh();
        } catch (error) { callbacks.error(error); }
      };
      current.onerror = () => { if (isCurrent()) callbacks.status('stale'); };
      current.onclose = () => {
        if (!isCurrent()) return;
        callbacks.status('stale');
        reconnect = setTimeout(connect, 2_000);
      };
    };
    connect();
    return () => {
      active = false; clearTimeout(reconnect);
      if (socket) {
        socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
        socket.close();
      }
    };
  }

  /**
   * Opcional: o ambiente deve fornecer SSE. Native pode usar /ws?rota_id= sem
   * instalar EventSource. Payloads detalhados estão em clients/tipos.ts.
   */
  watchRouteSse(routeId: string, createSse: SseFactory, callbacks: {
    message: (channel: StreamChannel, value: unknown) => void;
    refresh: () => void;
    ready?: () => void;
    stale: () => void;
    error: (error: unknown) => void;
  }): () => void {
    const source = createSse(`${this.base}/cco/stream?rota_id=${tripId(routeId)}`);
    let active = true;
    const listeners = new Map<StreamChannel, (event: { data: string }) => void>();
    source.onopen = () => { if (active) { callbacks.ready?.(); callbacks.refresh(); } };
    source.onerror = () => { if (active) callbacks.stale(); };
    for (const channel of channels) {
      const listener = (event: { data: string }) => {
        if (!active) return;
        try {
          if (channel === 'reset') { callbacks.refresh(); return; }
          const filtered = routeMessage(channel, JSON.parse(event.data) as unknown, Number(routeId));
          if (filtered !== undefined) callbacks.message(channel, filtered);
        }
        catch (error) { callbacks.error(error); }
      };
      listeners.set(channel, listener);
      source.addEventListener(channel, listener);
    }
    return () => {
      active = false; source.onopen = null; source.onerror = null;
      listeners.forEach((listener, channel) => source.removeEventListener(channel, listener));
      source.close();
    };
  }
}

/**
 * Seleção autoritativa: reconsulta atribuição/documentos; ignora leituras antigas.
 * O chamador abre/fecha watchRouteSse quando journey.route.tripId mudar.
 */
export function observeCurrentJourney(api: MobileApi, session: MockSession, socket: SocketFactory, callbacks: {
  journey: (journey: Journey) => void;
  status: (value: 'connecting' | 'connected' | 'stale') => void;
  error: (error: unknown) => void;
}) {
  const driver = session.user.driverId;
  if (session.user.role !== 'driver' || !numericId(driver)) throw new Error('Motorista inválido');
  let active = true;
  let generation = 0;
  const pending = new AbortController();
  const refresh = async () => {
    if (!active) return;
    const expected = ++generation;
    try {
      const journey = await api.currentJourney(driver, pending.signal);
      if (active && expected === generation) callbacks.journey(journey);
    } catch (error) {
      if (active && expected === generation) { callbacks.status('stale'); callbacks.error(error); }
    }
  };
  const stop = api.watchAssignments(driver, socket, { ...callbacks, refresh: () => { void refresh(); } });
  // Cobre perdas do stream e reatribuição sem evento de revogação para o motorista antigo.
  const reconcile = setInterval(() => { void refresh(); }, 15_000);
  void refresh();
  return {
    refresh,
    close: () => { active = false; generation++; pending.abort(); clearInterval(reconcile); stop(); },
  };
}

export interface MobileState {
  profiles: readonly UserProfile[];
  selectedProfile: UserProfile | null;
  session: MockSession | null;
  identity: 'signed-out' | 'signing-in' | 'signed-in' | 'error';
  connection: 'idle' | 'connecting' | 'connected' | 'stale';
  profilesLoading: boolean;
  journeyLoading: boolean;
  journey: Journey;
}
const emptyJourney = (): Journey => ({ route: null, documents: [], files: [] });

/**
 * Uma instância por tela/app. Troca de conta fecha WS/SSE, cancela HTTP/downloads
 * e invalida callbacks mesmo quando um transporte ignora AbortSignal.
 * Não representa autorização no servidor nem abre arquivos automaticamente.
 */
export class MobileController {
  private state: MobileState = {
    profiles: [], selectedProfile: null, session: null, identity: 'signed-out',
    connection: 'idle', profilesLoading: false, journeyLoading: false, journey: emptyJourney(),
  };
  private closed = false;
  private socketConnection: MobileState['connection'] = 'idle';
  private readStale = false;
  private routeStale = false;
  private generation = 0;
  private profilesGeneration = 0;
  private readGeneration = 0;
  private profilesRequest?: AbortController;
  private loginRequest?: AbortController;
  private journeyRequest?: AbortController;
  private downloads = new Set<AbortController>();
  private stopAssignments?: () => void;
  private stopRoute?: () => void;
  private observedRoute: string | null = null;
  private reconcile?: ReturnType<typeof setInterval>;

  constructor(
    private readonly api: MobileApi,
    private readonly transports: { socket: SocketFactory; sse?: SseFactory },
    private readonly callbacks: {
      state: (state: Readonly<MobileState>) => void;
      message?: (channel: StreamChannel, value: unknown) => void;
      error?: (error: unknown) => void;
    },
  ) {}

  get snapshot(): Readonly<MobileState> { return this.state; }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Controlador encerrado');
  }

  private update(patch: Partial<MobileState>): void {
    this.state = { ...this.state, ...patch };
    this.callbacks.state(this.state);
  }

  private current(expected: number): boolean { return !this.closed && expected === this.generation; }

  private connectionState(): MobileState['connection'] {
    return this.readStale || this.routeStale ? 'stale' : this.socketConnection;
  }

  private cancelDownloads(): void {
    for (const request of this.downloads) request.abort();
    this.downloads.clear();
  }

  private releaseSession(): void {
    this.generation++;
    this.readGeneration++;
    this.loginRequest?.abort();
    this.journeyRequest?.abort();
    this.cancelDownloads();
    this.stopAssignments?.();
    this.stopRoute?.();
    clearInterval(this.reconcile);
    this.loginRequest = undefined;
    this.journeyRequest = undefined;
    this.stopAssignments = undefined;
    this.stopRoute = undefined;
    this.reconcile = undefined;
    this.observedRoute = null;
    this.socketConnection = 'idle';
    this.readStale = false;
    this.routeStale = false;
  }

  async loadProfiles(): Promise<void> {
    this.ensureOpen();
    const expected = ++this.profilesGeneration;
    this.profilesRequest?.abort();
    const request = new AbortController();
    this.profilesRequest = request;
    this.update({ profilesLoading: true });
    try {
      const profiles = await this.api.listProfiles('driver', request.signal);
      if (this.closed || expected !== this.profilesGeneration) return;
      const selected = this.state.selectedProfile;
      const match = profiles.find((profile) => profile.id === selected?.id);
      // Cadastro removido/revinculado não mantém a sessão anterior no aparelho.
      if (selected && (!match || match.email !== selected.email || match.driverId !== selected.driverId)) this.logout();
      this.update({ profiles, profilesLoading: false });
    } catch (error) {
      if (this.closed || expected !== this.profilesGeneration) return;
      this.update({ profilesLoading: false });
      this.callbacks.error?.(error);
    }
  }

  async selectProfile(userId: string): Promise<void> {
    this.ensureOpen();
    const profile = this.state.profiles.find((candidate) => candidate.id === userId);
    if (!profile || profile.role !== 'driver' || !numericId(profile.driverId)) throw new Error('Perfil de motorista indisponível');
    this.releaseSession();
    const expected = this.generation;
    const request = new AbortController();
    this.loginRequest = request;
    // Limpa antes de aguardar login: nada da conta anterior continua na tela.
    this.update({
      selectedProfile: profile, session: null, identity: 'signing-in',
      connection: 'idle', journeyLoading: false, journey: emptyJourney(),
    });
    try {
      const session = await this.api.loginMock(profile, request.signal);
      if (!this.current(expected)) return;
      this.loginRequest = undefined;
      this.update({ session, identity: 'signed-in' });
      this.stopAssignments = this.api.watchAssignments(profile.driverId, this.transports.socket, {
        refresh: () => { if (this.current(expected)) void this.refresh(); },
        status: (connection) => {
          if (!this.current(expected)) return;
          this.socketConnection = connection;
          this.update({ connection: this.connectionState() });
        },
        error: (error) => { if (this.current(expected)) this.callbacks.error?.(error); },
      });
      this.reconcile = setInterval(() => { if (this.current(expected)) void this.refresh(); }, 15_000);
      await this.refresh();
    } catch (error) {
      if (!this.current(expected)) return;
      this.update({ session: null, identity: 'error', connection: 'idle', journey: emptyJourney() });
      this.callbacks.error?.(error);
    }
  }

  private observeRoute(routeId: string | null, expected: number): void {
    if (routeId === this.observedRoute) return;
    this.stopRoute?.();
    this.stopRoute = undefined;
    this.cancelDownloads();
    this.observedRoute = routeId;
    this.routeStale = false;
    if (!routeId || !this.transports.sse) return;
    const isCurrent = () => this.current(expected) && this.observedRoute === routeId;
    try {
      this.stopRoute = this.api.watchRouteSse(routeId, this.transports.sse, {
        refresh: () => { if (isCurrent()) void this.refresh(); },
        ready: () => {
          if (!isCurrent()) return;
          this.routeStale = false;
          this.update({ connection: this.connectionState() });
        },
        stale: () => {
          if (!isCurrent()) return;
          this.routeStale = true;
          this.update({ connection: this.connectionState() });
        },
        error: (error) => { if (isCurrent()) this.callbacks.error?.(error); },
        message: (channel, value) => {
          if (!isCurrent()) return;
          this.callbacks.message?.(channel, value);
          const event = channel === 'evento' ? parseEvent(value) : null;
          if (event && ['rota_atribuida', 'descarga', 'arquivo_adicionado'].includes(event.tipo)) void this.refresh();
        },
      });
    } catch (error) {
      this.observedRoute = null; // permitir nova tentativa no próximo refetch
      this.routeStale = true;
      this.update({ connection: this.connectionState() });
      this.callbacks.error?.(error);
    }
  }

  async refresh(): Promise<void> {
    this.ensureOpen();
    const driver = this.state.session?.user.driverId;
    if (this.state.identity !== 'signed-in' || !numericId(driver)) return;
    const expected = this.generation;
    const read = ++this.readGeneration;
    this.journeyRequest?.abort();
    const request = new AbortController();
    this.journeyRequest = request;
    this.update({ journeyLoading: true });
    try {
      const journey = await this.api.currentJourney(driver, request.signal);
      if (!this.current(expected) || read !== this.readGeneration) return;
      this.readStale = false;
      this.observeRoute(journey.route?.tripId ?? null, expected);
      this.update({ journey, journeyLoading: false, connection: this.connectionState() });
    } catch (error) {
      if (!this.current(expected) || read !== this.readGeneration) return;
      this.readStale = true;
      this.update({ journeyLoading: false, connection: this.connectionState() });
      this.callbacks.error?.(error);
    }
  }

  /** null = cancelado/trocou conta ou viagem; não abrir um Blob da sessão anterior. */
  async downloadFile(fileId: number): Promise<Blob | null> {
    this.ensureOpen();
    const routeId = this.state.journey.route?.tripId;
    if (this.state.identity !== 'signed-in' || !routeId
      || !this.state.journey.files.some((file) => file.id === fileId && file.rota_id === Number(routeId))) {
      throw new Error('Anexo não pertence à viagem selecionada');
    }
    const expected = this.generation;
    const request = new AbortController();
    this.downloads.add(request);
    try {
      const blob = await this.api.downloadFile(routeId, fileId, request.signal);
      return !request.signal.aborted && this.current(expected)
        && this.state.journey.route?.tripId === routeId ? blob : null;
    } catch (error) {
      if (request.signal.aborted || !this.current(expected) || this.state.journey.route?.tripId !== routeId) return null;
      throw error;
    } finally {
      this.downloads.delete(request);
    }
  }

  logout(): void {
    this.ensureOpen();
    this.releaseSession();
    this.update({
      selectedProfile: null, session: null, identity: 'signed-out',
      connection: 'idle', journeyLoading: false, journey: emptyJourney(),
    });
  }

  close(): void {
    if (this.closed) return;
    this.logout();
    this.closed = true;
    this.profilesGeneration++;
    this.profilesRequest?.abort();
  }
}
