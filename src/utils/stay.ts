import { BUSINESS } from '../lib/config';

/** Estadia (R5): horas acima da franquia, "ou fração", × capacidade × valor por t/h. */
export function stayValue(waitMin: number, capacityTons: number) {
  const excess = Math.max(0, waitMin / 60 - BUSINESS.franchiseHours);
  return Math.ceil(excess) * capacityTons * BUSINESS.stayRatePerTonHour;
}
