/** Mesmos parâmetros do app mobile (docs/REGRAS-DE-NEGOCIO.md). */
export const BUSINESS = {
  franchiseHours: 5,
  stayRatePerTonHour: 2.5,
  maxCcoAttempts: 3,
  ccoAttemptIntervalMin: 20,
  approachKm: 8,
} as const;

/** Premissas da calculadora pública de estadia (home): dias úteis por mês. */
export const LANDING_CALCULATOR = {
  workingDaysPerMonth: 22,
} as const;

/** Relógio simulado: 1 s real = 1 min. */
export const SIM_MINUTES_PER_SECOND = 1;

export const SIMULATION = {
  seed: 42,
  startHour: 8,
  speedKmh: 70,
  nextTripAfterMin: 30,
  operatorResponsiveness: 0.35,
  occurrenceRatePerMin: 0.01,
  nextDayAnswerRate: 0.12,
  feedLimit: 200,
} as const;
