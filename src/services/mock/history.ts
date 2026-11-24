import type { CallLog, Delivery } from '../../types/ops.js';
import { stayValue } from '../../utils/stay.js';
import { buildCall } from './calls.js';
import { PLATES, RECEIVERS, seeded } from './data.js';

const NOTIFIED_COUNTS = [4, 5, 6, 6, 7, 8, 8] as const;

/** Composição estável: a tendência não depende de trocar o perfil dos recebedores. */
export function buildHistoricalData(): { deliveries: Delivery[]; calls: CallLog[] } {
  const random = seeded(42);
  const templates = Array.from({ length: 9 }, (_, index) => ({
    receiver: RECEIVERS[index % RECEIVERS.length],
    capacityTons: (random() < 0.6 ? 30 : 14) as 14 | 30,
    waitFactor: 0.75 + random() * 0.5,
    order: random(),
  })).sort((a, b) => a.order - b.order);
  const deliveries: Delivery[] = [];
  const calls: CallLog[] = [];
  for (let index = 0; index < 7; index += 1) {
    const day = index - 6;
    templates.forEach((template, slot) => {
      const { receiver, capacityTons, waitFactor } = template;
      const tripId = `history-${index}-${slot}`;
      const notified = slot < NOTIFIED_COUNTS[index];
      const escalated = random() < 0.25;
      const trip = { plate: PLATES[slot % PLATES.length], driver: `Motorista ${String.fromCharCode(65 + slot % 8)}`, receiverId: receiver.id };
      // Chegadas entre 07:00 e 17:00; o aviso sai 30 min antes e a nova tentativa 75 min depois.
      const arrivalMinuteOfDay = 7 * 60 + slot * 75;
      const approachAtMin = day * 1440 + arrivalMinuteOfDay - 30;
      const approach = buildCall({
        id: `${tripId}-approach`, tripId, trip, receiver, moment: 'approach',
        atMin: approachAtMin, random, answered: notified,
      });
      calls.push(approach);
      let callAnswered = approach.answered;
      if (escalated) {
        const escalation = buildCall({
          id: `${tripId}-escalation`, tripId, trip, receiver, moment: 'escalation',
          atMin: approachAtMin + 75, random,
        });
        calls.push(escalation);
        callAnswered ||= escalation.answered;
      }
      deliveries.push({
        tripId, receiverId: receiver.id, day, capacityTons,
        waitMin: Math.round(receiver.typicalWaitMin * waitFactor * (notified ? 0.8 : 1.1) * (1 - index * 0.025)),
        notifiedBeforeArrival: notified, callAnswered, escalated,
        ccoActionMin: escalated ? null : Math.round(5 + random() * 35),
        reportCompleteFirst: random() < 0.75,
        stayCharged: false,
        contactsAvoided: 2 + Math.floor(random() * 4),
        voiceLatencyMs: Math.round(700 + random() * 1300),
        plate: trip.plate, driver: trip.driver,
        arrivalMinuteOfDay,
      });
    });
  }
  const eligible = deliveries.filter((delivery) => stayValue(delivery.waitMin, delivery.capacityTons) > 0)
    .map((delivery) => ({ delivery, order: random() })).sort((a, b) => a.order - b.order);
  eligible.slice(0, Math.round(eligible.length * 0.15)).forEach(({ delivery }) => { delivery.stayCharged = true; });
  return { deliveries, calls };
}

export const buildHistory = () => buildHistoricalData().deliveries;
