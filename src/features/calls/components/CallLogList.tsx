import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { receiverById, useConnection, useOps } from '../../../services/operations';
import { clock } from '../../../utils/format';
import { Badge } from '../../../components/Badge';
import { Icon } from '../../../components/Icon';
import { APP_ROUTES } from '../../../lib/routes';

export function CallLogList({ tripId }: { tripId?: string }) {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const calls = useOps((s) => s.calls);
  const rows = tripId ? calls.filter((call) => call.tripId === tripId) : calls;
  if (!rows.length) return <p className="rounded-card border border-ink-700 bg-ink-900 p-8 text-center text-sm text-ink-300">{t(isApi && connection.status === 'connecting' ? 'api.connection.loading' : 'calls.empty')}</p>;
  return (
    <div className="space-y-4">
      {rows.map((call) => {
        const capturedAt = call.occurredAt ? new Date(call.occurredAt) : undefined;
        const time = isApi
          ? capturedAt && !Number.isNaN(capturedAt.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(capturedAt) : t('common.unavailable')
          : clock(call.atMin);
        const resultLabel = t(`${isApi ? 'api.calls.results' : 'calls.results'}.${call.resultCode}`, { dock: call.dock, defaultValue: call.status ?? call.result });
        return (
        <article key={call.id} className="overflow-hidden rounded-card border border-ink-700 bg-ink-900">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-brand-500/10 text-brand-500"><Icon name="calls" className="h-4 w-4" /></span>
              <div>
                <h2 className="text-sm font-semibold">{receiverById(call.receiverId).name}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-300">
                  <time className="font-display" dateTime={call.occurredAt}>{time}</time>
                  <span aria-hidden="true">·</span>
                  <Link to={APP_ROUTES.trip(call.tripId)} className="font-display text-brand-500 hover:underline">{call.plate}</Link>
                  <span aria-hidden="true">·</span>
                  <span>{t(isApi ? `api.calls.moment.${call.moment}` : `calls.moment.${call.moment}`)}</span>
                </p>
              </div>
            </div>
            <Badge tone={call.resultCode === 'no_answer' || call.resultCode === 'failed' ? 'alert' : call.resultCode === 'next_day' || call.resultCode === 'in_progress' ? 'wait' : 'ok'} label={resultLabel} />
          </header>
          <div className="space-y-3 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-300">{t(isApi ? 'api.calls.transcriptTitle' : 'calls.transcriptTitle')}</p>
            {isApi && call.result && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-300">{call.result}</p>}
            {isApi && call.status && <p className="text-xs text-ink-300">{t('api.calls.statusLabel')} {t(`api.calls.status.${call.status}`, { defaultValue: call.status })}</p>}
            <ul className="space-y-3">
              {call.transcript.map((line, index) => (
                <li key={`${call.id}-${index}`} className={`max-w-[95%] rounded-card p-3.5 text-sm leading-relaxed ${line.who === 'agent' ? 'bg-ink-800' : 'ml-auto border border-brand-500/20 bg-brand-500/10'}`}>
                  <p className={`mb-1 text-xs font-semibold ${line.who === 'agent' ? 'text-brand-500' : 'text-wait-500'}`}>{t(`calls.who.${line.who}`)}</p>
                  <p className="whitespace-pre-wrap break-words">{isApi || !line.messageKey ? line.text : t(line.messageKey, line.values ?? {})}</p>
                </li>
              ))}
            </ul>
            {isApi && call.transcript.length === 0 && <p className="text-xs text-ink-300">{t('api.calls.noTranscript')}</p>}
            {call.resultCode === 'no_answer' && <p className="text-xs text-ink-300">{t('calls.noReply')}</p>}
          </div>
        </article>
        );
      })}
    </div>
  );
}
