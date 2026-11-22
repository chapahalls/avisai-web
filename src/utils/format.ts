import { SIMULATION } from '../lib/config.js';

export const brl = (value: number, locale = 'pt-BR') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(value);

export const hhmm = (minutes: number, locale = 'pt-BR') => {
  const value = Math.max(0, Math.floor(minutes));
  return locale.startsWith('pt')
    ? `${Math.floor(value / 60)}h${String(value % 60).padStart(2, '0')}`
    : `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m`;
};

export const pct = (value: number, locale = 'pt-BR') =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);

export const clock = (simMinutes: number) => {
  const minute = ((SIMULATION.startHour * 60 + Math.floor(simMinutes)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
};
