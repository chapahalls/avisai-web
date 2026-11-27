import { useTranslation } from 'react-i18next';
import { SIMULATION_SPEED_OPTIONS } from '../lib/config';
import { useOps } from '../services/operations';
import { Icon } from './Icon';

export function DemoControls() {
  const { t } = useTranslation();
  const running = useOps((s) => s.running);
  const toggle = useOps((s) => s.toggle);
  const speed = useOps((s) => s.speed);
  const setSpeed = useOps((s) => s.setSpeed);
  const responsiveness = useOps((s) => s.operatorResponsiveness);
  const setResponsiveness = useOps((s) => s.setResponsiveness);
  return (
    <section className="space-y-4 rounded-card border border-dashed border-ink-700 bg-ink-950/30 p-4" aria-label={t('demo.title')}>
      <div>
        <h2 className="text-sm font-semibold">{t('demo.title')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-300">{t('demo.hint')}</p>
      </div>
      <button type="button" onClick={toggle} className="flex w-full items-center justify-center gap-2 rounded-input border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm font-medium transition hover:border-brand-500">
        <Icon name={running ? 'pause' : 'play'} className="h-4 w-4" />
        {running ? t('demo.pause') : t('demo.play')}
      </button>
      <div className="text-sm">
        <span className="text-ink-300">{t('demo.speed')}</span>
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={t('demo.speed')}>
          {SIMULATION_SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={speed === option}
              onClick={() => setSpeed(option)}
              className="rounded-input border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs font-medium transition hover:border-brand-500 aria-pressed:border-brand-500 aria-pressed:bg-brand-500 aria-pressed:text-ink-950"
            >
              {t('demo.speedOption', { v: option })}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-sm">
        <span className="flex items-center justify-between gap-2">
          <span className="text-ink-300">{t('demo.operator')}</span>
          <span className="font-display font-semibold">{Math.round(responsiveness * 100)}%</span>
        </span>
        <input aria-label={t('demo.responsiveness', { v: Math.round(responsiveness * 100) })} type="range" min={0} max={1} step={0.05} value={responsiveness} onChange={(e) => setResponsiveness(Number(e.target.value))} className="mt-3 w-full accent-brand-500" />
      </label>
    </section>
  );
}
