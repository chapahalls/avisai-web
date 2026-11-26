import { createStore } from 'zustand/vanilla';

/**
 * Chamados do motorista e mensagens do CCO na Demo. Mesmo formato de status da API
 * (`/cco/chamados`, `/rotas/{id}/mensagens`), mas tudo em memória: os textos semeados
 * são chaves i18n e a resposta do motorista é simulada por temporizadores.
 */
export type DemoRequestStatus = 'coletando' | 'aguardando_cco' | 'respondido' | 'timeout';
export type DemoMessageStatus = 'enviada' | 'falada' | 'respondida' | 'offline';

export interface DemoDriverRequest {
  id: number;
  tripId: string;
  routeNumber: number;
  subjectKey: string;
  descriptionKey: string;
  highway: string | null;
  km: number | null;
  status: DemoRequestStatus;
  attempts: number;
  maxAttempts: number;
}

export interface DemoDriverMessage {
  id: number;
  tripId: string;
  sender: string;
  text: string;
  status: DemoMessageStatus;
  replyKey: string | null;
}

interface DemoConversations { requests: DemoDriverRequest[]; messages: DemoDriverMessage[] }

/** Atrasos da resposta simulada: o agente fala a mensagem e o motorista responde por voz. */
export const DEMO_MESSAGE_DELAYS_MS = { spoken: 2_000, answered: 6_000 } as const;

const seed = (): DemoConversations => ({
  requests: [
    { id: 1, tripId: 'trip-2', routeNumber: 2, subjectKey: 'driverRequests.demo.flatTire.subject', descriptionKey: 'driverRequests.demo.flatTire.description', highway: 'SP-348', km: 82, status: 'aguardando_cco', attempts: 2, maxAttempts: 3 },
    { id: 2, tripId: 'trip-5', routeNumber: 5, subjectKey: 'driverRequests.demo.gateClosed.subject', descriptionKey: 'driverRequests.demo.gateClosed.description', highway: 'SP-065', km: 141, status: 'aguardando_cco', attempts: 1, maxAttempts: 3 },
    { id: 3, tripId: 'trip-7', routeNumber: 7, subjectKey: 'driverRequests.demo.traffic.subject', descriptionKey: 'driverRequests.demo.traffic.description', highway: null, km: null, status: 'coletando', attempts: 1, maxAttempts: 3 },
  ],
  messages: [],
});

export const conversationsStore = createStore<DemoConversations>(() => seed());

/** Resposta do CCO: o chamado sai da fila de abertos, como na API. */
export function respondDemoRequest(id: number, reply: string) {
  if (!reply.trim()) return;
  conversationsStore.setState((state) => ({
    requests: state.requests.map((request) => request.id === id ? { ...request, status: 'respondido' } : request),
  }));
}

export function sendDemoMessage(tripId: string, sender: string, text: string): DemoDriverMessage {
  const { messages } = conversationsStore.getState();
  const message: DemoDriverMessage = {
    id: Math.max(0, ...messages.map((item) => item.id)) + 1, tripId, sender: sender.trim(), text: text.trim(), status: 'enviada', replyKey: null,
  };
  conversationsStore.setState({ messages: [message, ...messages] });
  const update = (patch: Partial<DemoDriverMessage>) => conversationsStore.setState((state) => ({
    messages: state.messages.map((item) => item.id === message.id ? { ...item, ...patch } : item),
  }));
  setTimeout(() => update({ status: 'falada' }), DEMO_MESSAGE_DELAYS_MS.spoken);
  setTimeout(() => update({ status: 'respondida', replyKey: 'driverMessages.demoReply' }), DEMO_MESSAGE_DELAYS_MS.answered);
  return message;
}
