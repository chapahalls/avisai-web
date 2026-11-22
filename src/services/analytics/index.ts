import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ApiError } from '../api/client';
import type { BackendMetrics, BackendReceiver } from '../api/types';
import { getApiClient, useMode } from '../operations';

interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
}
interface AnalyticsState {
  metrics: Resource<BackendMetrics>;
  ranking: Resource<BackendReceiver[]>;
}
const empty = <T,>(): Resource<T> => ({ data: null, loading: false, error: null, updatedAt: null });
const analytics = createStore<AnalyticsState>(() => ({ metrics: empty(), ranking: empty() }));
let subscribers = 0;
let generation = 0;
let controller: AbortController | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let inFlight: Promise<void> | undefined;

/** Compartilha uma leitura entre Dashboard/cards e nunca completa resultados com a Demo. */
export function refreshAnalytics(): Promise<void> {
  if (!subscribers) return Promise.resolve();
  if (inFlight) return inFlight;
  const client = getApiClient();
  if (!client) {
    analytics.setState((state) => ({
      metrics: { ...state.metrics, error: 'api_invalid_configuration', loading: false },
      ranking: { ...state.ranking, error: 'api_invalid_configuration', loading: false },
    }));
    return Promise.resolve();
  }
  const expected = generation;
  const signal = controller!.signal;
  analytics.setState((state) => ({
    metrics: { ...state.metrics, loading: true, error: null },
    ranking: { ...state.ranking, loading: true, error: null },
  }));
  const load = async <K extends keyof AnalyticsState>(key: K, request: Promise<NonNullable<AnalyticsState[K]['data']>>) => {
    try {
      const data = await request;
      if (subscribers && expected === generation) {
        analytics.setState({ [key]: { data, loading: false, error: null, updatedAt: new Date().toISOString() } });
      }
    } catch (error) {
      if (subscribers && expected === generation) analytics.setState((state) => ({
        [key]: { ...state[key], loading: false, error: error instanceof ApiError ? error.message : 'api_invalid_response' },
      }));
    }
  };
  inFlight = Promise.all([
    load('metrics', client.getMetrics(signal)),
    load('ranking', client.getReceivers(signal)),
  ]).then(() => {}).finally(() => { if (expected === generation) inFlight = undefined; });
  return inFlight;
}

function subscribe() {
  if (++subscribers === 1) {
    generation++;
    controller = new AbortController();
    void refreshAnalytics();
    interval = setInterval(() => { void refreshAnalytics(); }, 15_000);
  }
  return () => {
    if (--subscribers === 0) {
      generation++;
      controller?.abort();
      clearInterval(interval);
      inFlight = undefined;
      analytics.setState({ metrics: empty(), ranking: empty() });
    }
  };
}

export function useBackendAnalytics() {
  const mode = useMode();
  const state = useStore(analytics);
  useEffect(() => mode === 'api' ? subscribe() : undefined, [mode]);
  return { ...state, retry: refreshAnalytics };
}
