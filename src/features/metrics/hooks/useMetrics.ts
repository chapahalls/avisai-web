import { useMemo } from 'react';
import { useOps } from '../../../services/mock/engine';
import { stayValue } from '../../../utils/stay';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/** KPIs que o agente consegue medir (docs/ARQUITETURA.md, seção métricas). */
export function useMetrics() {
  const history = useOps((s) => s.history);
  const tasks = useOps((s) => s.tasks);
  const calls = useOps((s) => s.calls);
  return useMemo(() => {
    const due = history.map((d) => stayValue(d.waitMin, d.capacityTons));
    const charged = history.map((d, i) => (d.stayCharged ? due[i] : 0));
    const actions = history.map((d) => d.ccoActionMin).filter((x): x is number => x !== null);
    const lat = history.map((d) => d.voiceLatencyMs);
    const answeredBase = calls.length ? calls.map((c) => c.answered) : history.map((d) => d.callAnswered);
    return {
      deliveries: history.length,
      avgStoppedMin: avg(history.map((d) => d.waitMin)),
      stayDue: due.reduce((a, b) => a + b, 0),
      stayCharged: charged.reduce((a, b) => a + b, 0),
      notifiedRate: avg(history.map((d) => (d.notifiedBeforeArrival ? 1 : 0))),
      callAnsweredRate: avg(answeredBase.map((a) => (a ? 1 : 0))),
      avgCcoActionMin: avg(actions),
      escalatedOpen: tasks.filter((t) => t.status === 'escalated').length,
      escalatedTotal: history.filter((d) => d.escalated).length,
      completeFirstRate: avg(history.map((d) => (d.reportCompleteFirst ? 1 : 0))),
      contactsAvoided: history.reduce((a, d) => a + d.contactsAvoided, 0),
      latencyP50: percentile(lat, 50),
      latencyP95: percentile(lat, 95),
    };
  }, [history, tasks, calls]);
}

/** Série por dia para os gráficos. */
export function useDailySeries() {
  const history = useOps((s) => s.history);
  return useMemo(() => {
    const days = Array.from(new Set<number>(history.map((d) => d.day))).sort((a, b) => a - b);
    return days.map((day) => {
      const ds = history.filter((d) => d.day === day);
      const due = ds.reduce((a, d) => a + stayValue(d.waitMin, d.capacityTons), 0);
      return {
        day: day === 0 ? 'hoje' : `D${day}`,
        horasParadas: +(avg(ds.map((d) => d.waitMin)) / 60).toFixed(1),
        avisados: Math.round(avg(ds.map((d) => (d.notifiedBeforeArrival ? 1 : 0))) * 100),
        estadiaDevida: Math.round(due),
        estadiaCobrada: Math.round(ds.reduce((a, d) => a + (d.stayCharged ? stayValue(d.waitMin, d.capacityTons) : 0), 0)),
      };
    });
  }, [history]);
}
