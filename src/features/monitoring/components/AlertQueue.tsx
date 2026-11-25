import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { APP_ROUTES } from '../../../lib/routes';
import { receiverById, useConnection, useOps } from '../../../services/operations';
import { hhmm } from '../../../utils/format';
import { deriveAlerts } from '../model';

/** Fila de alertas por severidade; "Assumir" reconhece a Task (Demo ou API). */
export function AlertQueue({ selectedTripId, onSelect }: { selectedTripId: string | null; onSelect: (tripId: string) => void }) {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const { trips, tasks, simMinutes, acknowledge, tripMeta } = useOps();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const alerts = deriveAlerts({ trips, tasks, simMinutes });
  const critical = alerts.filter((alert) => alert.severity === 'critical').length;

  return (
    <section className="mon-panel mon-alerts" aria-labelledby="mon-alerts-title">
      <header className="mon-panel-heading">
        <div><h2 id="mon-alerts-title">{t('monitoring.alerts.title')}</h2><p>{t('monitoring.alerts.subtitle')}</p></div>
        {critical > 0 && <span className="mon-pill" data-tone="alert">{t('monitoring.alerts.count', { count: critical })}</span>}
      </header>
      {connection.actionError && <p role="alert" className="mon-error">{t('api.actions.failed')} {connection.actionError}</p>}
      <ol className="mon-alert-list">
        {!alerts.length && <li className="mon-empty">{t(isApi && connection.status === 'connecting' ? 'api.connection.loading' : 'monitoring.alerts.empty')}</li>}
        {alerts.map((alert) => {
          const trip = trips.find((item) => item.id === alert.tripId);
          const meta = tripMeta[alert.tripId];
          const plate = trip?.plate ?? meta?.plate ?? t('common.unavailable');
          const receiverId = trip?.receiverId ?? meta?.receiverId;
          const receiver = receiverId ? receiverById(receiverId).name : '';
          const pending = alert.taskId ? connection.pendingTaskIds.includes(alert.taskId) : false;
          const values = {
            receiver,
            attempts: alert.attempts ?? 0,
            max: BUSINESS.maxCcoAttempts,
            hours: BUSINESS.franchiseHours,
            wait: alert.waitMin === undefined ? '' : hhmm(alert.waitMin, locale),
            minutes: Math.round(alert.staleMin ?? 0),
          };
          return (
            <li key={alert.id} data-severity={alert.severity} data-selected={selectedTripId === alert.tripId}>
              <div className="mon-alert-top">
                <span className="mon-severity" data-severity={alert.severity}>{t(`monitoring.alerts.severity.${alert.severity}`)}</span>
                <button type="button" className="mon-plate" onClick={() => onSelect(alert.tripId)} aria-label={`${t('monitoring.alerts.select')}: ${plate}`}>{plate}</button>
                {alert.sinceMin !== null && <span className="mon-since">{t('monitoring.alerts.since', { time: hhmm(alert.sinceMin, locale) })}</span>}
              </div>
              <h3>{t(`monitoring.alerts.kinds.${alert.kind}.title`, values)}</h3>
              <p>{t(`monitoring.alerts.kinds.${alert.kind}.body`, values)}</p>
              <div className="mon-alert-actions">
                {alert.taskId && (
                  <button type="button" className="mon-button" data-variant="primary" data-tour-target={selectedTripId === alert.tripId ? 'dashboard-task-action' : undefined} disabled={pending || isApi && connection.status !== 'connected'} aria-busy={pending} onClick={() => void acknowledge(alert.taskId!)}>
                    {t(pending ? 'monitoring.alerts.taking' : 'monitoring.alerts.take')}
                  </button>
                )}
                <Link className="mon-button" to={APP_ROUTES.trip(alert.tripId)}>{t('monitoring.alerts.open')}</Link>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
