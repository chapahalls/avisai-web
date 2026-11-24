import { clamp01 } from './timeline';

/** Etapas e tempos da cena da doca, sem depender do three.js. */
export const DOCK_STEPS = ['notify', 'arrive', 'talk', 'prove'] as const;
export type DockStep = (typeof DOCK_STEPS)[number];

/** Etapa ativa e progresso dentro dela, a partir do progresso da seção. */
export function dockStepAt(progress: number): { step: DockStep; index: number; local: number } {
  const scaled = clamp01(progress) * DOCK_STEPS.length;
  const index = Math.min(DOCK_STEPS.length - 1, Math.floor(scaled));
  return { step: DOCK_STEPS[index], index, local: clamp01(scaled - index) };
}

/**
 * Linha do tempo da etapa 4 (progresso local da etapa): o anel da estadia
 * chega a 100% e o comprovante sai como um pacote até o nó do CCO.
 */
export const DOCK_PROVE_TIMING = {
  ringEnd: 0.2,
  flightStart: 0.22,
  /** O pacote bate na borda da tela e estoura. */
  burst: 0.34,
  /** Corte (escondido pelo clarão) para a sala do CCO. */
  cut: 0.36,
  /** O dado chega à parede de vídeo do CCO. */
  arrive: 0.5,
} as const;

