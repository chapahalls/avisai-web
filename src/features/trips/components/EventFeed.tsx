import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOps } from '../../../services/mock/engine';
import { clock } from '../../../utils/format';

/** Linha do tempo de eventos (o que o agente registrou), mais recente primeiro. */
export function EventFeed({ tripId, limit = 30 }: { tripId?: string; limit?: number }) {
  const { t } = useTranslation();
  const feed = useOps((s) => s.feed);
  const trips = useOps((s) => s.trips);
  const rows = (tripId ? feed.filter((e) => e.tripId === tripId) : feed).slice(0, limit);
  return (
    <div className="rounded-card border border-ink-700 bg-ink-900">
      <h3 className="border-b border-ink-700 px-4 py-3 text-sm font-semibold">{t('feed.title')}</h3>
      <ol className="max-h-[420px] overflow-auto px-4 py-2">
        {rows.length === 0 && <li className="py-4 text-center text-sm text-ink-300">{t('feed.empty')}</li>}
        {rows.map((e) => (
          <li key={e.id} className="flex gap-3 border-l border-ink-700 py-2 pl-3">
            <span className="w-12 shrink-0 font-display text-xs text-ink-300">{clock(e.simMin)}</span>
            <div className="min-w-0">
              <p className="text-sm">{t(`events.${e.type}`)}</p>
              <p className="truncate text-xs text-ink-300">
                {!tripId && <Link to={`/trips/${e.tripId}`} className="hover:text-brand-500">{trips.find((x) => x.id === e.tripId)?.plate ?? e.tripId} · </Link>}
                {t(`sources.${e.source}`)}
                {typeof e.payload.result === 'string' ? ` · ${e.payload.result}` : ''}
                {typeof e.payload.channel === 'string' ? ` · ${e.payload.channel}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
