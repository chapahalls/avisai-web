/** DTOs do backend RODAR. Valores monetários e estados continuam sob autoridade do servidor. */
export type BackendRouteStatus = 'publicada' | 'planejada' | 'na_origem' | 'em_transito' | 'aproximando' | 'no_destino' | 'descarregada';
export type BackendTaskStatus = 'pendente' | 'confirmada' | 'escalada_recebedor' | 'concluida';
export type BackendCallStatus = 'chamando' | 'em_andamento' | 'respondida' | 'nao_atendida' | 'falhou';
export type BackendTaskChannel = 'push' | 'painel' | 'ligacao';
export type BackendDriverRequestStatus = 'coletando' | 'aguardando_cco' | 'respondido' | 'timeout';
export type BackendDriverMessageStatus = 'enviada' | 'falada' | 'respondida' | 'offline';
export type BackendAgentCallStatus = 'iniciada' | 'twilio_atendida' | 'agora_tocando' | 'atendida' | 'sem_resposta' | 'escalada' | 'falhou';

export interface BackendRoute {
  id: number;
  empresa_id: number;
  motorista_id: number | null;
  /** Opcionais somente para compatibilidade com versões anteriores do backend. */
  publicada_em?: string | null;
  atribuida_em?: string | null;
  origem_nome: string;
  origem_lat: number;
  origem_lng: number;
  destino_nome: string;
  destino_lat: number;
  destino_lng: number;
  /** Presente no detalhe GET /rotas/{id}; ausente no snapshot e na listagem. */
  trajeto?: [number, number][];
  status: BackendRouteStatus;
  placa: string;
  nota_fiscal: string;
  carga_descricao: string;
  /** Tonelagem arbitrária do backend, inclusive 28 t; não restringir a 14/30. */
  carga_t: number;
  janela_descarga: string;
  recebedor_empresa: string;
  recebedor_nome: string;
  recebedor_telefone_e164: string;
  aproximacao_min: number;
  raio_chegada_m: number;
  raio_origem_m?: number;
  rastreador_lat?: number | null;
  rastreador_lng?: number | null;
  rastreador_em?: string | null;
  ultima_lat: number | null;
  ultima_lng: number | null;
  ultima_posicao_em: string | null;
  eta_min: number | null;
  distancia_m: number | null;
  motorista_nome: string | null;
  canal_motorista: string;
}

export interface BackendTask {
  id: number;
  rota_id: number;
  tipo: string;
  status: BackendTaskStatus;
  prioridade: 'normal' | 'alta' | 'critica';
  tentativas: number;
  canal_atual: BackendTaskChannel | null;
  criada_em: string;
  ultima_notificacao: string | null;
  confirmado_em: string | null;
  confirmado_por: string | null;
  resposta_recebedor: string | null;
  concluida_em: string | null;
}

export interface BackendStay {
  estadia_id: number;
  rota_id: number;
  inicio: string;
  fim: string | null;
  encerrada: boolean;
  horas_paradas: number;
  tempo_parado: string;
  franquia_h: number;
  franquia_restante_h: number;
  franquia_restante: string;
  horas_excedentes: number;
  capacidade_t: number;
  valor_t_h: number;
  valor: number;
  valor_fmt: string;
  aceleracao: number;
}

export interface BackendTranscriptLine {
  quem: 'recebedor' | 'agente';
  texto: string;
  /** Epoch em segundos, não milissegundos. */
  ts: number;
}

export interface BackendCall {
  id: number;
  rota_id: number;
  task_id: number | null;
  motivo: 'aproximacao' | 'cco_sem_resposta';
  modo: 'rtc' | 'sip';
  numero: string;
  canal: string | null;
  sessao_id: number | null;
  agent_id: string | null;
  status: BackendCallStatus;
  iniciada_em: string;
  encerrada_em: string | null;
  atendida: boolean;
  previsao: string | null;
  doca: string | null;
  motivo_espera: string | null;
  resposta_resumo: string | null;
  transcricao: BackendTranscriptLine[];
  erro: string | null;
  enviada_cco_em: string | null;
  enviada_motorista_em: string | null;
}

/** Tipos desconhecidos de evento continuam disponíveis para uma apresentação genérica. */
export interface BackendEvent {
  id: number;
  tipo: string;
  rota_id: number | null;
  timestamp: string;
  mensagem: string;
  dados: Record<string, unknown>;
}

export interface BackendOccurrence {
  id: number;
  rota_id: number;
  tipo: string;
  descricao: string;
  lat: number | null;
  lng: number | null;
  timestamp: string;
  transcricao: string | null;
}

export interface BackendDriverRequest {
  id: number;
  rota_id: number;
  tipo: 'ocorrencia' | 'chegada' | string;
  assunto: string;
  descricao: string;
  km: number | null;
  rodovia: string | null;
  ocorrencia_id: number | null;
  status: BackendDriverRequestStatus;
  tentativas: number;
  max_tentativas: number;
  intervalo_s: number;
  criada_em: string;
  ultima_notificacao: string | null;
  respondida_em: string | null;
  resposta: string | null;
  respondido_por: string | null;
  transcricao: string | null;
}

export interface BackendDriverMessage {
  id: number;
  rota_id: number;
  remetente: string;
  texto: string;
  status: BackendDriverMessageStatus;
  criada_em: string;
  falada_em: string | null;
  respondida_em: string | null;
  resposta: string | null;
  transcricao_resposta: string | null;
}

export interface BackendAgentCall {
  id: number;
  rota_id: number;
  destino: 'operador' | 'supervisor' | 'motorista';
  motivo: string;
  status: BackendAgentCallStatus;
  twilio_sid: string | null;
  twilio_resultado: string | null;
  agora_canal: string | null;
  sessao_id: number | null;
  iniciada_em: string;
  atendida_em: string | null;
  encerrada_em: string | null;
  erro: string | null;
}

