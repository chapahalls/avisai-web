import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { receiverById, useConnection, useOps } from '../../../services/operations';
import { clock } from '../../../utils/format';
import { describeEvent } from '../eventLabels';
import { eventCategory, type TimelineCategory } from '../model';
import './trips.css';

const FILTERS = ['all', 'stops', 'agent', 'cco', 'receiver'] as const;
type Filter = (typeof FILTERS)[number];
type Item = { key: string; sort: number; time: string; category: TimelineCategory; title: string; body?: string | null; transcript?: { who: string; text: string }[] };

/** Linha do tempo da viagem: eventos e ligações do agente, com filtro por quem agiu. `compact`: coluna lateral do dashboard, com rolagem própria. */
export function TripTimeline({ tripId, compact = false }: { tripId: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const feed = useOps((state) => state.feed);
  const calls = useOps((state) => state.calls);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const timeOf = (event: { occurredAt: string; simMin?: number }) => {
    if (!isApi && event.simMin !== undefined) return clock(event.simMin);
    const date = new Date(event.occurredAt);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  const tripCalls = calls.filter((call) => call.tripId === tripId);
  // A ligação completa (resultado + transcrição) substitui os eventos de aviso/resultado.
  const callEvents = new Set(tripCalls.length ? ['ReceiverNotified', 'ReceiverCallResult'] : []);
  const items: Item[] = [
    ...feed.filter((event) => event.tripId === tripId && !callEvents.has(event.type)).map((event) => {
      const label = describeEvent(event, t, isApi);
      return {
        key: event.id,
        sort: isApi ? new Date(event.occurredAt).getTime() : event.simMin * 60_000,
        time: timeOf(event),
        category: eventCategory(event.type),
        title: label.title,
        body: [label.message, label.result, label.channel].filter(Boolean).join(' · ') || null,
      };
    }),
    ...tripCalls.map((call) => {
      const result = t(`${call.source === 'api' ? 'api.calls.results' : 'calls.results'}.${call.resultCode}`, { dock: call.dock, defaultValue: call.status ?? call.result });
      return {
        key: `call-${call.id}`,
        sort: call.occurredAt ? new Date(call.occurredAt).getTime() : call.atMin * 60_000,
        time: call.occurredAt ? timeOf({ occurredAt: call.occurredAt }) : clock(call.atMin),
        category: 'receiver' as const,
        title: t(`tripView.timeline.callTitle.${call.moment}`),
        body: `${receiverById(call.receiverId).name} · ${result}`,
        transcript: call.transcript.map((line) => ({ who: t(`monitoring.call.who.${line.who}`), text: call.source === 'api' || !line.messageKey ? line.text : t(line.messageKey, line.values ?? {}) })),
      };
    }),
  ].sort((a, b) => b.sort - a.sort);
  const visible = items.filter((item) => filter === 'all' || item.category === filter);

  return (
    <section className="trv-card trv-timeline-card" data-compact={compact || undefined} aria-labelledby="trv-timeline-title">
      <header className="trv-card-heading">
        <h2 id="trv-timeline-title">{t('tripView.timeline.title')}</h2>
        <div className="trv-chips" role="group" aria-label={t('tripView.timeline.title')}>
          {FILTERS.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{t(`tripView.timeline.filters.${item}`)}</button>)}
        </div>
      </header>
      <ol className="trv-timeline">
        {!visible.length && <li className="trv-empty">{t('tripView.timeline.empty')}</li>}
        {visible.map((item) => (
          <li key={item.key} data-category={item.category}>
            <time>{item.time}</time>
            <span className="trv-dot" aria-hidden="true" />
            <div>
              <p className="trv-event-title">{item.title} <span className="trv-tag" data-category={item.category}>{t(`tripView.timeline.categories.${item.category}`)}</span></p>
              {item.body && <p className="trv-event-body">{item.body}</p>}
              {item.transcript && item.transcript.length > 0 && (
                <>
                  <button type="button" className="trv-link" aria-expanded={open === item.key} onClick={() => setOpen(open === item.key ? null : item.key)}>
                    {t(open === item.key ? 'tripView.timeline.hideTranscript' : 'tripView.timeline.transcript')}
                  </button>
                  {open === item.key && <ol className="trv-transcript">{item.transcript.map((line, index) => <li key={index}><strong>{line.who}</strong> · {line.text}</li>)}</ol>}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
