import { useTranslation } from 'react-i18next';
import { brl, hhmm, pct } from '../../../utils/format';
import { useMetrics } from '../hooks/useMetrics';
import { KpiCard } from './KpiCard';

export function KpiGrid() {
  const { t } = useTranslation();
  const m = useMetrics();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiCard label={t('kpi.stopped')} value={hhmm(m.avgStoppedMin)} hint={t('kpi.stoppedHint', { n: m.deliveries })} tone="wait" />
      <KpiCard label={t('kpi.stay')} value={brl(m.stayDue)} hint={t('kpi.stayHint', { charged: brl(m.stayCharged) })} />
      <KpiCard label={t('kpi.notified')} value={pct(m.notifiedRate)} hint={t('kpi.notifiedHint')} tone="ok" />
      <KpiCard label={t('kpi.ccoAction')} value={`${Math.round(m.avgCcoActionMin)} min`} hint={t('kpi.ccoActionHint', { n: m.escalatedOpen })} tone={m.escalatedOpen ? 'alert' : 'default'} />
      <KpiCard label={t('kpi.latency')} value={`${(m.latencyP50 / 1000).toFixed(1)} s`} hint={t('kpi.latencyHint', { p95: (m.latencyP95 / 1000).toFixed(1) })} />
      <KpiCard label={t('kpi.answered')} value={pct(m.callAnsweredRate)} />
      <KpiCard label={t('kpi.completeFirst')} value={pct(m.completeFirstRate)} />
      <KpiCard label={t('kpi.escalated')} value={String(m.escalatedTotal)} hint={t('kpi.escalatedHint')} />
      <KpiCard label={t('kpi.contactsAvoided')} value={String(m.contactsAvoided)} hint={t('kpi.contactsAvoidedHint')} />
      <KpiCard label={t('kpi.deliveries')} value={String(m.deliveries)} hint={t('kpi.deliveriesHint')} />
    </div>
  );
}
