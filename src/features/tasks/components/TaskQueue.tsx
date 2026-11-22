import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { receiverById, useOps } from '../../../services/mock/engine';
import { hhmm } from '../../../utils/format';
import { stayValue } from '../../../utils/stay';
import { brl } from '../../../utils/format';
import { Badge } from '../../../components/Badge';

const order = { escalated: 0, open: 1, acknowledged: 2, closed: 3 } as const;
const tone = { escalated: 'alert', open: 'wait', acknowledged: 'ok', closed: 'brand' } as const;

/** Fila de Tasks: chegada sem dono sobe de prioridade a cada tentativa (R4). */
export function TaskQueue() {
  const { t } = useTranslation();
  const { tasks, trips, simMinutes, acknowledge } = useOps();
  const rows = [...tasks].sort((a, b) => order[a.status] - order[b.status] || a.createdAtMin - b.createdAtMin);
  return (
    <div className="rounded-card border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h3 className="text-sm font-semibold">{t('tasks.title')}</h3>
        <span className="text-xs text-ink-300">{t('tasks.count', { n: tasks.filter((k) => k.status !== 'closed').length })}</span>
      </div>
      <ul className="max-h-[420px] divide-y divide-ink-700 overflow-auto">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-300">{t('tasks.empty')}</li>}
        {rows.map((task) => {
          const trip = trips.find((x) => x.id === task.tripId);
          const waited = simMinutes - task.createdAtMin;
          return (
            <li key={task.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link to={`/trips/${task.tripId}`} className="font-semibold hover:text-brand-500">{trip?.plate ?? '—'}</Link>
                  <Badge tone={tone[task.status]} label={t(`tasks.status.${task.status}`)} />
                </div>
                <p className="truncate text-xs text-ink-300">
                  {trip ? receiverById(trip.receiverId).name : ''} · {t('tasks.waiting', { time: hhmm(waited) })}
                  {trip && waited > BUSINESS.franchiseHours * 60 ? ` · ${brl(stayValue(waited, trip.capacityTons))}` : ''}
                </p>
                <div className="mt-1 flex gap-1" aria-label={t('tasks.attempts', { n: task.attempts, max: BUSINESS.maxCcoAttempts })}>
                  {Array.from({ length: BUSINESS.maxCcoAttempts }).map((_, i) => (
                    <span key={i} className={`h-1.5 w-8 rounded-full ${i < task.attempts ? (task.status === 'acknowledged' ? 'bg-ok-500' : 'bg-alert-500') : 'bg-ink-700'}`} />
                  ))}
                  <span className="ml-2 text-xs text-ink-300">{task.attempts}/{BUSINESS.maxCcoAttempts}</span>
                </div>
              </div>
              {task.status === 'open' && (
                <button onClick={() => acknowledge(task.id)} className="rounded-input bg-brand-500 px-3 py-1.5 text-sm font-semibold hover:bg-brand-600">
                  {t('tasks.take')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
