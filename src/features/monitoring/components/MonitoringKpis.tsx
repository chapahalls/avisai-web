import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { useOps } from '../../../services/operations';
import { countOperation, deriveAlerts } from '../model';

/** Indicadores operacionais principais do monitoramento. */
export function MonitoringKpis() {
  const { t, i18n } = useTranslation();
  const trips = useOps((state) => state.trips);
  const tasks = useOps((state) => state.tasks);
  const simMinutes = useOps((state) => state.simMinutes);
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const counts = countOperation(trips, simMinutes);
  const alerts = deriveAlerts({ trips, tasks, simMinutes });
  const critical = alerts.filter((alert) => alert.severity === 'critical').length;
  const hours = BUSINESS.franchiseHours;
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

  const items = [
    { key: 'active', value: number(counts.active), hint: t('monitoring.kpis.activeHint', { onRoute: counts.onRoute, atReceiver: counts.atReceiver }), tone: 'default' },
    { key: 'onRoute', value: number(counts.onRoute), hint: t('monitoring.kpis.onRouteHint', { approaching: counts.approaching }), tone: 'ok' },
    { key: 'atReceiver', value: number(counts.atReceiver), hint: t('monitoring.kpis.atReceiverHint', { over: counts.overFranchise, hours }), tone: 'wait' },
    { key: 'alerts', value: number(alerts.length), hint: t('monitoring.kpis.alertsHint', { critical }), tone: alerts.length ? 'alert' : 'default' },
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
