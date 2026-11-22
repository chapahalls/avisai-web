import { useMemo } from 'react';
import { RECEIVERS } from '../../../services/mock/engine';
import { useOps, useMode } from '../../../services/operations';
import { useBackendAnalytics } from '../../../services/analytics';
import { stayValue } from '../../../utils/stay';

/** Ranking de recebedores: dado para renegociar com o embarcador (não cobrança contra o recebedor). */
export function useRanking() {
  const mode = useMode();
  const backend = useBackendAnalytics();
  const history = useOps((s) => s.history);
  const calls = useOps((s) => s.calls);
  const historicalCalls = useOps((s) => s.historicalCalls);
  const demo = useMemo(
    () =>
      RECEIVERS.map((r) => {
        const ds = history.filter((d) => d.receiverId === r.id);
        const receiverCalls = [...historicalCalls, ...calls].filter((call) => call.receiverId === r.id);
        const avg = ds.length ? ds.reduce((a, d) => a + d.waitMin, 0) / ds.length : 0;
        return {
          id: r.id,
          name: r.name,
          deliveries: ds.length,
          avgWaitMin: avg,
          stoppedHours: ds.reduce((a, d) => a + d.waitMin, 0) / 60,
          stayDue: ds.reduce((a, d) => a + stayValue(d.waitMin, d.capacityTons), 0),
          answeredRate: receiverCalls.length ? receiverCalls.filter((call) => call.answered).length / receiverCalls.length : 0,
        };
      }).sort((a, b) => b.avgWaitMin - a.avgWaitMin),
    [history, calls, historicalCalls],
  );
  return mode === 'api'
    ? { source: 'api' as const, ...backend.ranking, retry: backend.retry }
    : { source: 'demo' as const, data: demo };
}
