import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import { BUSINESS } from '../../../lib/config';
import { APP_ROUTES } from '../../../lib/routes';
import { receiverById, useConnection, useOps } from '../../../services/operations';
import { hhmm } from '../../../utils/format';
import { deriveAlerts } from '../model';

/** Fila de alertas por severidade; "Assumir" reconhece a Task (Demo ou API). */
export function AlertQueue({ expanded, onToggle, selectedTripId, onSelect, onlyTripId }: { expanded: boolean; onToggle: () => void; selectedTripId: string | null; onSelect: (tripId: string) => void; onlyTripId?: string }) {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const { trips: allTrips, tasks: allTasks, simMinutes, acknowledge, tripMeta } = useOps();
  const trips = onlyTripId ? allTrips.filter((trip) => trip.id === onlyTripId) : allTrips;
  const tasks = onlyTripId ? allTasks.filter((task) => task.tripId === onlyTripId) : allTasks;
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const alerts = deriveAlerts({ trips, tasks, simMinutes });
  const critical = alerts.filter((alert) => alert.severity === 'critical').length;

  return (
    <section className="mon-panel mon-alerts" data-expanded={expanded} aria-labelledby="mon-alerts-title">
      <header className="mon-panel-heading">
        <div><h2 id="mon-alerts-title">{t('monitoring.alerts.title')}</h2><p>{t('monitoring.alerts.subtitle')}</p></div>
        <div className="mon-panel-heading-actions">
          {expanded && critical > 0 && <span className="mon-pill" data-tone="alert">{t('monitoring.alerts.count', { count: critical })}</span>}
          <button type="button" className="mon-panel-toggle mon-alert-toggle" aria-expanded={expanded} aria-controls="mon-alert-content" aria-label={t(expanded ? 'monitoring.alerts.collapse' : 'monitoring.alerts.expand')} onClick={onToggle}>
            <Icon name="chevron" className={`h-3.5 w-3.5${expanded ? ' is-expanded' : ' is-collapsed'}`} />
          </button>
        </div>
      </header>
      <div id="mon-alert-content" className="mon-alert-content" hidden={!expanded}>
        {connection.actionError && <p role="alert" className="mon-error">{t('api.actions.failed')} {connection.actionError}</p>}
        <ol className="mon-alert-list" data-has-selection={Boolean(selectedTripId)}>
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
            const selected = selectedTripId === alert.tripId;
            return (
              <li key={alert.id} data-severity={alert.severity} data-selected={selected}>
                <button type="button" className="mon-alert-select" aria-pressed={selected} onClick={() => onSelect(alert.tripId)}>
                  <span className="mon-alert-top">
                    <span className="mon-severity" data-severity={alert.severity}>{t(`monitoring.alerts.severity.${alert.severity}`)}</span>
                    <span className="mon-plate">{plate}</span>
                    {alert.sinceMin !== null && <span className="mon-since">{t('monitoring.alerts.since', { time: hhmm(alert.sinceMin, locale) })}</span>}
                  </span>
                  <span className="mon-alert-title">{t(`monitoring.alerts.kinds.${alert.kind}.title`, values)}</span>
                  <span className="mon-alert-description">{t(`monitoring.alerts.kinds.${alert.kind}.body`, values)}</span>
                  {selected && <span className="mon-focus-badge">{t('monitoring.selection.focus')}</span>}
                </button>
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
      </div>
    </section>
  );
}
