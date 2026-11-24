import { useMemo } from 'react';
import { useMode, useOps } from '../../services/operations';
import {
  ALL, ccoContacts, dayOfSimMinute, demoKpis, driverByPlate, driverStats, filterCalls, filterDeliveries,
  occurrences, receiverStats, type AnalyticsFilters, type AnalyticsInput,
} from './model';

/**
 * Dados das Análises. Na Demo, histórico de 7 dias + sessão; na API, só o que a
 * sessão recebeu (ligações, Tasks, eventos) — agregados vêm de useMetrics/useRanking.
 */
export function useAnalytics(filters: AnalyticsFilters) {
  const mode = useMode();
  const history = useOps((state) => state.history);
  const calls = useOps((state) => state.calls);
  const historicalCalls = useOps((state) => state.historicalCalls);
  const tasks = useOps((state) => state.tasks);
  const feed = useOps((state) => state.feed);
  const tripMeta = useOps((state) => state.tripMeta);
  const simMinutes = useOps((state) => state.simMinutes);

  return useMemo(() => {
    const deliveries = mode === 'api' ? [] : history;
    const allCalls = mode === 'api' ? calls : [...historicalCalls, ...calls];
    const input: AnalyticsInput = { deliveries, calls: allCalls, tasks, feed, tripMeta, simMinutes };
    const today = dayOfSimMinute(simMinutes);
    const plates = driverByPlate(deliveries, tripMeta);
    const filteredDeliveries = filterDeliveries(deliveries, filters, today);
    const filteredCalls = filterCalls(allCalls, filters, today, plates)
      .sort((a, b) => b.atMin - a.atMin);
    const occurrenceRows = occurrences(input, filters);
    const allOccurrences = occurrences(input, { ...filters, occurrence: ALL });
    const drivers = [...new Set([...deliveries.map((delivery) => delivery.driver), ...Object.values(tripMeta).map((meta) => meta.driver)].filter(Boolean))].sort() as string[];
    return {
      mode,
      today,
      plates,
      drivers,
      deliveries: filteredDeliveries,
      calls: filteredCalls,
      occurrences: occurrenceRows,
      allOccurrences,
      contacts: ccoContacts(input, filters),
      driverRows: driverStats(filteredDeliveries, allOccurrences),
      receiverRows: receiverStats(filteredDeliveries, filteredCalls, allOccurrences),
      kpis: demoKpis(filteredDeliveries, filteredCalls, allOccurrences),
    };
  }, [mode, history, calls, historicalCalls, tasks, feed, tripMeta, simMinutes, filters]);
}
