import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * Rolagem suave da home com Lenis (lerp 0.1, âncoras suaves, toque nativo).
 * `enabled` falso (movimento reduzido) mantém a rolagem nativa; `locked` pausa a rolagem durante o carregamento.
 * A instância existe só enquanto a home está montada, sem afetar o painel do CCO.
 */
export function useSmoothScroll(enabled: boolean, locked: boolean) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.1, anchors: true });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    const lenis = lenisRef.current;
    if (lenis) {
      if (locked) lenis.stop();
      else lenis.start();
    }
    const root = document.documentElement;
    root.style.overflow = locked ? 'hidden' : '';
    return () => { root.style.overflow = ''; };
  }, [enabled, locked]);

  return lenisRef;
}
