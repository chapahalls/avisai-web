import type { Delivery } from '../../types/ops';
import { RECEIVERS, seeded } from './data';

/** 7 dias de entregas FICTÍCIAS para as métricas e o ranking terem histórico. */
export function buildHistory(): Delivery[] {
  const rnd = seeded(42);
  const out: Delivery[] = [];
  for (let day = -6; day <= 0; day++) {
    for (let i = 0; i < 9; i++) {
      const r = RECEIVERS[Math.floor(rnd() * RECEIVERS.length)];
      // A adoção do aviso prévio cresce ao longo da semana (efeito do AvisAI no mock).
      const notified = rnd() < 0.45 + (day + 6) * 0.08;
      const wait = Math.max(30, r.typicalWaitMin * (notified ? 0.8 : 1.1) + (rnd() - 0.5) * 120);
      const escalated = rnd() < 0.25;
      out.push({
        tripId: `h${day}-${i}`,
        receiverId: r.id,
        day,
        waitMin: Math.round(wait),
        capacityTons: rnd() < 0.6 ? 30 : 14,
        notifiedBeforeArrival: notified,
        callAnswered: rnd() < r.answerRate,
        ccoActionMin: escalated ? null : Math.round(5 + rnd() * 50),
        escalated,
        reportCompleteFirst: rnd() < 0.72,
        stayCharged: rnd() < 0.15,
        contactsAvoided: 2 + Math.floor(rnd() * 4),
        voiceLatencyMs: Math.round(700 + rnd() * 1300),
      });
    }
  }
  return out;
}
