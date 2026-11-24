import { useEffect, useRef, useState } from 'react';
import { LOADER_EXIT_MS, LOADER_HOLD_MS, LOADER_MIN_MS, LOADER_STEP_MS, loaderTarget, nextDisplayed, type LoaderPhase } from '../model';

/** Contador da tela de carregamento: segue o progresso real com piso de tempo e conduz as fases de saída. */
export function useLoader(realFraction: number, reducedMotion: boolean): { progress: number; phase: LoaderPhase } {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<LoaderPhase>('loading');
  const realRef = useRef(realFraction);

  useEffect(() => { realRef.current = realFraction; }, [realFraction]);

  useEffect(() => {
    const start = performance.now();
    const minMs = reducedMotion ? 400 : LOADER_MIN_MS;
    const exitMs = reducedMotion ? 0 : LOADER_EXIT_MS;
    const timers: number[] = [];
    let frame = 0;
    let shown = 0;
    let lastStep = 0;
    setProgress(0);
    setPhase('loading');
    const tick = (now: number) => {
      if (now - lastStep >= LOADER_STEP_MS) {
        shown = nextDisplayed(shown, loaderTarget(realRef.current, now - start, minMs));
        lastStep = now;
        setProgress(shown);
      }
      if (shown < 100) {
        frame = requestAnimationFrame(tick);
        return;
      }
      timers.push(window.setTimeout(() => setPhase('exit'), LOADER_HOLD_MS));
      timers.push(window.setTimeout(() => setPhase('done'), LOADER_HOLD_MS + exitMs));
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reducedMotion]);

  return { progress, phase };
}
