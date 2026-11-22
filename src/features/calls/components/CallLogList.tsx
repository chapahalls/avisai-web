import { useTranslation } from 'react-i18next';
import { receiverById, useOps } from '../../../services/mock/engine';
import { clock } from '../../../utils/format';
import { Badge } from '../../../components/Badge';

/** Ligações do agente ao recebedor, com a transcrição (prova do outro lado, R6). */
export function CallLogList({ tripId }: { tripId?: string }) {
  const { t } = useTranslation();
  const calls = useOps((s) => s.calls);
  const trips = useOps((s) => s.trips);
  const rows = tripId ? calls.filter((c) => c.tripId === tripId) : calls;
  if (!rows.length) return <p className="rounded-card border border-ink-700 bg-ink-900 p-6 text-center text-sm text-ink-300">{t('calls.empty')}</p>;
  return (
    <div className="space-y-3">
      {rows.map((c) => (
        <article key={c.id} className="rounded-card border border-ink-700 bg-ink-900 p-4">
          <header className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-display text-xs text-ink-300">{clock(c.atMin)}</span>
            <span className="font-semibold">{receiverById(c.receiverId).name}</span>
            <span className="text-xs text-ink-300">· {trips.find((x) => x.id === c.tripId)?.plate ?? ''}</span>
            <Badge tone={c.moment === 'approach' ? 'brand' : 'wait'} label={t(`calls.moment.${c.moment}`)} />
            <Badge tone={c.answered ? 'ok' : 'alert'} label={c.result} />
          </header>
          <ul className="space-y-1 text-sm">
            {c.transcript.map((l, i) => (
              <li key={i}>
                <span className={l.who === 'agent' ? 'text-brand-500' : 'text-wait-500'}>{t(`calls.who.${l.who}`)}:</span> {l.text}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
