export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const hhmm = (min: number) => `${Math.floor(min / 60)}h${String(Math.floor(min % 60)).padStart(2, '0')}`;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const clock = (simMin: number) => {
  const m = (8 * 60 + simMin) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
};
