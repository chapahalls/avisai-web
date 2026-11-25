import { createStore } from 'zustand/vanilla';
import { ApiClient, ApiError, type ApiConnectionStatus } from '../api/client.js';
import type { BackendSnapshot, BackendRoute, BackendTask, BackendStreamMessages } from '../api/types.js';
import type { OpsState } from '../mock/engine.js';
import type { Receiver } from '../../types/ops.js';
import { projectSnapshot, routeKey, taskKey } from './adapter.js';

export interface ConnectionState {
  status: ApiConnectionStatus;
  lastSyncedAt: string | null;
  error: string | null;
  actionError: string | null;
  pendingTaskIds: string[];
  pendingUnloadIds: string[];
}
export interface ApiOpsState extends OpsState { receivers: Receiver[] }
const emptySnapshot = (): BackendSnapshot => ({ rotas: [], tasks: [], estadias: [], ligacoes: [], eventos: [], ocorrencias: [], chamados: [] });
const upsert = <T extends { id: number }>(items: T[], item: T) => [item, ...items.filter((candidate) => candidate.id !== item.id)];
const errorLabel = (error: unknown) => error instanceof ApiError ? error.message : 'api_invalid_response';
const taskOrder: Record<BackendTask['status'], number> = { pendente: 0, escalada_recebedor: 1, confirmada: 2, concluida: 3 };
const laterTask = (first: BackendTask | undefined, second: BackendTask) =>
  first && taskOrder[first.status] > taskOrder[second.status] ? first : second;

/** Preserva somente entidades alteradas pelo stream enquanto a leitura REST estava em voo. */
function reconcile<T>(next: T[], before: T[], live: T[], key: (item: T) => number, complete = false): T[] {
  const initial = new Map(before.map((item) => [key(item), item]));
  const current = new Map(live.map((item) => [key(item), item]));
  const ids = new Set(next.map(key));
  const result = next.filter((item) => !complete || !initial.has(key(item)) || current.has(key(item))).map((item) => {
    const latest = current.get(key(item));
    return latest && latest !== initial.get(key(item)) ? latest : item;
  });
  for (const item of live) if (!ids.has(key(item)) && item !== initial.get(key(item))) result.push(item);
  return result;
}

