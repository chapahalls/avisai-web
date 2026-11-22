import type { BackendSnapshot, BackendRoute, BackendEvent } from '../api/types.js';
import type { FeedEvent, OpsState } from '../mock/engine.js';
import type { Receiver, Trip, Task, CallLog } from '../../types/ops.js';
import type { EventType, DomainEvent } from '../../types/events.js';
import { createRoutePath } from '../../utils/routePath.js';

export type OperationalData = Pick<OpsState, 'trips' | 'tasks' | 'calls' | 'feed' | 'tripMeta' | 'simMinutes'> & { receivers: Receiver[] };
export const routeKey = (id: number) => `api-route-${id}`;
export const taskKey = (id: number) => `api-task-${id}`;

/** O ORM serializa UTC sem offset; isso não significa horário local do navegador. */
export function backendDate(value: string) {
  return new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

function baseline(now: Date) {
  const date = new Date(now);
  date.setHours(8, 0, 0, 0);
  return date.getTime();
}

const phase: Record<string, Trip['phase']> = {
  publicada: 'driving', planejada: 'driving', na_origem: 'driving', em_transito: 'driving', aproximando: 'approaching', no_destino: 'waiting', descarregada: 'unloaded',
};
const taskStatus: Record<string, Task['status']> = {
  pendente: 'open', confirmada: 'acknowledged', escalada_recebedor: 'escalated', concluida: 'closed',
};
const eventType: Record<string, EventType> = {
  sessao_iniciada: 'RouteAssigned', aproximacao: 'ApproachDetected', chegada: 'ArrivalRegistered',
  chegada_confirmada_voz: 'ArrivalRegistered', notificacao_cco: 'TaskEscalated', escalada_recebedor: 'TaskEscalated',
  task_confirmada: 'TaskAcknowledged', ligacao_recebedor: 'ReceiverNotified', ligacao_falhou: 'ReceiverCallResult',
  fallback_plano_b: 'ReceiverCallResult', ligacao_nao_atendida: 'ReceiverCallResult', resposta_recebedor: 'ReceiverCallResult',
  ocorrencia: 'OccurrenceCreated', descarga: 'UnloadConfirmed', fala_motorista: 'ReportSubmitted',
  fala_recebedor: 'ReceiverCallResult', fala_agente: 'ReportSubmitted',
  rota_publicada: 'RouteAssigned', rota_atribuida: 'RouteAssigned', arquivo_adicionado: 'ReportSubmitted',
  retirada: 'PickupConfirmed', relatorio: 'ReportSubmitted', campo_faltante: 'ReportFieldMissing',
  task_criada: 'TaskCreated', aviso_recebedor: 'ReceiverNotified', nao_recebe_hoje: 'ReceiverCallResult',
  resposta_central: 'ReportSubmitted',
  pergunta_documento: 'DocumentQuestionAnswered',
};
const eventSource: Record<string, DomainEvent['source']> = {
  task_confirmada: 'cco', descarga: 'cco', fala_motorista: 'driver', chegada_confirmada_voz: 'driver',
  fala_recebedor: 'agent', fala_agente: 'agent', resposta_recebedor: 'agent', ligacao_recebedor: 'agent',
  ligacao_falhou: 'agent', ligacao_nao_atendida: 'agent', fallback_plano_b: 'agent',
  rota_publicada: 'cco', rota_atribuida: 'cco', arquivo_adicionado: 'cco',
  retirada: 'driver', relatorio: 'driver', resposta_central: 'driver', pedido_central: 'cco',
  campo_faltante: 'agent', aviso_recebedor: 'agent', nao_recebe_hoje: 'agent', pergunta_documento: 'agent',
};

/** Projeção sobre o trajeto informado: serve à linha percorrida, nunca substitui o GPS recebido. */
function pathProgress(path: ReturnType<typeof createRoutePath>, position: Trip['position']) {
  if (path.totalKm === 0) return 0;
  const scale = Math.cos(position.lat * Math.PI / 180);
  let bestDistance = Infinity;
  let progress = 0;
  for (let index = 1; index < path.points.length; index++) {
    const a = path.points[index - 1], b = path.points[index];
    const dx = (b.lng - a.lng) * scale, dy = b.lat - a.lat;
    const px = (position.lng - a.lng) * scale, py = position.lat - a.lat;
    const length = dx * dx + dy * dy;
    const fraction = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0;
    const distance = (px - fraction * dx) ** 2 + (py - fraction * dy) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      progress = (path.cumulativeKm[index - 1] + fraction * (path.cumulativeKm[index] - path.cumulativeKm[index - 1])) / path.totalKm;
    }
  }
  return progress;
}

