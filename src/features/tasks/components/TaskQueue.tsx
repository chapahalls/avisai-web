import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { receiverById, useConnection, useOps } from '../../../services/operations';
import { hhmm } from '../../../utils/format';
import { brl } from '../../../utils/format';
import { Badge } from '../../../components/Badge';
import { APP_ROUTES } from '../../../lib/routes';

const order = { escalated: 0, open: 1, acknowledged: 2, closed: 3 } as const;
const tone = { escalated: 'alert', open: 'wait', acknowledged: 'ok', closed: 'brand' } as const;

/** Fila de Tasks: chegada sem dono sobe de prioridade a cada tentativa (R4). */
export function TaskQueue() {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const { tasks, trips, simMinutes, acknowledge, tripMeta } = useOps();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const rows = tasks.filter((task) => task.status !== 'closed').sort((a, b) => order[a.status] - order[b.status] || a.createdAtMin - b.createdAtMin);
  return (
    <div className="rounded-card border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{t('tasks.title')}</h2>
        <span className="rounded-full bg-ink-800 px-2.5 py-1 text-xs text-ink-300">{t('tasks.count', { n: rows.length })}</span>
      </div>
      {connection.actionError && <p role="alert" className="border-b border-alert-500/25 bg-alert-500/5 px-5 py-3 text-sm text-alert-500">{t('api.actions.failed')} {connection.actionError}</p>}
      <ul className="max-h-[580px] divide-y divide-ink-700 overflow-auto">
        {rows.length === 0 && <li className="px-5 py-12 text-center text-sm text-ink-300">{t(isApi && connection.status === 'connecting' ? 'api.connection.loading' : 'tasks.empty')}</li>}
        {rows.map((task) => {
          const trip = trips.find((x) => x.id === task.tripId);
          const waited = isApi ? trip?.stay?.waitMin : (trip?.unloadedAtMin ?? simMinutes) - task.createdAtMin;
          const stay = isApi ? trip?.stay?.valueBRL : undefined;
          const pending = connection.pendingTaskIds.includes(task.id);
          const disabled = pending || isApi && connection.status !== 'connected';
          const meta = tripMeta[task.tripId];
          return (
            <li key={task.id} className={`px-5 py-4 ${task.status === 'escalated' ? 'bg-alert-500/5' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link to={APP_ROUTES.trip(task.tripId)} className="font-display text-base font-semibold hover:text-brand-500">{trip?.plate ?? meta?.plate ?? t('common.unavailable')}</Link>
                  <Badge tone={tone[task.status]} label={t(`tasks.status.${task.status}`)} />
                </div>
                <p className="mt-2 text-sm text-ink-300">
                  {trip ? receiverById(trip.receiverId).name : meta ? receiverById(meta.receiverId).name : ''}
                </p>
                <p className="mt-1 text-sm text-ink-300">{waited === undefined ? t('api.tasks.waitingUnavailable') : t('tasks.waiting', { time: hhmm(waited, locale) })}{stay !== undefined ? ` · ${brl(stay, locale)}` : ''}</p>
                <div className="mt-3 flex items-center gap-1" aria-label={t(isApi ? 'api.tasks.attempts' : 'tasks.attempts', { n: task.attempts, max: BUSINESS.maxCcoAttempts })}>
                  {!isApi && Array.from({ length: BUSINESS.maxCcoAttempts }).map((_, i) => (
                    <span key={i} aria-hidden="true" className={`h-1.5 w-7 rounded-full ${i < task.attempts ? (task.status === 'acknowledged' ? 'bg-ok-500' : task.status === 'escalated' ? 'bg-alert-500' : 'bg-wait-500') : 'bg-ink-700'}`} />
                  ))}
                  <span className="ml-2 text-xs text-ink-300">{t(isApi ? 'api.tasks.attempts' : 'tasks.attempts', { n: task.attempts, max: BUSINESS.maxCcoAttempts })}</span>
                </div>
              </div>
              {(task.status === 'open' || task.status === 'escalated') && (
                <button type="button" onClick={() => void acknowledge(task.id)} disabled={disabled} aria-busy={pending} className="shrink-0 rounded-input bg-brand-500 px-3 py-2 text-sm font-semibold transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-50">
                  {t(pending ? 'api.actions.taking' : 'tasks.take')}
                </button>
              )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