/** Uma fonte operacional isolada: nenhuma transição é produzida pelo simulador neste store. */
export function createApiRuntime(client: ApiClient, options: { now?: () => Date; pollMs?: number } = {}) {
  const now = options.now ?? (() => new Date());
  let snapshot = emptySnapshot();
  const details = new Map<number, BackendRoute>();
  let active = false;
  let generation = 0;
  let resetRevision = 0;
  let streamStatus: ApiConnectionStatus = 'closed';
  let controller: AbortController | undefined;
  let closeStream: (() => void) | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let refreshAgain = false;

  const connection = createStore<ConnectionState>(() => ({
    status: 'closed', lastSyncedAt: null, error: null, actionError: null, pendingTaskIds: [], pendingUnloadIds: [],
  }));
  const store = createStore<ApiOpsState>(() => ({
    ...projectSnapshot(snapshot, details, now()), running: false, operatorResponsiveness: 0,
    historicalCalls: [], history: [], tick: () => {}, setResponsiveness: () => {}, toggle: () => {},
    acknowledge: (id) => { void confirmTask(id); },
    mobileAction: () => {},
  }));

  function apply(markSync = true) {
    if (!active) return;
    store.setState(projectSnapshot(snapshot, details, now()));
    if (markSync) connection.setState({ lastSyncedAt: now().toISOString() });
  }
  function scheduleRefresh() {
    if (!active || refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, 100);
  }
  async function optionalList<T>(request: Promise<T>, fallback: T): Promise<T> {
    try { return await request; }
    catch (error) {
      // Outro backend pode expor apenas o snapshot. Isso não cria registros fictícios.
      if (error instanceof ApiError && [404, 405].includes(error.status ?? 0)) return fallback;
      throw error;
    }
  }
  async function refresh(): Promise<void> {
    if (!active) return;
    if (inFlight) {
      const waitingGeneration = generation;
      refreshAgain = true;
      await inFlight;
      return active && waitingGeneration === generation ? refresh() : undefined;
    }
    const expectedGeneration = generation;
    const initialResetRevision = resetRevision;
    const before = snapshot;
    const signal = controller!.signal;
    inFlight = (async () => {
      try {
        const next = await client.getSnapshot(signal);
        const [tasks, calls, events] = await Promise.all([
          optionalList(client.listTasks(signal), next.tasks),
          optionalList(client.listCalls(signal), next.ligacoes),
          optionalList(client.listEvents({ limit: 200 }, signal), next.eventos),
        ]);
        await Promise.all(next.rotas.filter((route) => !details.has(route.id)).map(async (route) => {
          try {
            const detail = await client.getRoute(route.id, signal);
            if (active && expectedGeneration === generation && initialResetRevision === resetRevision) details.set(route.id, detail);
          } catch (error) {
            if (!(error instanceof ApiError && [404, 405].includes(error.status ?? 0))) throw error;
          }
        }));
        if (!active || expectedGeneration !== generation) return;
        for (const id of details.keys()) if (!next.rotas.some((route) => route.id === id)) details.delete(id);
        if (initialResetRevision !== resetRevision) { refreshAgain = true; return; }
        const live = snapshot;
        const restRoutes = new Map(next.rotas.map((route) => [route.id, route]));
        const restTasks = new Map(tasks.map((task) => [task.id, task]));
        const nextStays = new Map(next.estadias.map((stay) => [stay.estadia_id, stay]));
        const stays = reconcile(next.estadias, before.estadias, live.estadias, (stay) => stay.estadia_id).map((stay) => {
          const rest = nextStays.get(stay.estadia_id);
          // Encerramento confirmado prevalece; o contador não pode recuar.
          return rest && (rest.encerrada || !stay.encerrada && rest.horas_paradas > stay.horas_paradas) ? rest : stay;
        });
        snapshot = {
          ...next,
          rotas: reconcile(next.rotas, before.rotas, live.rotas, (route) => route.id, true).map((route) =>
            restRoutes.get(route.id)?.status === 'descarregada' ? { ...route, status: 'descarregada' } : route),
          tasks: reconcile(tasks, before.tasks, live.tasks, (task) => task.id).map((task) =>
            laterTask(restTasks.get(task.id), task)),
          ligacoes: reconcile(calls, before.ligacoes, live.ligacoes, (call) => call.id),
          eventos: reconcile(events, before.eventos, live.eventos, (event) => event.id),
          ocorrencias: reconcile(next.ocorrencias, before.ocorrencias, live.ocorrencias, (occurrence) => occurrence.id),
          chamados: next.chamados ?? live.chamados ?? [],
          estadias: stays,
        };
        apply();
        connection.setState({ error: null, status: streamStatus });
      } catch (error) {
        if (!active || expectedGeneration !== generation) return;
        connection.setState({ status: 'error', error: errorLabel(error) });
      } finally {
        // Um ciclo antigo não pode retirar o bloqueio de uma requisição nova.
        if (expectedGeneration === generation) {
          inFlight = undefined;
          if (refreshAgain) { refreshAgain = false; scheduleRefresh(); }
        }
      }
    })();
    return inFlight;
  }

  async function confirmTask(id: string) {
    const task = snapshot.tasks.find((item) => taskKey(item.id) === id);
    if (!active || !task || !['pendente', 'escalada_recebedor'].includes(task.status) || connection.getState().pendingTaskIds.includes(id)) return;
    const expectedGeneration = generation;
    connection.setState((state) => ({ pendingTaskIds: [...state.pendingTaskIds, id], actionError: null }));
    try {
      const updated = await client.confirmTask(task.id, 'CCO', controller!.signal);
      if (!active || expectedGeneration !== generation) return;
      snapshot = { ...snapshot, tasks: upsert(snapshot.tasks, updated) };
      apply();
      await refresh();
    } catch (error) {
      if (active && expectedGeneration === generation) connection.setState({ actionError: errorLabel(error) });
    } finally {
      if (active && expectedGeneration === generation) connection.setState((state) => ({ pendingTaskIds: state.pendingTaskIds.filter((key) => key !== id) }));
    }
  }

  async function confirmUnload(id: string) {
    const route = snapshot.rotas.find((item) => routeKey(item.id) === id);
    if (!active || !route || route.status !== 'no_destino' || connection.getState().pendingUnloadIds.includes(id)) return;
    const expectedGeneration = generation;
    connection.setState((state) => ({ pendingUnloadIds: [...state.pendingUnloadIds, id], actionError: null }));
    try {
      await client.confirmUnload(route.id, 'CCO', controller!.signal);
      if (!active || expectedGeneration !== generation) return;
      // A resposta do servidor é reconciliada com rota, Task e estadia, sem descarga local.
      await refresh();
    } catch (error) {
      if (active && expectedGeneration === generation) connection.setState({ actionError: errorLabel(error) });
    } finally {
      if (active && expectedGeneration === generation) connection.setState((state) => ({ pendingUnloadIds: state.pendingUnloadIds.filter((key) => key !== id) }));
    }
  }

  function mergePosition(data: BackendStreamMessages['posicao']) {
    snapshot = {
      ...snapshot,
      rotas: snapshot.rotas.map((route) => route.id === data.rota_id ? data.fonte === 'rastreador' ? {
        ...route, rastreador_lat: data.lat, rastreador_lng: data.lng, rastreador_em: now().toISOString(),
      } : {
        ...route, ultima_lat: data.lat, ultima_lng: data.lng, distancia_m: data.distancia_m,
        eta_min: data.eta_min, status: route.status === 'descarregada' ? route.status : data.status, ultima_posicao_em: now().toISOString(),
      } : route),
    };
    apply();
  }

  function start() {
    stop();
    active = true;
    const expectedGeneration = ++generation;
    controller = new AbortController();
    connection.setState({ status: 'connecting', error: null });
    const current = (action: () => void) => { if (active && generation === expectedGeneration) action(); };
    closeStream = client.subscribe({
      onStatus: (status) => current(() => {
        streamStatus = status;
        connection.setState({ status });
        if (status === 'connected') scheduleRefresh();
      }),
      onError: (error) => current(() => connection.setState({ error: errorLabel(error) })),
      snapshot: (data) => current(() => {
        snapshot = data;
        apply(); connection.setState({ error: null }); scheduleRefresh();
      }),
      evento: (event) => current(() => {
        snapshot = { ...snapshot, eventos: upsert(snapshot.eventos, event).slice(0, 200) };
        apply(); scheduleRefresh();
      }),
      task: ({ task }) => current(() => {
        snapshot = { ...snapshot, tasks: upsert(snapshot.tasks, laterTask(snapshot.tasks.find((item) => item.id === task.id), task)) };
        apply();
      }),
      posicao: (position) => current(() => mergePosition(position)),
      contador: ({ estadias }) => current(() => {
        const updated = new Map(estadias.map((stay) => [stay.estadia_id, stay]));
        snapshot = { ...snapshot, estadias: [...snapshot.estadias.filter((stay) => !updated.has(stay.estadia_id)), ...estadias] };
        apply();
      }),
      // As falas persistidas chegam em `evento`; não inventar IDs nem duplicar evidências no canal efêmero.
      fala: () => current(scheduleRefresh),
      reset: () => current(() => { details.clear(); resetRevision++; scheduleRefresh(); }),
      chamado: () => current(scheduleRefresh),
    });
    void refresh();
    clockTimer = setInterval(() => apply(false), 1000);
    // Reconciliação REST cobre perdas do stream, que não oferece replay.
    pollTimer = setInterval(() => { void refresh(); }, options.pollMs ?? 15_000);
    return () => { if (generation === expectedGeneration) stop(); };
  }

  function stop() {
    active = false;
    generation++;
    controller?.abort();
    closeStream?.();
    closeStream = undefined;
    clearInterval(clockTimer);
    clearInterval(pollTimer);
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
    inFlight = undefined;
    refreshAgain = false;
    snapshot = emptySnapshot();
    resetRevision = 0;
    streamStatus = 'closed';
    details.clear();
    store.setState(projectSnapshot(snapshot, details, now()));
    connection.setState({ status: 'closed', error: null, actionError: null, lastSyncedAt: null, pendingTaskIds: [], pendingUnloadIds: [] });
  }

  return { store, connection, start, stop, refresh, confirmUnload };
}