export interface BackendOperatorCall extends BackendAgentCall {
  app_id?: string;
  channel?: string;
  uid?: number;
  token?: string;
}

export interface BackendOperatorCallEnvelope {
  chamada: BackendOperatorCall | null;
}

export interface BackendSnapshot {
  rotas: BackendRoute[];
  tasks: BackendTask[];
  estadias: BackendStay[];
  ligacoes: BackendCall[];
  ocorrencias: BackendOccurrence[];
  eventos: BackendEvent[];
  chamados?: BackendDriverRequest[];
}

export interface BackendStreamMessages {
  snapshot: BackendSnapshot;
  evento: BackendEvent;
  task: { task: BackendTask };
  posicao: BackendMobilePosition | BackendTrackerPosition;
  fala: { rota_id: number; papel: 'motorista' | 'recebedor' | 'operador'; texto: string };
  /** Somente estadias abertas; ausência neste pacote não comprova encerramento. */
  contador: { estadias: BackendStay[] };
  reset: { rota_id: number };
  chamado: { chamado: BackendDriverRequest };
}

export type BackendStreamChannel = keyof BackendStreamMessages;
export const BACKEND_STREAM_CHANNELS: readonly BackendStreamChannel[] = [
  'snapshot', 'evento', 'task', 'posicao', 'fala', 'contador', 'reset', 'chamado',
];

/** Descarga sem uma estadia existente pode responder com {}. */
export type BackendUnloadResult = BackendStay | Record<string, never>;

export interface BackendMobilePosition {
  rota_id: number;
  lat: number;
  lng: number;
  /** Ausente em versões anteriores do backend. */
  fonte?: 'celular';
  distancia_m: number;
  eta_min: number;
  status: BackendRouteStatus;
}

export interface BackendTrackerPosition {
  rota_id: number;
  lat: number;
  lng: number;
  fonte: 'rastreador';
}

export interface BackendDriver {
  id: number;
  empresa_id: number;
  nome: string;
  telefone_e164: string | null;
  email: string | null;
}

export interface BackendNewRoute {
  origem: { nome: string; lat: number; lng: number };
  destino: { nome: string; lat: number; lng: number };
  recebedor: { empresa: string; nome: string; telefone_e164: string };
  carga_t: number;
  carga_descricao?: string;
  placa?: string;
  nota_fiscal?: string;
  janela_descarga?: string;
  empresa_id?: number;
  /** O CCO seleciona um perfil de motorista já persistido antes de publicar. */
  motorista_id: number;
}

/** Percentuais e médias sem observações são null; o frontend não completa amostras. */
export interface BackendMetrics {
  entregas: number;
  horas_paradas_media: number | null;
  estadia_devida_total: number;
  tempo_ate_acao_cco_min_media: number | null;
  /** Quantidade histórica de eventos de escalada, conforme a fórmula do servidor. */
  tasks_escaladas: number;
  pct_recebedores_avisados: number | null;
  pct_ligacoes_atendidas: number | null;
  pct_reportes_completos_1a: number | null;
  contatos_resolvidos_pelo_agente: number;
  /** Tempo até o primeiro trecho do LLM; não inclui ASR, TTS ou RTC. */
  latencia_voz_ms: { p50: number | null; p95: number | null; amostras: number };
}

export interface BackendReceiver {
  recebedor: string;
  responsavel: string;
  telefone_e164: string;
  entregas: number;
  espera_media_h: number | null;
  ligacoes: number;
  ligacoes_atendidas: number;
  estadia_devida: number;
  avisados_antes_da_chegada: number;
}

interface BackendDocumentBase {
  id: string;
  title: string;
  number: string;
  fileUri: string | null;
  /** Documentos do endpoint atual são fixtures declaradas pelo backend. */
  mock: true;
}

export interface BackendInvoiceDocument extends BackendDocumentBase {
  kind: 'NF-e';
  issuer: string;
  recipient: string;
  weightKg: number;
  items: string;
  valueBRL: number;
  campos: {
    numero: string;
    emitente: string;
    destinatario: string;
    peso_kg: number;
    itens: string;
    valor: number;
    chave: string;
  };
}

export interface BackendFreightDocument extends BackendDocumentBase {
  kind: 'CT-e';
  carrier: string;
  plate: string;
  freightBRL: number;
  campos: { numero: string; transportadora: string; placa: string; frete: number; nfe_referenciada: string };
}

export type BackendDocument = BackendInvoiceDocument | BackendFreightDocument;

export interface BackendRequest {
  id: number;
  rota_id: number;
  pergunta: string;
  resposta: string | null;
  status: 'pendente' | 'perguntada' | 'respondida';
  criada_em: string;
  respondida_em: string | null;
  transcricao: string | null;
}

/** Perfil persistido para seleção na demo; não constitui autorização. */
export interface BackendUserProfile {
  id: string;
  email: string;
  role: 'cco' | 'driver';
  name: string;
  driverId: number | null;
  tripId: string | null;
}

/** SSO retornado pelo endpoint existente é mock; não constitui autenticação da API. */
export interface BackendSsoResult {
  token: string;
  user: BackendUserProfile;
}

export type BackendFileCategory = 'documento' | 'nota_fiscal' | 'comprovante' | 'imagem' | 'outro';

export interface BackendFile {
  id: number;
  rota_id: number;
  nome_original: string;
  tipo_mime: string;
  tamanho_bytes: number;
  categoria: BackendFileCategory;
  descricao: string | null;
  criado_em: string;
  /** Apenas metadado: download usa IDs e a base configurada, nunca esta URL. */
  url_download: string;
}
