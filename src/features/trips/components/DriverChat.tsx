import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiClient, useConnection } from '../../../services/operations';
import type { BackendDriverMessage } from '../../../services/api/types';
import { useSession } from '../../auth';

/**
 * Conversa com o motorista (mockup 06): o CCO escreve, o agente fala no ouvido do
 * motorista e a resposta volta transcrita. Usa POST/GET /rotas/{id}/mensagens.
 */
export function DriverChat({ routeId, driverName, stopped }: { routeId?: number; driverName: string; stopped: boolean }) {
  const { t, i18n } = useTranslation();
  const connection = useConnection();
  const session = useSession((state) => state.session);
  const client = getApiClient();
  const [rows, setRows] = useState<BackendDriverMessage[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const enabled = connection.mode === 'api' && Boolean(client) && routeId !== undefined;
  const suggestions = t('tripView.chat.suggestions', { returnObjects: true }) as string[];
  const time = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  useEffect(() => {
    if (!enabled || routeId === undefined || !client) return;
    const current = ++generation.current;
    let disposed = false;
    const refresh = async () => {
      try {
        const messages = await client.listDriverMessages(routeId);
        if (!disposed && generation.current === current) { setRows(messages); setError(null); }
      } catch {
        if (!disposed && generation.current === current) setError('loadError');
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [client, enabled, routeId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const sender = session?.name?.trim() ?? '';
    if (!client || routeId === undefined || connection.status !== 'connected' || pending || !sender || !text.trim()) return;
    setPending(true); setError(null);
    try {
      const created = await client.sendDriverMessage(routeId, sender, text.trim());
      setRows((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      setText('');
    } catch {
      // O servidor pode ter registrado antes da falha: não reenvia sozinho.
      setError('sendError');
    } finally { setPending(false); }
  };

  return (
    <section className="trv-card trv-chat" aria-labelledby="trv-chat-title">
      <header className="trv-chat-heading">
        <h2 id="trv-chat-title">{t('tripView.chat.title')}</h2>
        <p>{t('tripView.chat.hint', { driver: driverName })}</p>
        <span className="trv-pill" data-tone={stopped ? 'ok' : 'wait'}>{t(stopped ? 'tripView.chat.stopped' : 'tripView.chat.moving')}</span>
      </header>
      {!enabled ? <p className="trv-empty">{t('tripView.chat.demo')}</p> : (
        <>
          <ol className="trv-messages" aria-live="polite">
            {!rows.length && <li className="trv-empty">{t('tripView.chat.empty')}</li>}
            {[...rows].reverse().map((message) => (
              <li key={message.id}>
                <p className="trv-meta" data-side="cco">{message.remetente} · {time(message.criada_em)}</p>
                <p className="trv-bubble" data-side="cco">{message.texto}</p>
                <p className="trv-meta" data-side="cco">{t(`tripView.chat.status.${message.status}`, { defaultValue: message.status })}{message.falada_em ? ` · ${time(message.falada_em)}` : ''}</p>
                {(message.resposta || message.transcricao_resposta) && (
                  <>
                    <p className="trv-meta">{t('tripView.chat.reply', { driver: driverName })} · {time(message.respondida_em)}</p>
                    <p className="trv-bubble" data-side="driver">{message.resposta ?? message.transcricao_resposta}</p>
                    {message.transcricao_resposta && <p className="trv-meta">{t('tripView.chat.transcribed')}</p>}
                  </>
                )}
              </li>
            ))}
          </ol>
          <form className="trv-composer" onSubmit={(event) => void send(event)}>
            <div className="trv-suggestions">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setText(suggestion)} disabled={pending}>{suggestion}</button>)}
            </div>
            {error && <p role="alert" className="trv-error">{t(`tripView.chat.${error}`)}</p>}
            <div className="trv-send">
              <label className="sr-only" htmlFor="trv-chat-text">{t('tripView.chat.placeholder')}</label>
              <input id="trv-chat-text" value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} placeholder={t('tripView.chat.placeholder')} disabled={pending} />
              <button type="submit" disabled={pending || !text.trim() || connection.status !== 'connected' || !session?.name} aria-busy={pending}>{t(pending ? 'tripView.chat.sending' : 'tripView.chat.send')}</button>
            </div>
            <p className="trv-note">{t('tripView.chat.note')}</p>
          </form>
        </>
      )}
    </section>
  );
}
