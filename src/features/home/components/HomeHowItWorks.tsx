import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { stayValue } from '../../../utils/stay';
import type { DockSceneController } from '../three/createDockScene';
import { DOCK_PROVE_TIMING, DOCK_STEPS, dockStepAt } from '../three/dockTimeline';
import { clamp01 } from '../three/timeline';

/** Dados fictícios da cena: 22 t e espera de 5h09. */
const DEMO_TONS = 22;
const DEMO_WAIT_MIN = 5 * 60 + 9;

/** Texto revelado pelo scroll: já lido escuro, uma faixa em verde e o restante apagado. */
function RevealText({ text, reveal }: { text: string; reveal: number }) {
  const characters = Array.from(text);
  const visible = Math.round(characters.length * clamp01(reveal));
  // A faixa verde some no fim: com a etapa centralizada o texto fica todo escuro.
  const band = Math.min(visible, Math.round(14 * clamp01((1 - reveal) * 6)));
  const split = visible - band;
  const middle = split + Math.ceil(band / 2);
  return (
    <span aria-label={text}>
      <span aria-hidden="true">{characters.slice(0, split).join('')}</span>
      <span className="home-how-band-a" aria-hidden="true">{characters.slice(split, middle).join('')}</span>
      <span className="home-how-band-b" aria-hidden="true">{characters.slice(middle, visible).join('')}</span>
      <span className="home-how-pending" aria-hidden="true">{characters.slice(visible).join('')}</span>
    </span>
  );
}