export function assertSnapshot(value: BackendSnapshot): void {
  if (!value || !['rotas', 'tasks', 'estadias', 'ligacoes', 'ocorrencias', 'eventos'].every((key) => Array.isArray(value[key as keyof BackendSnapshot]))) {
    throw new Error('invalid_snapshot');
  }
  for (const route of value.rotas) {
    if (!route || !Number.isSafeInteger(route.id) || route.id <= 0 || typeof route.placa !== 'string'
      || typeof route.destino_nome !== 'string' || typeof route.origem_nome !== 'string'
      || !Number.isFinite(route.carga_t) || route.carga_t < 0 || !phase[route.status]
      || !validCoordinates(route.origem_lat, route.origem_lng) || !validCoordinates(route.destino_lat, route.destino_lng)
      || route.ultima_lat !== null && !validCoordinates(route.ultima_lat, route.ultima_lng)) {
      throw new Error('invalid_route');
    }
  }
  for (const task of value.tasks) {
    if (!task || !Number.isSafeInteger(task.id) || !Number.isSafeInteger(task.rota_id) || !taskStatus[task.status]
      || !Number.isFinite(backendDate(task.criada_em).getTime())) throw new Error('invalid_task');
  }
  for (const stay of value.estadias) {
    if (!stay || !Number.isSafeInteger(stay.estadia_id) || !Number.isSafeInteger(stay.rota_id)
      || !Number.isFinite(stay.horas_paradas) || !Number.isFinite(stay.valor) || !Number.isFinite(stay.capacidade_t)) throw new Error('invalid_stay');
  }
  for (const call of value.ligacoes) {
    if (!call || !Number.isSafeInteger(call.id) || !Number.isSafeInteger(call.rota_id) || !Array.isArray(call.transcricao)
      || !Number.isFinite(backendDate(call.iniciada_em).getTime())) throw new Error('invalid_call');
  }
  for (const event of value.eventos) {
    if (!event || !Number.isSafeInteger(event.id) || typeof event.tipo !== 'string'
      || typeof event.mensagem !== 'string' || !Number.isFinite(backendDate(event.timestamp).getTime())) throw new Error('invalid_event');
  }
}

