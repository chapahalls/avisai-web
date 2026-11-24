import { useMemo } from 'react';
import { useMode, useOps } from '../../../services/operations';
import { dayOfSimMinute, driverStats, filterDeliveries, occurrences, type AnalyticsFilters } from '../../analytics';

/** Últimos 7 dias do motorista (Demo); a API ainda não fornece histórico por motorista. */
export function useDriverHistory(driver: string | null) {
  const mode = useMode();
  const history = useOps((state) => state.history);
  const calls = useOps((state) => state.calls);
  const tasks = useOps((state) => state.tasks);
  const feed = useOps((state) => state.feed);
  const tripMeta = useOps((state) => state.tripMeta);
  const simMinutes = useOps((state) => state.simMinutes);
  return useMemo(() => {
    if (mode === 'api' || !driver) return { stats: null };
    const filters: AnalyticsFilters = { period: '7d', receiverId: 'all', driver, occurrence: 'all' };
    const today = dayOfSimMinute(simMinutes);
    const deliveries = filterDeliveries(history, filters, today);
    const rows = occurrences({ deliveries: history, calls, tasks, feed, tripMeta, simMinutes }, filters);
    return { stats: driverStats(deliveries, rows)[0] ?? null };
  }, [mode, driver, history, calls, tasks, feed, tripMeta, simMinutes]);
}
