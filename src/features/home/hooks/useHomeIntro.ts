import { useLoader } from './useLoader';
import { usePreload } from './usePreload';
import { useReducedMotion } from './useReducedMotion';
import { useSmoothScroll } from './useSmoothScroll';
import {
  HOME_BRAZIL_TOPOGRAPHY_URL,
  HOME_WORLD_WIREFRAME_URL,
} from '../three/mapAssets';
import { HOME_TRUCK_WIREFRAME_URL } from '../three/truckAsset';

/**
 * Arquivos que precisam estar prontos antes da abertura aparecer, além das fontes.
 * Os modelos já chegam como GLBs compactos, sem baixar os packs 3D inteiros.
 */
export const HOME_ASSETS: readonly string[] = [
  HOME_TRUCK_WIREFRAME_URL,
  HOME_BRAZIL_TOPOGRAPHY_URL,
  HOME_WORLD_WIREFRAME_URL,
];

/** Orquestra a entrada da home: pré-carregamento real, contador, saída do loader e rolagem suave. */
export function useHomeIntro() {
  const reducedMotion = useReducedMotion();
  const real = usePreload(HOME_ASSETS);
  const { progress, phase } = useLoader(real, reducedMotion);
  useSmoothScroll(!reducedMotion, phase !== 'done');
  return { progress, phase, reducedMotion };
}
