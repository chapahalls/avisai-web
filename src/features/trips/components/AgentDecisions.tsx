import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOps } from '../../../services/operations';
import { APP_ROUTES } from '../../../lib/routes';

type Decision = {
  percebeu: string;
  decidiu: string;
  executou: string;
  resultado: string;
  prioridade: 'info' | 'atencao' | 'critico';
};

function isDecision(value: unknown): value is Decision {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['percebeu', 'decidiu', 'executou', 'resultado'].every((key) => typeof candidate[key] === 'string')
    && ['info', 'atencao', 'critico'].includes(String(candidate.prioridade));
}

const priorityClass = {
  info: 'border-brand-500/35',
  atencao: 'border-wait-500/45',
  critico: 'border-alert-500/50',
} as const;

export function AgentDecisions({ tripId, limit = 16 }: { tripId?: string; limit?: number }) {
  const { t } = useTranslation();
  const feed = useOps((state) => state.feed);
  const rows = feed
    .filter((event) => (!tripId || event.tripId === tripId) && event.payload.backendType === 'decisao_agente' && isDecision(event.payload.decisao))
    .slice(0, limit);
  return (
    <section className="overflow-hidden rounded-card border border-ink-700 bg-ink-900">
      <header className="flex items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{t('decisions.title')}</h2>
        <span className="text-xs text-ink-300">{t('decisions.recent')}</span>
      </header>
      <ol className="max-h-[440px] space-y-3 overflow-auto p-4">
        {rows.length === 0 && <li className="py-8 text-center text-sm text-ink-300">{t('decisions.empty')}</li>}
        {rows.map((event) => {
          const decision = event.payload.decisao as Decision;
          return (
            <li key={event.id} className={`rounded-input border border-l-4 bg-ink-950/35 p-3 ${priorityClass[decision.prioridade]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-300">{t(`alerts.priority.${decision.prioridade}`)}</span>
                {event.tripId && <Link to={APP_ROUTES.trip(event.tripId)} className="text-xs text-brand-500 hover:underline">{t('decisions.trip')}</Link>}
              </div>
              <dl className="mt-3 grid gap-2 text-xs">
                <div><dt className="font-semibold text-ink-300">{t('decisions.perceived')}</dt><dd className="mt-0.5 text-ink-100">{decision.percebeu}</dd></div>
                <div><dt className="font-semibold text-ink-300">{t('decisions.decided')}</dt><dd className="mt-0.5 text-ink-100">{decision.decidiu}</dd></div>
                <div><dt className="font-semibold text-ink-300">{t('decisions.executed')}</dt><dd className="mt-0.5 text-ink-100">{decision.executou}</dd></div>
                <div><dt className="font-semibold text-ink-300">{t('decisions.result')}</dt><dd className="mt-0.5 text-ink-100">{decision.resultado}</dd></div>
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
