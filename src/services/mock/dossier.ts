import type { CargoItem, DossierEvent, MockInvoice, TripCommunication, TripDossierData } from '../../types/dossier.js';
import type { Trip } from '../../types/ops.js';
import { seeded } from './data.js';

const productKeys = ['rice', 'beverages', 'cleaning', 'packagedFood', 'paperGoods', 'dryGoods'] as const;
const invoiceDate = '2026-11-22';
const sum = (items: CargoItem[], field: 'weightKg' | 'packageCount' | 'totalValueBRL') => items.reduce((total, item) => total + item[field], 0);

function tripSeed(tripId: string) {
  let value = 2166136261;
  for (const character of tripId) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** O ID determina os documentos; relógio, idioma e sorteios do motor não os alteram. */
export function buildTripDossier(trip: Trip): TripDossierData {
  const seed = tripSeed(trip.id);
  const random = seeded(seed);
  const cargoItems: CargoItem[] = [0.4, 0.3, 0.3].map((share, index) => {
    const weightKg = trip.capacityTons * 1000 * share;
    const unitWeightKg = index === 2 ? 10 : 20;
    const packageCount = weightKg / unitWeightKg;
    const unitValueBRL = 80 + Math.floor(random() * 90);
    return {
      id: `${trip.id}-cargo-${index + 1}`,
      descriptionKey: `dossier.products.${productKeys[(seed + index) % productKeys.length]}`,
      packageCount, unitWeightKg, weightKg, unitValueBRL,
      totalValueBRL: packageCount * unitValueBRL,
    };
  });
  const invoices: MockInvoice[] = [cargoItems.slice(0, 2), cargoItems.slice(2)].map((items, index) => ({
    id: `${trip.id}-invoice-${index + 1}`,
    number: String(100000 + seed % 800000 + index),
    series: String(1 + seed % 3).padStart(3, '0'),
    issuedOn: invoiceDate,
    status: 'simulated',
    originNameKey: 'dossier.origin',
    receiverId: trip.receiverId,
    cargoItems: items,
    totalWeightKg: sum(items, 'weightKg'),
    totalPackageCount: sum(items, 'packageCount'),
    totalValueBRL: sum(items, 'totalValueBRL'),
  }));
  return {
    tripId: trip.id, fictitious: true, capacityTons: trip.capacityTons,
    cargoItems, invoices, totalWeightKg: sum(cargoItems, 'weightKg'),
    totalPackageCount: sum(cargoItems, 'packageCount'),
    totalValueBRL: sum(cargoItems, 'totalValueBRL'),
  };
}

/** Cenários locais e eventos do motor, sem envio, leitura ou entrega a terceiros. */
export function buildTripCommunications(
  trip: Trip,
  events: readonly DossierEvent[],
  simMinutes: number,
): TripCommunication[] {
  const tripEvents = events.filter((event) => event.tripId === trip.id && event.simMin <= simMinutes);
  const assignedAt = tripEvents.find((event) => event.type === 'RouteAssigned')?.simMin ?? 0;
  const approachingAt = tripEvents.find((event) => event.type === 'ApproachDetected')?.simMin ?? assignedAt;
  const communications: TripCommunication[] = tripEvents.map((event) => {
    let messageKey = typeof event.payload.messageKey === 'string' ? event.payload.messageKey : undefined;
    let values: Record<string, string | number> | undefined;
    if (typeof event.payload.resultCode === 'string') {
      messageKey = `calls.results.${event.payload.resultCode}`;
      values = typeof event.payload.dock === 'number' ? { dock: event.payload.dock } : undefined;
    } else if (event.type === 'ReportSubmitted') {
      messageKey = event.payload.completeFirst === false ? 'dossier.messages.reportIncomplete' : 'dossier.messages.reportComplete';
    } else if (event.type === 'TaskEscalated') {
      messageKey = event.payload.status === 'escalated' ? 'dossier.messages.taskEscalated' : 'dossier.messages.taskAttempt';
      values = typeof event.payload.attempt === 'number' ? { attempt: event.payload.attempt } : undefined;
    }
    return {
      id: `dossier-${event.id}`, tripId: trip.id, kind: 'event', source: event.source,
      atMin: event.simMin, titleKey: `events.${event.type}`, messageKey, values,
      eventType: event.type, fictitious: true,
    };
  });
  const addMessage = (name: string, source: TripCommunication['source'], atMin: number) => {
    communications.push({
      id: `${trip.id}-message-${name}`, tripId: trip.id, kind: 'message', source,
      atMin: Math.max(0, Math.min(atMin, simMinutes)),
      titleKey: source === 'driver' ? 'dossier.communications.driverReport' : 'dossier.communications.agentNote',
      messageKey: `dossier.messages.${name}`, fictitious: true,
    });
  };
  addMessage('cargoChecked', 'driver', assignedAt);
  if (trip.progress >= 0.4) addMessage('onRoute', 'driver', assignedAt);
  if (trip.phase !== 'driving') addMessage('approaching', 'driver', approachingAt);
  if (trip.phase === 'waiting' || trip.phase === 'unloaded') {
    addMessage('atGate', 'driver', trip.arrivedAtMin ?? assignedAt);
    addMessage('waitingEvidence', 'agent', trip.arrivedAtMin ?? assignedAt);
  }
  if (trip.phase === 'unloaded') addMessage('unloaded', 'driver', trip.unloadedAtMin ?? simMinutes);
  return communications.sort((a, b) => b.atMin - a.atMin || a.id.localeCompare(b.id));
}
