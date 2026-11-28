/**
 * Ponte da Demo com o backend: traduz o que o agente faz de verdade (ferramentas e eventos da rota de
 * demonstração) no que o celular simulado mostra, como o app faz com o mesmo stream. Puro e testável.
 */
export type DemoScreen = 'home' | 'map' | 'documents' | 'messages' | 'queue';
export type DemoTripCommand = 'start' | 'approach' | 'arrive' | 'unload';
export type DemoBridgeEffect =
  | { kind: 'screen'; screen: DemoScreen }
  | { kind: 'trip'; command: DemoTripCommand }
  | { kind: 'end_voice' }
  | { kind: 'receiver_line'; who: 'agent' | 'receiver'; text: string }
  | { kind: 'receiver_answer'; dock: string | null; time: string | null }
  | { kind: 'receiver_no_answer' };

const SCREEN_BY_TELA: Record<string, DemoScreen> = {
  inicio: 'home', mapa: 'map', documentos: 'documents', mensagens: 'messages', fila: 'queue',
};

const TRIP_BY_EVENT: Record<string, DemoTripCommand> = {
  retirada: 'start', aproximacao: 'approach', chegada: 'arrive', chegada_confirmada_voz: 'arrive', descarga: 'unload',
};

/** `acao_cliente` (ferramenta comandar_app): mesmos nomes que o app do motorista recebe. */
export function effectForClientAction(action: unknown, screen?: unknown): DemoBridgeEffect | null {
  switch (action) {
    case 'open_screen': {
      const target = typeof screen === 'string' ? SCREEN_BY_TELA[screen] : undefined;
      return target ? { kind: 'screen', screen: target } : null;
    }
    case 'open_document': return { kind: 'screen', screen: 'documents' };
    case 'open_navigation':
    case 'start_gps': return { kind: 'screen', screen: 'map' };
    case 'go_back': return { kind: 'screen', screen: 'home' };
    case 'end_voice': return { kind: 'end_voice' };
    default: return null;
  }
}

/** `evento` da rota: marcos da viagem e a ligação ao recebedor. */
export function effectForEvent(type: unknown, message: unknown, data: unknown): DemoBridgeEffect | null {
  if (typeof type !== 'string') return null;
  if (type in TRIP_BY_EVENT) return { kind: 'trip', command: TRIP_BY_EVENT[type] };
  const values = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  switch (type) {
    case 'fala_recebedor': {
      const line = text(message);
      return line ? { kind: 'receiver_line', who: 'receiver', text: line } : null;
    }
    case 'resposta_recebedor': return { kind: 'receiver_answer', dock: text(values.doca), time: text(values.previsao) };
    case 'ligacao_nao_atendida':
    case 'ligacao_falhou': return { kind: 'receiver_no_answer' };
    default: return null;
  }
}

/** `fala` do agente: só a que vai para o recebedor entra no celular dele (a do motorista já sai na voz). */
export function effectForSpeech(role: unknown, speech: unknown): DemoBridgeEffect | null {
  return role === 'recebedor' && typeof speech === 'string' && speech.trim()
    ? { kind: 'receiver_line', who: 'agent', text: speech.trim() }
    : null;
}
