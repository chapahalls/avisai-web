import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCounter, loaderStage, tickDashArray, type LoaderPhase } from '../model';
import './home.css';

const RADIUS = 209;
const TICKS = tickDashArray(RADIUS);

/** Tela de carregamento da home: anel de marcações, contador e etapa; na saída encolhe até o chip da abertura. */
export function HomeLoader({ progress, phase }: { progress: number; phase: LoaderPhase }) {
  const { t } = useTranslation();
  const maskId = `home-loader-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (phase === 'done') return null;
  const stage = loaderStage(progress);
  const stageText = t(`home.loader.stages.${stage}`);
  return (
    <div
      className="home-loader"
      data-phase={phase}
      role="progressbar"
      aria-label={t('home.loader.label')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={`${progress}% · ${stageText}`}
    >
      <div className="home-loader-dial">
        <svg viewBox="0 0 500 500" aria-hidden="true" className="home-loader-svg">
          <defs>
            <mask id={maskId}>
              <circle
                cx="250" cy="250" r={RADIUS} fill="none" stroke="#fff" strokeWidth="26" pathLength={100}
                strokeDasharray="100" strokeDashoffset={100 - progress} className="home-loader-rotate"
              />
            </mask>
          </defs>
          <circle cx="250" cy="250" r="245" className="home-loader-ring" />
          <line x1="250" y1="0" x2="250" y2="12" className="home-loader-notch" />
          <line x1="250" y1="488" x2="250" y2="500" className="home-loader-notch" />
          <circle cx="250" cy="250" r="225" className="home-loader-ring home-loader-ring-inner" />
          <circle cx="250" cy="250" r={RADIUS} strokeDasharray={TICKS} className="home-loader-ticks home-loader-rotate" />
          <circle cx="250" cy="250" r={RADIUS} strokeDasharray={TICKS} mask={`url(#${maskId})`} className="home-loader-ticks home-loader-ticks-on home-loader-rotate" />
          <g className="home-loader-orbit" style={{ transform: `rotate(${progress * 3.6}deg)` }}>
            <circle cx="250" cy="5" r="3.5" className="home-loader-dot" />
          </g>
        </svg>
        <div className="home-loader-text" aria-hidden="true">
          <span>{t('home.loader.brand')}</span>
          <span className="home-loader-counter">[ {formatCounter(progress)} ]</span>
          <span>{stageText}</span>
        </div>
      </div>
      <span className="home-loader-corner home-loader-corner-start" aria-hidden="true">{t('home.loader.origin')}</span>
      <span className="home-loader-corner home-loader-corner-end" aria-hidden="true">{t('home.loader.coordinates')}</span>
    </div>
  );
}
