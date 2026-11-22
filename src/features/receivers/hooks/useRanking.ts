import { useMemo } from 'react';
import { RECEIVERS, useOps } from '../../../services/mock/engine';
import { stayValue } from '../../../utils/stay';

/** Ranking de recebedores: dado para renegociar com o embarcador (não cobrança contra o recebedor). */
export function useRanking() {
  const history = useOps((s) => s.history);
  return useMemo(
    () =>
      RECEIVERS.map((r) => {
        const ds = history.filter((d) => d.receiverId === r.id);
        const avg = ds.length ? ds.reduce((a, d) => a + d.waitMin, 0) / ds.length : 0;
        return {
          id: r.id,
          name: r.name,
          deliveries: ds.length,
          avgWaitMin: avg,
          stoppedHours: ds.reduce((a, d) => a + d.waitMin, 0) / 60,
          stayDue: ds.reduce((a, d) => a + stayValue(d.waitMin, d.capacityTons), 0),
          answeredRate: ds.length ? ds.filter((d) => d.callAnswered).length / ds.length : 0,
        };
      }).sort((a, b) => b.avgWaitMin - a.avgWaitMin),
    [history],
  );
}
