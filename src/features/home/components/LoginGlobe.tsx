import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './login-globe.css';

/** Globo 3D do login: Brasil em destaque e a malha rodoviária com caminhões em rota. */
export function LoginGlobe() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [stats, setStats] = useState<{ corridors: number; cities: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    let dispose: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibility: IntersectionObserver | null = null;
    void (async () => {
      try {
        const module = await import('../three/createLoginGlobe');
        const controller = await module.createLoginGlobe(canvas, { reducedMotion });
        if (!alive) {
          controller.dispose();
          return;
        }
        dispose = controller.dispose;
        setStats(module.LOGIN_ROUTE_STATS);
        const resize = () => {
          const bounds = canvas.getBoundingClientRect();
          controller.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        visibility = new IntersectionObserver(([entry]) => controller.setActive(entry.isIntersecting));
        visibility.observe(canvas);
        resize();
        setState('ready');
      } catch {
        if (alive) setState('failed');
      }
    })();
    return () => {
      alive = false;
      resizeObserver?.disconnect();
      visibility?.disconnect();
      dispose?.();
    };
  }, [reducedMotion]);

  return (
    <figure className="login-globe" data-state={state} aria-label={t('auth.globe.label')}>
      <div className="login-globe-halo" aria-hidden="true" />
      <canvas ref={canvasRef} className="login-globe-canvas" />
      <figcaption className="login-globe-legend">
        <p className="login-globe-title">{t('auth.globe.title')}</p>
        {stats ? <p className="login-globe-stats">{t('auth.globe.stats', stats)}</p> : null}
        <ul>
          <li><span className="login-globe-swatch login-globe-swatch-road" aria-hidden="true" />{t('auth.globe.roads')}</li>
          <li><span className="login-globe-swatch login-globe-swatch-truck" aria-hidden="true" />{t('auth.globe.trucks')}</li>
          <li><span className="login-globe-swatch login-globe-swatch-hub" aria-hidden="true" />{t('auth.globe.hub')}</li>
        </ul>
        <p className="login-globe-note">{t('auth.globe.demo')}</p>
      </figcaption>
    </figure>
  );
}
