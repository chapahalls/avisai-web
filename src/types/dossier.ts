import type { DomainEvent } from './events.js';
import type { Trip } from './ops.js';

/** Dados comerciais fictícios, usados apenas para apresentar o cenário do CCO. */
export interface CargoItem {
  id: string;
  descriptionKey: string;
  packageCount: number;
  unitWeightKg: number;
  weightKg: number;
  unitValueBRL: number;
  totalValueBRL: number;
}

export interface MockInvoice {
  id: string;
  number: string;
  series: string;
  issuedOn: string;
  status: 'simulated';
  originNameKey: string;
  receiverId: string;
  cargoItems: CargoItem[];
  totalWeightKg: number;
  totalPackageCount: number;
  totalValueBRL: number;
}

export interface TripDossierData {
  tripId: string;
  fictitious: true;
  capacityTons: Trip['capacityTons'];
  cargoItems: CargoItem[];
  invoices: MockInvoice[];
  totalWeightKg: number;
  totalPackageCount: number;
  totalValueBRL: number;
}

export interface DossierEvent extends DomainEvent {
  simMin: number;
}

export interface TripCommunication {
  id: string;
  tripId: string;
  kind: 'event' | 'message';
  source: DomainEvent['source'];
  atMin: number;
  titleKey: string;
  messageKey?: string;
  values?: Record<string, string | number>;
  eventType?: DomainEvent['type'];
  fictitious: true;
}
