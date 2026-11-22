/** Mesmos parâmetros do app mobile (docs/REGRAS-DE-NEGOCIO.md). */
export const BUSINESS = {
  franchiseHours: 5,
  stayRatePerTonHour: 2.5,
  maxCcoAttempts: 3,
  ccoAttemptIntervalMin: 20,
  approachKm: 8,
} as const;

/** Relógio simulado: 1 s real = 1 min. */
export const SIM_MINUTES_PER_SECOND = 1;
