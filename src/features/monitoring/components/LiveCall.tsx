import { useTranslation } from 'react-i18next';
import { receiverById, useOps } from '../../../services/operations';
import { clock } from '../../../utils/format';
import { latestCall } from '../model';

/** Última ligação do AI para a viagem selecionada (ao vivo quando em andamento). */
export function LiveCall({ tripId }: { tripId: string | null }) {
  const { t } = useTranslation();
  const calls = useOps((state) => state.calls);
  const call = tripId ? latestCall(calls, tripId) : undefined;
  const live = call?.resultCode === 'in_progress';
  const isApi = call?.source === 'api';

  return (
    <section className="mon-panel mon-call" aria-labelledby="mon-call-title" data-live={live}>
      <header className="mon-call-heading">
        <h2 id="mon-call-title"><span className="mon-live-dot" aria-hidden="true" />{t(live ? 'monitoring.call.live' : 'monitoring.call.last')}</h2>
        {call && <time>{clock(call.atMin)}</time>}
      </header>
      {!call ? <p className="mon-empty">{t('monitoring.call.none')}</p> : (
        <>
          <p className="mon-call-to">{t('monitoring.call.to', { receiver: receiverById(call.receiverId).name, plate: call.plate })}</p>
          {/* biome-ignore lint/suspicious/noArrayIndexKey: barras decorativas fixas (28), sem dado para uma key estável. */}
          <div className="mon-wave" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 7) * 0.09}s` }} />)}</div>
          <ol className="mon-transcript">
            {call.transcript.slice(-4).map((line, index, visible) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: key usa a posição absoluta na transcrição (length - visible.length + index), estável apesar da janela deslizante de 4 linhas.
              <li key={call.transcript.length - visible.length + index} data-who={line.who}>
                <strong>{t(`monitoring.call.who.${line.who}`)}</strong> · {isApi || !line.messageKey ? line.text : t(line.messageKey, line.values ?? {})}
              </li>
            ))}
          </ol>
          <p className="mon-call-result">
            <span className="mon-pill" data-tone={call.resultCode === 'dock_confirmed' ? 'ok' : call.resultCode === 'no_answer' || call.resultCode === 'failed' ? 'alert' : 'wait'}>{t(`${isApi ? 'api.calls.results' : 'calls.results'}.${call.resultCode}`, { dock: call.dock, defaultValue: call.status ?? call.result })}</span>
            {call.dock !== undefined && <span className="mon-pill">{t('monitoring.call.dock', { dock: call.dock })}</span>}
          </p>
        </>
      )}
    </section>
  );
}
