import type { Receiver } from '../../types/ops';

/** Dados FICTÍCIOS (declarados no README). */
export const RECEIVERS: Receiver[] = [
  { id: 'r1', name: 'Supermercado Destino', position: { lat: -22.9056, lng: -47.0608 }, typicalWaitMin: 310, answerRate: 0.7 },
  { id: 'r2', name: 'Atacado Central', position: { lat: -22.8212, lng: -47.2671 }, typicalWaitMin: 420, answerRate: 0.45 },
  { id: 'r3', name: 'CD Varejo Norte', position: { lat: -22.7391, lng: -47.3307 }, typicalWaitMin: 150, answerRate: 0.9 },
  { id: 'r4', name: 'Home Center Sul', position: { lat: -23.0102, lng: -46.9821 }, typicalWaitMin: 240, answerRate: 0.75 },
  { id: 'r5', name: 'Mercado do Bairro', position: { lat: -22.9471, lng: -47.1542 }, typicalWaitMin: 200, answerRate: 0.55 },
];

export const ORIGIN = { lat: -23.0905, lng: -47.2181 };

export const DRIVERS = ['Motorista A', 'Motorista B', 'Motorista C', 'Motorista D', 'Motorista E', 'Motorista F', 'Motorista G', 'Motorista H'];

/** Placas fictícias no padrão Mercosul. */
export const PLATES = ['ABC1D23', 'BRA2E19', 'QWE3R45', 'RTY4U56', 'UIO5P67', 'ASD6F78', 'GHJ7K89', 'ZXC8V90'];

/** Gerador determinístico para o histórico ficar igual a cada recarga. */
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
