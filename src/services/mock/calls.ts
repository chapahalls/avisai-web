import { SIMULATION } from '../../lib/config.js';
import type { CallLog, Receiver, TripMetadata } from '../../types/ops.js';

/** Texto de referência preservado; a UI traduz messageKey e values ao exibir. */
export function buildCall({
  id, tripId, trip, receiver, moment, atMin, random, answered: forcedAnswer,
}: {
  id: string;
  tripId: string;
  trip: TripMetadata;
  receiver: Receiver;
  moment: CallLog['moment'];
  atMin: number;
  random: () => number;
  answered?: boolean;
}): CallLog {
  const answered = forcedAnswer ?? random() < receiver.answerRate;
  const nextDay = answered && random() < SIMULATION.nextDayAnswerRate;
  const dock = answered && !nextDay ? 1 + Math.floor(random() * 6) : undefined;
  const resultCode = !answered ? 'no_answer' : nextDay ? 'next_day' : 'dock_confirmed';
  const transcript: CallLog['transcript'] = [{
    who: 'agent',
    text: moment === 'approach'
      ? `Olá, aqui é o assistente virtual da transportadora. O caminhão de placa ${trip.plate} está se aproximando. Qual doca e horário?`
      : `Olá, aqui é o assistente virtual da transportadora. O caminhão de placa ${trip.plate} aguarda descarga. Qual doca e horário?`,
    messageKey: `calls.transcript.${moment}`,
    values: { plate: trip.plate },
  }];
  if (answered) {
    transcript.push({
      who: 'receiver',
      text: nextDay ? 'Hoje não recebemos mais, só amanhã às 7h.' : `Pode mandar, doca ${dock} libera em 30 minutos.`,
      messageKey: nextDay ? 'calls.transcript.nextDay' : 'calls.transcript.dockConfirmed',
      values: dock === undefined ? undefined : { dock },
    });
  }
  return {
    id, tripId, receiverId: receiver.id, plate: trip.plate, moment, atMin, answered, resultCode, dock, transcript,
    result: !answered ? 'não atendeu' : nextDay ? 'não recebe hoje' : `doca ${dock}, 30 min`,
  };
}
