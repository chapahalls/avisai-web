import { useTranslation } from 'react-i18next';
import { RodarMark } from '../../../components/RodarLogo';
import { type LoaderPhase } from '../model';
import './home.css';

/**
 * Abertura minimalista: o progresso é real, mas a cena mostra exclusivamente
 * o símbolo RODAR, com revelação pelo traço e brilho discreto.
 */
export function HomeLoader({ progress, phase }: { progress: number; phase: LoaderPhase }) {
  const { t } = useTranslation();
  if (phase === 'done') return null;
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: progressbar é status somente leitura, sem interação; não entra na ordem de tabulação (WAI-ARIA).
    <div
      className="home-loader"
      data-phase={phase}
      role="progressbar"
      aria-label={t('home.loader.label')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={`${progress}%`}
    >
      <span className="home-loader-halo" aria-hidden="true" />
      <RodarMark className="home-loader-mark" />
    </div>
  );
}