function validCoordinates(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function projectSnapshot(snapshot: BackendSnapshot, details: ReadonlyMap<number, BackendRoute>, now = new Date()): OperationalData {
  assertSnapshot(snapshot);
  const base = baseline(now);
  const atMinute = (date: string) => (backendDate(date).getTime() - base) / 60_000;
  const optionalMinute = (date: string | null | undefined) => date ? atMinute(date) : undefined;
  const receivers: Receiver[] = snapshot.rotas.map((route) => ({
    id: `api-receiver-${route.id}`, name: route.destino_nome,
    position: { lat: route.destino_lat, lng: route.destino_lng }, typicalWaitMin: 0, answerRate: 0,
  }));
  const trips: Trip[] = snapshot.rotas.map((summary) => {
    const route = { ...summary, trajeto: details.get(summary.id)?.trajeto ?? summary.trajeto };
    const stay = snapshot.estadias.filter((item) => item.rota_id === route.id).sort((a, b) => b.estadia_id - a.estadia_id)[0];
    const mobileKnown = validCoordinates(route.ultima_lat, route.ultima_lng);
    const trackerKnown = validCoordinates(route.rastreador_lat, route.rastreador_lng);
    const trackerNewer = trackerKnown && (!mobileKnown || Boolean(route.rastreador_em && (!route.ultima_posicao_em
      || backendDate(route.rastreador_em).getTime() > backendDate(route.ultima_posicao_em).getTime())));
    const known = mobileKnown || trackerKnown;
    const position = trackerNewer ? { lat: route.rastreador_lat!, lng: route.rastreador_lng! }
      : mobileKnown ? { lat: route.ultima_lat!, lng: route.ultima_lng! } : { lat: route.origem_lat, lng: route.origem_lng };
    const positionAt = trackerNewer ? route.rastreador_em : route.ultima_posicao_em;
    const points = (route.trajeto ?? []).filter((point) => Array.isArray(point) && validCoordinates(point[0], point[1])).map(([lat, lng]) => ({ lat, lng }));
    const path = createRoutePath(points);
    const arrivedAt = stay ? atMinute(stay.inicio) : undefined;
    const notified = snapshot.ligacoes.some((call) => call.rota_id === route.id && call.motivo === 'aproximacao' && call.atendida
      && call.encerrada_em && stay && backendDate(call.encerrada_em).getTime() < backendDate(stay.inicio).getTime());
    return {
      id: routeKey(route.id), vehicleId: `api-vehicle-${route.id}`, backendId: route.id, source: 'api',
      plate: route.placa, driver: route.motorista_nome ?? '', receiverId: `api-receiver-${route.id}`,
      origin: { lat: route.origem_lat, lng: route.origem_lng }, capacityTons: route.carga_t,
      phase: phase[route.status], progress: known ? pathProgress(path, position) : 0,
      routeKm: path.totalKm, position, positionKnown: known, positionSource: known ? trackerNewer ? 'rastreador' : 'celular' : undefined,
      lastPositionAt: positionAt ? backendDate(positionAt).toISOString() : null,
      routePoints: points, distanceRemainingKm: route.distancia_m === null ? null : route.distancia_m / 1000, etaMin: route.eta_min,
      arrivedAtMin: arrivedAt, unloadedAtMin: stay?.fim ? atMinute(stay.fim) : undefined, notifiedBeforeArrival: notified,
      stay: stay ? { waitMin: stay.horas_paradas * 60, valueBRL: stay.valor, franchiseHours: stay.franquia_h, capacityTons: stay.capacidade_t } : undefined,
      backend: { invoiceNumber: route.nota_fiscal, cargoDescription: route.carga_descricao, cargoTons: route.carga_t,
        originName: route.origem_nome, destinationName: route.destino_nome, arrivalWindow: route.janela_descarga ?? '',
        receiverContact: route.recebedor_nome, status: route.status, driverId: route.motorista_id, companyId: route.empresa_id },
    };
  });
  const metadata = Object.fromEntries(trips.map((trip) => [trip.id, { plate: trip.plate, driver: trip.driver, receiverId: trip.receiverId }]));
  const tasks: Task[] = snapshot.tasks.map((task) => ({
    id: taskKey(task.id), tripId: routeKey(task.rota_id), attempts: task.tentativas, status: taskStatus[task.status],
    createdAtMin: atMinute(task.criada_em), acknowledgedAtMin: optionalMinute(task.confirmado_em),
    closedAtMin: optionalMinute(task.concluida_em), escalatedAtMin: task.status === 'escalada_recebedor' ? optionalMinute(task.ultima_notificacao) : undefined,
  }));
  const calls: CallLog[] = snapshot.ligacoes.map((call) => ({
    id: `api-call-${call.id}`, source: 'api', tripId: routeKey(call.rota_id), receiverId: `api-receiver-${call.rota_id}`,
    plate: metadata[routeKey(call.rota_id)]?.plate ?? '', moment: call.motivo === 'aproximacao' ? 'approach' : 'escalation',
    atMin: atMinute(call.iniciada_em), occurredAt: backendDate(call.iniciada_em).toISOString(), status: call.status,
    answered: call.atendida, result: call.resposta_resumo ?? '',
    resultCode: call.status === 'falhou' ? 'failed' : ['chamando', 'em_andamento'].includes(call.status) ? 'in_progress'
      : call.atendida ? call.doca ? 'dock_confirmed' : 'answered' : 'no_answer',
    dock: call.doca ?? undefined,
    transcript: call.transcricao.map((line) => ({ who: line.quem === 'recebedor' ? 'receiver' : 'agent', text: line.texto })),
  }));
  const feed: FeedEvent[] = [...new Map(snapshot.eventos.map((event) => [event.id, event])).values()]
    .sort((a, b) => backendDate(b.timestamp).getTime() - backendDate(a.timestamp).getTime() || b.id - a.id).map((event: BackendEvent) => ({
      id: `api-event-${event.id}`, idempotencyKey: `api-event-${event.id}`, tripId: event.rota_id === null ? '' : routeKey(event.rota_id),
      occurredAt: backendDate(event.timestamp).toISOString(), receivedAt: now.toISOString(),
      type: eventType[event.tipo] ?? 'OccurrenceCreated', source: eventSource[event.tipo] ?? 'system', simMin: atMinute(event.timestamp),
      payload: { ...event.dados, backendType: event.tipo, backendMessage: event.mensagem, plate: event.rota_id === null ? '' : metadata[routeKey(event.rota_id)]?.plate,
        channel: event.dados.canal === 'painel' ? 'panel' : event.dados.canal === 'ligacao' ? 'call' : event.dados.canal },
    }));
  return { trips, tasks, calls, feed, tripMeta: metadata, receivers, simMinutes: (now.getTime() - base) / 60_000 };
}
