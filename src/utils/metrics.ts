import type { CallLog, Delivery, Task } from '../types/ops.js';
import { stayValue } from './stay.js';

const mean = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

/** Percentil por nearest-rank (ordem ceil(p × n)). */
export function percentile(values: number[], percent: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(percent * sorted.length / 100) - 1))];
}

export function calculateMetrics(history: Delivery[], tasks: Task[], calls: CallLog[]) {
  const latencies = history.map((delivery) => delivery.voiceLatencyMs);
  return {
    deliveries: history.length,
    avgStoppedMin: mean(history.map((delivery) => delivery.waitMin)),
    stayDue: history.reduce((total, delivery) => total + stayValue(delivery.waitMin, delivery.capacityTons), 0),
    stayCharged: history.reduce((total, delivery) => total + (delivery.stayCharged ? stayValue(delivery.waitMin, delivery.capacityTons) : 0), 0),
    notifiedRate: mean(history.map((delivery) => Number(delivery.notifiedBeforeArrival))),
    callAnsweredRate: mean(calls.map((call) => Number(call.answered))),
    avgCcoActionMin: mean(history.flatMap((delivery) => delivery.ccoActionMin === null ? [] : [delivery.ccoActionMin])),
    escalatedOpen: tasks.filter((task) => task.status === 'escalated').length,
    escalatedTotal: history.filter((delivery) => delivery.escalated).length,
    completeFirstRate: mean(history.map((delivery) => Number(delivery.reportCompleteFirst))),
    contactsAvoided: history.reduce((total, delivery) => total + delivery.contactsAvoided, 0),
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
  };
}

export function calculateDailySeries(history: Delivery[]) {
  return [...new Set(history.map((delivery) => delivery.day))].sort((a, b) => a - b).map((day) => {
    const deliveries = history.filter((delivery) => delivery.day === day);
    const metrics = calculateMetrics(deliveries, [], []);
    return {
      day,
      horasParadas: metrics.avgStoppedMin / 60,
      avisados: metrics.notifiedRate * 100,
      estadiaDevida: metrics.stayDue,
      estadiaCobrada: metrics.stayCharged,
    };
  });
}
