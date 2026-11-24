import chipUrl from '../assets/rodar-chip.webp';
import { useLoader } from './useLoader';
import { usePreload } from './usePreload';
import { useReducedMotion } from './useReducedMotion';
import { useSmoothScroll } from './useSmoothScroll';

/** Arquivos que precisam estar prontos antes da abertura aparecer. */
export const HOME_ASSETS: readonly string[] = [chipUrl];

/** Orquestra a entrada da home: pré-carregamento real, contador, saída do loader e rolagem suave. */
export function useHomeIntro() {
  const reducedMotion = useReducedMotion();
  const real = usePreload(HOME_ASSETS);
  const { progress, phase } = useLoader(real, reducedMotion);
  useSmoothScroll(!reducedMotion, phase !== 'done');
  return { progress, phase, reducedMotion, chipUrl };
}
