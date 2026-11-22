import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { API_BASE_URL } from '../../lib/apiConfig';
import { ApiClient } from '../api/client';
import { opsStore, startEngine, RECEIVERS, type OpsState } from '../mock/engine';
import { createApiRuntime } from './runtime';

type Mode = 'api' | 'demo';
const source = createStore<{ mode: Mode }>(() => ({ mode: API_BASE_URL ? 'api' : 'demo' }));
let runtime: ReturnType<typeof createApiRuntime> | undefined;
let client: ApiClient | undefined;
let configurationError: string | null = null;
try { if (API_BASE_URL) { client = new ApiClient(API_BASE_URL); runtime = createApiRuntime(client); } }
catch { configurationError = 'api_invalid_configuration'; }

/** Store vazio para apresentar uma configuração inválida sem executar a simulação como se fosse API. */
const unavailable = createApiRuntime(new ApiClient('/'));
const apiRuntime = () => runtime ?? unavailable;
export const apiConfigured = Boolean(API_BASE_URL);
export const getApiClient = () => client;
/** Reconciliar também após falhas de POST: o backend pode já ter persistido a alteração. */
export const refreshOperations = () => apiRuntime().refresh();
export const useMode = () => useStore(source, (state) => state.mode);
export function setMode(mode: Mode) { if (mode === 'demo' || apiConfigured) source.setState({ mode }); }
export function useOps(): OpsState;
export function useOps<T>(selector: (state: OpsState) => T): T;
export function useOps<T>(selector?: (state: OpsState) => T) {
  const mode = useMode();
  return useStore(mode === 'api' ? apiRuntime().store : opsStore, selector ?? ((state: OpsState) => state as T));
}
export function useConnection() {
  const mode = useMode();
  const state = useStore(apiRuntime().connection);
  return { ...state, mode, ...(mode === 'api' && configurationError ? { status: 'error' as const, error: configurationError } : {}) };
}
export function useReceivers() {
  const mode = useMode();
  const receivers = useStore(apiRuntime().store, (state) => state.receivers);
  return mode === 'api' ? receivers : RECEIVERS;
}
export function receiverById(id: string) {
  const receivers = source.getState().mode === 'api' ? apiRuntime().store.getState().receivers : RECEIVERS;
  return receivers.find((receiver) => receiver.id === id) ?? { id, name: '—', position: { lat: 0, lng: 0 }, typicalWaitMin: 0, answerRate: 0 };
}
export function startOperations() {
  if (source.getState().mode === 'demo') return startEngine();
  if (configurationError) return () => {};
  apiRuntime().start();
  return () => apiRuntime().stop();
}
export const retryConnection = () => apiRuntime().start();
export const confirmUnload = (tripId: string) => apiRuntime().confirmUnload(tripId);
