import { useLoader } from './useLoader';
import { usePreload } from './usePreload';
import { useReducedMotion } from './useReducedMotion';
import { useSmoothScroll } from './useSmoothScroll';

/**
 * Imagens que precisam estar prontas antes da abertura aparecer, além das fontes.
 * O símbolo RODAR da abertura é SVG inline, então hoje nenhuma imagem é baixada.
 */
export const HOME_ASSETS: readonly string[] = [];

/** Orquestra a entrada da home: pré-carregamento real, contador, saída do loader e rolagem suave. */
export function useHomeIntro() {
  const reducedMotion = useReducedMotion();
  const real = usePreload(HOME_ASSETS);
  const { progress, phase } = useLoader(real, reducedMotion);
  useSmoothScroll(!reducedMotion, phase !== 'done');
  return { progress, phase, reducedMotion };
}
