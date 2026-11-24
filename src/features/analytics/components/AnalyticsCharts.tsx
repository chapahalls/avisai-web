import { useTranslation } from 'react-i18next';
import type { CallLog, Delivery } from '../../../types/ops';
import { agentDailySeries, occurrenceCounts, requestFunnel, type OccurrenceRow, type Period } from '../model';

/** Funil dos avisos, série diária Agente × CCO e ocorrências por tipo. */
export function AnalyticsCharts({ deliveries, calls, occurrences, today, period, apiMode }: {
  deliveries: Delivery[];
  calls: CallLog[];
  occurrences: OccurrenceRow[];
  today: number;
  period: Period;
  apiMode: boolean;
}) {
  const { t, i18n } = useTranslation();
  const percent = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const funnel = requestFunnel(deliveries, calls);
  const series = agentDailySeries(deliveries, calls, today, period);
  const max = Math.max(1, ...series.map((point) => Math.max(point.calls, point.escalations)));
  const types = occurrenceCounts(occurrences);
  const maxType = Math.max(1, ...types.map((type) => type.count));
  const dayLabel = (offset: number) => offset === 0 ? t('analytics.daily.today') : t('analytics.daily.day', { offset });
  const typeLabel = (key: string) => key.startsWith('backendAlert:')
    ? t(`alerts.types.${key.slice('backendAlert:'.length)}`, { defaultValue: key.slice('backendAlert:'.length) })
    : t(`analytics.occurrenceKinds.${key}`);

  return (
    <div className="anl-charts">
      <section className="anl-card" aria-labelledby="anl-funnel-title">
        <h2 id="anl-funnel-title">{t('analytics.funnel.title')}</h2>
        <p>{t('analytics.funnel.subtitle', { period: t(`analytics.filters.periods.${period}`) })}</p>
        {apiMode || !deliveries.length ? <p className="anl-empty">{t(apiMode ? 'analytics.funnel.apiEmpty' : 'analytics.funnel.empty')}</p> : (
          <ol className="anl-funnel">
            {funnel.map((step) => (
              <li key={step.key} data-step={step.key}>
                <span>{t(`analytics.funnel.steps.${step.key}`)}</span>
                <strong>{step.value} · {percent(step.share)}</strong>
                <i aria-hidden="true"><b style={{ width: `${step.share * 100}%` }} /></i>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="anl-card" aria-labelledby="anl-daily-title">
        <h2 id="anl-daily-title">{t('analytics.daily.title')}</h2>
        <p>{t('analytics.daily.subtitle')}</p>
        {apiMode ? <p className="anl-empty">{t('analytics.daily.empty')}</p> : (
          <>
            <ul className="anl-legend">
              <li><i data-series="calls" aria-hidden="true" />{t('analytics.daily.calls')}</li>
              <li><i data-series="escalations" aria-hidden="true" />{t('analytics.daily.escalations')}</li>
            </ul>
            <ol className="anl-bars">
              {series.map((point) => (
                <li key={point.day} aria-label={t('analytics.daily.point', { day: dayLabel(point.offset), calls: point.calls, escalations: point.escalations })}>
                  <div aria-hidden="true">
                    <b data-series="calls" style={{ height: `${(point.calls / max) * 100}%` }}><em>{point.calls}</em></b>
                    <b data-series="escalations" style={{ height: `${(point.escalations / max) * 100}%` }}><em>{point.escalations}</em></b>
                  </div>
                  <span aria-hidden="true">{dayLabel(point.offset)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="anl-card" aria-labelledby="anl-types-title">
        <h2 id="anl-types-title">{t('analytics.types.title')}</h2>
        {!types.length ? <p className="anl-empty">{t('analytics.types.empty')}</p> : (
          <ul className="anl-types">
            {types.map((type) => (
              <li key={type.key} data-kind={type.key.split(':')[0]}>
                <span>{typeLabel(type.key)}</span>
                <i aria-hidden="true"><b style={{ width: `${(type.count / maxType) * 100}%` }} /></i>
                <strong>{type.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