function DockCanvas({ progress, reducedMotion }: { progress: number; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<DockSceneController | null>(null);
  const progressRef = useRef(progress);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    progressRef.current = progress;
    controllerRef.current?.setProgress(progress);
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    let resizeObserver: ResizeObserver | null = null;
    let visibility: IntersectionObserver | null = null;
    void (async () => {
      try {
        const { createDockScene } = await import('../three/createDockScene');
        const controller = await createDockScene(canvas, { reducedMotion });
        if (!alive) {
          controller.dispose();
          return;
        }
        controllerRef.current = controller;
        const resize = () => {
          const bounds = canvas.getBoundingClientRect();
          controller.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        visibility = new IntersectionObserver(([entry]) => controller.setActive(entry.isIntersecting));
        visibility.observe(canvas);
        resize();
        controller.setProgress(progressRef.current);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      resizeObserver?.disconnect();
      visibility?.disconnect();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="home-how-canvas" data-failed={failed} aria-hidden="true" />;
}

/** "Como funciona": quatro etapas guiadas pelo scroll, com o caminhão 3D da hero na doca. */
export function HomeHowItWorks({ reducedMotion }: { reducedMotion: boolean }) {
  const { t, i18n } = useTranslation();
  const stepsRef = useRef<HTMLOListElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [reveals, setReveals] = useState<number[]>(() => DOCK_STEPS.map(() => 0));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const items = stepsRef.current?.children;
      if (!items?.length) return;
      // Cada etapa ocupa uma tela; a etapa ativa é a que cruza o centro da viewport.
      const center = window.innerHeight / 2;
      let next = 0;
      // Revelação de cada etapa: começa quando ela entra por baixo e termina
      // quando o bloco chega ao centro da tela (texto já todo escuro).
      const nextReveals = Array.from(items, (item) => {
        // Usa o parágrafo: começa quando ele entra por baixo e fica todo escuro
        // quando o centro dele chega ao centro da tela.
        const text = item.querySelector('p')?.getBoundingClientRect() ?? item.getBoundingClientRect();
        const finishTop = window.innerHeight / 2 - text.height / 2;
        return clamp01((window.innerHeight - text.top) / Math.max(1, window.innerHeight - finishTop));
      });
      setReveals((current) => (current.every((value, index) => Math.abs(value - nextReveals[index]) < 0.004) ? current : nextReveals));
      for (let item = 0; item < items.length; item += 1) {
        const rect = items[item].getBoundingClientRect();
        if (center >= rect.top) next = (item + clamp01((center - rect.top) / Math.max(1, rect.height))) / items.length;
      }
      next = clamp01(next);
      setProgress((current) => (Math.abs(current - next) < 0.001 ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const { step, index, local } = dockStepAt(progress);
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'currency', currency: 'BRL' });
  const rate = money.format(BUSINESS.stayRatePerTonHour);
  const waitLabel = `${Math.floor(DEMO_WAIT_MIN / 60)}h${String(DEMO_WAIT_MIN % 60).padStart(2, '0')}`;
  const stay = money.format(stayValue(DEMO_WAIT_MIN, DEMO_TONS));
  const badge = {
    notify: null,
    arrive: t('home.how.panel.dockConfirmed'),
    talk: t('home.how.panel.connected'),
    prove: local >= DOCK_PROVE_TIMING.arrive
      ? t('home.how.panel.delivered')
      : local >= DOCK_PROVE_TIMING.cut ? null : t('home.how.panel.stayRegistered'),
  }[step];
  const badgeVisible = step !== 'arrive' || local > 0.55;
  const inRoom = step === 'prove' && local >= DOCK_PROVE_TIMING.cut;
  // Clarão do estouro na borda: esconde o corte do pátio para a sala do CCO.
  const flash = step === 'prove'
    ? clamp01(1 - Math.abs(local - (DOCK_PROVE_TIMING.burst + DOCK_PROVE_TIMING.cut) / 2) / 0.03)
    : 0;

  return (
    <section
      id="como-funciona"
      className="home-light home-how"
      aria-labelledby="home-how-title"
    >
      <header className="home-how-intro">
        <p className="home-light-eyebrow">{t('home.how.eyebrow')}</p>
        <h2 id="home-how-title" className="home-light-title">{t('home.how.title')}</h2>
        <p className="home-light-subtitle">{t('home.how.intro')}</p>
      </header>
      <div className="home-how-track">
        <ol className="home-how-steps" ref={stepsRef}>
          {DOCK_STEPS.map((key, stepIndex) => {
            const state = stepIndex < index ? 'done' : stepIndex === index ? 'active' : 'next';
            const body = t(`home.how.steps.${key}.body`, { hours: BUSINESS.franchiseHours, rate });
            const reveal = reducedMotion ? 1 : reveals[stepIndex] ?? 0;
            return (
              <li key={key} data-state={state} data-revealed={reveal > 0.02} aria-current={state === 'active' ? 'step' : undefined}>
                <span className="home-how-number">{String(stepIndex + 1).padStart(2, '0')}</span>
                <h3>{t(`home.how.steps.${key}.title`)}</h3>
                <p><RevealText text={body} reveal={reveal} /></p>
              </li>
            );
          })}
        </ol>
        <div className="home-how-stage">
        <figure className="home-how-panel" aria-label={t('home.how.sceneLabel')}>
          <DockCanvas progress={progress} reducedMotion={reducedMotion} />
          <div className="home-how-overlay" data-room={inRoom}>
            <span className="home-how-flash" aria-hidden="true" style={{ opacity: reducedMotion ? 0 : flash }} />
            {badge && badgeVisible ? <p key={badge} className="home-how-badge">{badge} <span aria-hidden="true">✓</span></p> : null}
            {step === 'notify' ? (
              <>
                <p className="home-how-tag home-how-tag-plate">{t('home.how.panel.plate', { tons: DEMO_TONS })}</p>
                <p className="home-how-tag home-how-tag-lime">{t('home.how.panel.notified')}</p>
              </>
            ) : null}
            {step === 'arrive' ? (
              <>
                {local > 0.55 ? <p className="home-how-tag home-how-tag-arrival">{t('home.how.panel.arrival')}</p> : null}
                <p className="home-how-tag home-how-tag-lime">GHJ7K89</p>
              </>
            ) : null}
            {step === 'talk' ? (
              <>
                <p className="home-how-tag home-how-tag-lime home-how-tag-said">{t('home.how.panel.said')}</p>
                <p className="home-how-tag">{t('home.how.panel.voice')}</p>
              </>
            ) : null}
            {step === 'prove' && !inRoom ? (
              <>
                <div className="home-how-stay">
                  <p>{t('home.how.panel.wait', { time: waitLabel })}</p>
                  <p>{t('home.how.panel.stay', { value: stay })}</p>
                </div>
                {local >= DOCK_PROVE_TIMING.ringEnd ? <p className="home-how-tag home-how-tag-lime">{t('home.how.panel.receipt')}</p> : null}
                {local >= DOCK_PROVE_TIMING.flightStart ? <p className="home-how-tag">{t('home.how.panel.sending')}</p> : null}
              </>
            ) : null}
            {inRoom ? (
              <>
                <p className="home-how-room">{t('home.how.panel.ccoRoom')}</p>
                {local >= DOCK_PROVE_TIMING.arrive
                  ? <p className="home-how-tag home-how-tag-lime">{t('home.how.panel.received', { value: stay })}</p>
                  : <p className="home-how-tag">{t('home.how.panel.incoming')}</p>}
              </>
            ) : null}
            <p className="home-how-note">{t('home.how.demoNote')}</p>
          </div>
        </figure>
        </div>
      </div>
      <section className="home-how-plugin" aria-labelledby="home-how-plugin-title">
        <div className="home-how-plugin-copy">
          <p className="home-light-eyebrow home-align-left">{t('home.how.plugin.eyebrow')}</p>
          <h3 id="home-how-plugin-title">{t('home.how.plugin.title')}</h3>
          <p>{t('home.how.plugin.body')}</p>
        </div>
        <ul className="home-how-plugin-list">
          {(t('home.how.plugin.items', { returnObjects: true }) as { title: string; body: string }[]).map((item) => (
            <li key={item.title}>
              <span className="home-how-plugin-socket" aria-hidden="true" />
              <h4>{item.title}</h4>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
