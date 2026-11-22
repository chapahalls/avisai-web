import { useMemo } from 'react';
import { useOps, useMode } from '../../../services/operations';
import { useBackendAnalytics } from '../../../services/analytics';
import { calculateDailySeries, calculateMetrics } from '../../../utils/metrics';

export function useMetrics() {
  const mode = useMode();
  const backend = useBackendAnalytics();
  const history = useOps((s) => s.history);
  const tasks = useOps((s) => s.tasks);
  const calls = useOps((s) => s.calls);
  const historicalCalls = useOps((s) => s.historicalCalls);
  const demo = useMemo(() => calculateMetrics(history, tasks, [...historicalCalls, ...calls]), [history, tasks, calls, historicalCalls]);
  return mode === 'api'
    ? { source: 'api' as const, ...backend.metrics, retry: backend.retry }
    : { source: 'demo' as const, data: demo };
}

export function useDailySeries() {
  const mode = useMode();
  const history = useOps((s) => s.history);
  return useMemo(() => mode === 'demo' ? calculateDailySeries(history) : [], [history, mode]);
}
