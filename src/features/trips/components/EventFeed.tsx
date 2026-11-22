import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConnection, useOps } from '../../../services/operations';
import { clock } from '../../../utils/format';

export function EventFeed({ tripId, limit = 30 }: { tripId?: string; limit?: number }) {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const feed = useOps((s) => s.feed);
  const tripMeta = useOps((s) => s.tripMeta);
  const rows = (tripId ? feed.filter((event) => event.tripId === tripId) : feed).slice(0, limit);
  return (
    <section className="overflow-hidden rounded-card border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{t('feed.title')}</h2>
        <span className="text-xs text-ink-300">{t('feed.recent')}</span>
      </div>
      <ol className="max-h-[440px] overflow-auto px-5 py-2">
        {rows.length === 0 && <li className="py-10 text-center text-sm text-ink-300">{t(isApi && connection.status === 'connecting' ? 'api.connection.loading' : 'feed.empty')}</li>}
        {rows.map((event) => {
          const knownPlate = tripMeta[event.tripId]?.plate ?? (typeof event.payload.plate === 'string' ? event.payload.plate : '');
          const plate = knownPlate.trim() ? knownPlate : t('common.unavailable');
          const result = typeof event.payload.resultCode === 'string' ? t(`${isApi ? 'api.calls.results' : 'calls.results'}.${event.payload.resultCode}`, { dock: event.payload.dock, defaultValue: event.payload.resultCode }) : null;
          const channel = typeof event.payload.channel === 'string' ? t(`channels.${event.payload.channel}`, { defaultValue: event.payload.channel }) : null;
          const backendType = typeof event.payload.backendType === 'string' ? event.payload.backendType : null;
          const title = isApi && backendType ? t(`api.events.${backendType}`, { defaultValue: backendType }) : t(`events.${event.type}`);
          const message = isApi
            ? typeof event.payload.backendMessage === 'string' ? event.payload.backendMessage : null
            : typeof event.payload.messageKey === 'string' ? t(event.payload.messageKey) : null;
          const capturedAt = new Date(event.occurredAt);
          const time = isApi
            ? Number.isNaN(capturedAt.getTime()) ? t('common.unavailable') : new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(capturedAt)
            : clock(event.simMin);
          return (
            <li key={event.id} className="flex gap-4 border-b border-ink-700/50 py-3.5 last:border-0">
              <time className={`${isApi ? 'w-24 text-xs' : 'w-12 text-sm'} shrink-0 pt-0.5 font-display text-ink-300`} dateTime={event.occurredAt}>{time}</time>
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                {isApi && message && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-300">{message}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-300">
                  {!tripId && event.tripId && <Link to={`/trips/${event.tripId}`} className="font-display text-brand-500 hover:underline">{plate}</Link>}
                  <span>{t(`sources.${event.source}`)}</span>
                  {channel && <span className="rounded bg-ink-800 px-1.5 py-0.5">{channel}</span>}
                  {result && <span>{result}</span>}
                  {!isApi && message && <span>{message}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
