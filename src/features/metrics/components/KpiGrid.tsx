import { useTranslation } from 'react-i18next';
import { brl, hhmm, pct } from '../../../utils/format';
import { useMetrics } from '../hooks/useMetrics';
import { KpiCard } from './KpiCard';
import { AnalyticsStatus } from '../../../components/AnalyticsStatus';

export function KpiGrid() {
  const { t, i18n } = useTranslation();
  const result = useMetrics();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const decimal = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (result.source === 'api') {
    const m = result.data;
    const value = (number: number | null | undefined, format: (number: number) => string = decimal) =>
      number === null || number === undefined ? '—' : format(number);
    const percentage = (number: number) => pct(number / 100, locale);
    const seconds = (number: number) => t('units.seconds', { value: decimal(number / 1000) });
    return (
      <div className="space-y-4">
        <AnalyticsStatus loading={result.loading} error={result.error} updatedAt={result.updatedAt} hasData={m !== null} retry={result.retry} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard label={t('kpi.stopped')} value={value(m?.horas_paradas_media, (hours) => hhmm(hours * 60, locale))} hint={t('backendMetrics.completed')} tone="wait" />
          <KpiCard label={t('kpi.stay')} value={value(m?.estadia_devida_total, (amount) => brl(amount, locale))} hint={t('backendMetrics.allStays')} />
          <KpiCard label={t('kpi.notified')} value={value(m?.pct_recebedores_avisados, percentage)} hint={t('backendMetrics.beforeArrival')} tone="ok" />
          <KpiCard label={t('kpi.ccoAction')} value={value(m?.tempo_ate_acao_cco_min_media, (minutes) => t('units.minutes', { value: decimal(minutes) }))} hint={t('backendMetrics.confirmedTasks')} />
          <KpiCard label={t('backendMetrics.latency')} value={value(m?.latencia_voz_ms.p50, seconds)} hint={t('backendMetrics.latencyHint', { p95: value(m?.latencia_voz_ms.p95, seconds), count: value(m?.latencia_voz_ms.amostras) })} />
          <KpiCard label={t('kpi.answered')} value={value(m?.pct_ligacoes_atendidas, percentage)} hint={t('backendMetrics.validCalls')} />
          <KpiCard label={t('kpi.completeFirst')} value={value(m?.pct_reportes_completos_1a, percentage)} hint={t('backendMetrics.firstReport')} />
          <KpiCard label={t('backendMetrics.escalated')} value={value(m?.tasks_escaladas)} hint={t('backendMetrics.escalationEvents')} tone={m?.tasks_escaladas ? 'alert' : 'default'} />
          <KpiCard label={t('backendMetrics.resolved')} value={value(m?.contatos_resolvidos_pelo_agente)} hint={t('backendMetrics.resolvedHint')} />
          <KpiCard label={t('kpi.deliveries')} value={value(m?.entregas)} hint={t('backendMetrics.completed')} />
        </div>
        <p className="text-xs text-ink-300">{t('backendMetrics.noSamples')}</p>
      </div>
    );
  }
  const m = result.data;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard label={t('kpi.stopped')} value={hhmm(m.avgStoppedMin, locale)} hint={t('kpi.stoppedHint', { n: m.deliveries })} tone="wait" />
      <KpiCard label={t('kpi.stay')} value={brl(m.stayDue, locale)} hint={t('kpi.stayHint', { charged: brl(m.stayCharged, locale) })} />
      <KpiCard label={t('kpi.notified')} value={pct(m.notifiedRate, locale)} hint={t('kpi.notifiedHint')} tone="ok" />
      <KpiCard label={t('kpi.ccoAction')} value={t('units.minutes', { value: Math.round(m.avgCcoActionMin) })} hint={t('kpi.ccoActionHint', { n: m.escalatedOpen })} tone={m.escalatedOpen ? 'alert' : 'default'} />
      <KpiCard label={t('kpi.latency')} value={t('units.seconds', { value: decimal(m.latencyP50 / 1000) })} hint={t('kpi.latencyHint', { p95: decimal(m.latencyP95 / 1000) })} />
      <KpiCard label={t('kpi.answered')} value={pct(m.callAnsweredRate, locale)} hint={t('kpi.answeredHint')} />
      <KpiCard label={t('kpi.completeFirst')} value={pct(m.completeFirstRate, locale)} hint={t('kpi.completeFirstHint')} />
      <KpiCard label={t('kpi.escalated')} value={m.escalatedOpen.toLocaleString(locale)} hint={t('kpi.escalatedHint', { n: m.escalatedTotal })} tone={m.escalatedOpen ? 'alert' : 'default'} />
      <KpiCard label={t('kpi.contactsAvoided')} value={m.contactsAvoided.toLocaleString(locale)} hint={t('kpi.contactsAvoidedHint')} />
      <KpiCard label={t('kpi.deliveries')} value={m.deliveries.toLocaleString(locale)} hint={t('kpi.deliveriesHint')} />
    </div>
  );
}
