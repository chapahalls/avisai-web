import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { useOps } from '../../../services/operations';
import { useMetrics } from '../../metrics';
import { countOperation, deriveAlerts } from '../model';

/** Sete indicadores da faixa superior do monitoramento. */
export function MonitoringKpis() {
  const { t, i18n } = useTranslation();
  const trips = useOps((state) => state.trips);
  const tasks = useOps((state) => state.tasks);
  const simMinutes = useOps((state) => state.simMinutes);
  const metrics = useMetrics();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const counts = countOperation(trips, simMinutes);
  const alerts = deriveAlerts({ trips, tasks, simMinutes });
  const critical = alerts.filter((alert) => alert.severity === 'critical').length;
  const hours = BUSINESS.franchiseHours;
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const orDash = (value: number | null | undefined, format: (value: number) => string) => value === null || value === undefined ? '—' : format(value);
  // Espera, estadia e aviso: API preserva os valores do servidor (nulos viram "—").
  const avgWaitMin = metrics.source === 'api'
    ? metrics.data?.horas_paradas_media === null || metrics.data?.horas_paradas_media === undefined ? null : metrics.data.horas_paradas_media * 60
    : metrics.data.avgStoppedMin;
  const stayDue = metrics.source === 'api' ? metrics.data?.estadia_devida_total : metrics.data.stayDue;
  const notified = metrics.source === 'api'
    ? metrics.data?.pct_recebedores_avisados === null || metrics.data?.pct_recebedores_avisados === undefined ? null : metrics.data.pct_recebedores_avisados / 100
    : metrics.data.notifiedRate;
  const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;

  const items = [
    { key: 'active', value: number(counts.active), hint: t('monitoring.kpis.activeHint', { onRoute: counts.onRoute, atReceiver: counts.atReceiver }), tone: 'default' },
    { key: 'onRoute', value: number(counts.onRoute), hint: t('monitoring.kpis.onRouteHint', { approaching: counts.approaching }), tone: 'ok' },
    { key: 'atReceiver', value: number(counts.atReceiver), hint: t('monitoring.kpis.atReceiverHint', { over: counts.overFranchise, hours }), tone: 'wait' },
    { key: 'alerts', value: number(alerts.length), hint: t('monitoring.kpis.alertsHint', { critical }), tone: alerts.length ? 'alert' : 'default' },
    { key: 'avgWait', value: orDash(avgWaitMin, hhmm), hint: t('monitoring.kpis.avgWaitHint', { hours }), tone: 'default' },
    { key: 'stay', value: orDash(stayDue, money), hint: t('monitoring.kpis.stayHint', { count: counts.overFranchise, hours }), tone: 'wait' },
    { key: 'notified', value: orDash(notified, percent), hint: t('monitoring.kpis.notifiedHint'), tone: 'ok' },
  ] as const;

  return (
    <dl className="mon-kpis" aria-label={t('monitoring.kpis.label')}>
      {items.map((item) => (
        <div key={item.key} data-tone={item.tone}>
          <dt>{t(`monitoring.kpis.${item.key}`)}</dt>
          <dd>{item.value}</dd>
          <span>{item.hint}</span>
        </div>
      ))}
    </dl>
  );
}
