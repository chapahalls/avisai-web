import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiClient, useConnection } from '../../../services/operations';
import { useSession } from '../../auth';
import type { BackendDriverMessage } from '../../../services/api/types';

type DriverMessagesProps = {
  routeId: number;
  driverName?: string;
  highlighted?: boolean;
  onDismissHighlight?: () => void;
};

const statusClass = {
  enviada: 'border-brand-500/45 text-brand-500',
  falada: 'border-wait-500/50 text-wait-500',
  respondida: 'border-ok-500/50 text-ok-500',
  offline: 'border-alert-500/50 text-alert-500',
} as const;

export function DriverMessages({ routeId, driverName, highlighted = false, onDismissHighlight }: DriverMessagesProps) {
  const { t } = useTranslation();
  const connection = useConnection();
  const session = useSession((state) => state.session);
  const client = getApiClient();
  const [rows, setRows] = useState<BackendDriverMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [remetente, setRemetente] = useState(session?.name ?? '');
  const [texto, setTexto] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const composer = useRef<HTMLDivElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setRemetente(session?.name ?? ''); }, [session?.name]);
  useEffect(() => {
    if (!highlighted) return;
    const frame = window.requestAnimationFrame(() => {
      composer.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageField.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlighted, routeId]);
  useEffect(() => {
    if (!client || connection.mode !== 'api') return;
    const current = ++generation.current;
    let disposed = false;
    const refresh = async () => {
      try {
        const messages = await client.listDriverMessages(routeId);
        if (!disposed && generation.current === current) setRows(messages);
      } catch {
        if (!disposed && generation.current === current) setError(t('driverMessages.loadError'));
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [client, connection.mode, routeId, t]);

  if (connection.mode !== 'api') return null;

  const send = async () => {
    if (!client || connection.status !== 'connected' || pending || !remetente.trim() || !texto.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await client.sendDriverMessage(routeId, remetente, texto);
      setRows((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      setTexto('');
      setOpen(false);
    } catch {
      setError(t('driverMessages.sendError'));
    } finally {
      setPending(false);
    }
  };

  const messageForm = (compact = false) => (
    <form onSubmit={(event) => { event.preventDefault(); void send(); }} className={compact ? 'space-y-3' : 'space-y-4'}>
      <label className="block text-sm text-ink-300">
        {t('driverMessages.sender')}
        <input value={remetente} onChange={(event) => setRemetente(event.target.value)} maxLength={255}
          className="mt-1 w-full rounded-input border border-ink-700 bg-ink-950 px-3 py-2 text-ink-50 outline-none focus:border-brand-500" />
      </label>
      <label className="block text-sm text-ink-300">
        {t('driverMessages.message')}
        <textarea ref={highlighted ? messageField : undefined} value={texto} onChange={(event) => setTexto(event.target.value)} maxLength={2000} rows={compact ? 4 : 5}
          className="mt-1 w-full rounded-input border border-ink-700 bg-ink-950 px-3 py-2 text-ink-50 outline-none focus:border-brand-500" />
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        {!highlighted && <button type="button" onClick={() => setOpen(false)} className="rounded-input border border-ink-700 px-4 py-2 text-sm font-semibold">{t('driverMessages.cancel')}</button>}
        <button type="submit" disabled={connection.status !== 'connected' || pending || !remetente.trim() || !texto.trim()} aria-busy={pending}
          className="rounded-input bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
          {t(pending ? 'driverMessages.sending' : 'driverMessages.send')}
        </button>
      </div>
    </form>
  );

  return (
    <section ref={composer} tabIndex={highlighted ? -1 : undefined} className={`space-y-3 ${highlighted ? 'rounded-card border border-brand-500/65 bg-brand-500/5 p-4 shadow-lg shadow-brand-500/10' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">{t(highlighted ? 'driverMessages.alertTitle' : 'driverMessages.title')}</h3>
          <p className="mt-1 text-xs text-ink-300">{highlighted && driverName ? t('driverMessages.alertHint', { driver: driverName }) : t('driverMessages.hint')}</p>
        </div>
        <div className="flex items-center gap-2">
          {highlighted && onDismissHighlight && <button type="button" onClick={onDismissHighlight} className="rounded-input border border-ink-700 px-3 py-2 text-sm font-semibold hover:bg-ink-800">{t('driverMessages.dismiss')}</button>}
          {!highlighted && <button type="button" onClick={() => setOpen(true)} disabled={connection.status !== 'connected'}
            className="rounded-input bg-brand-500 px-3 py-2 text-sm font-semibold hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
            {t('driverMessages.open')}
          </button>}
        </div>
      </div>
      {error && <p role="alert" className="rounded-input border border-alert-500/40 bg-alert-500/10 p-3 text-sm text-alert-500">{error}</p>}
      {highlighted && connection.status !== 'connected' && <p role="status" className="rounded-input border border-wait-500/40 bg-wait-500/10 p-3 text-sm text-wait-500">{t('driverMessages.connectionRequired')}</p>}
      {highlighted && messageForm(true)}
      <ol className="space-y-2">
        {rows.length === 0 && <li className="rounded-input border border-ink-700 bg-ink-950/35 p-3 text-sm text-ink-300">{t('driverMessages.empty')}</li>}
        {rows.map((message) => (
          <li key={message.id} className="rounded-input border border-ink-700 bg-ink-950/35 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{message.remetente}</strong>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass[message.status]}`}>{t(`driverMessages.status.${message.status}`)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-100">{message.texto}</p>
            {message.resposta && <p className="mt-2 border-t border-ink-700 pt-2 text-sm text-ink-300"><strong className="text-ink-100">{t('driverMessages.response')}:</strong> {message.resposta}</p>}
          </li>
        ))}
      </ol>
      {open && <div role="dialog" aria-modal="true" aria-labelledby="driver-message-title" className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4">
        <div className="w-full max-w-lg rounded-card border border-ink-700 bg-ink-900 p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h3 id="driver-message-title" className="font-display text-lg font-semibold">{t('driverMessages.modalTitle')}</h3><p className="mt-1 text-sm text-ink-300">{t('driverMessages.modalHint')}</p></div><button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-300 hover:bg-ink-800" aria-label={t('driverMessages.close')}>×</button></div>
          <div className="mt-5">{messageForm()}</div>
        </div>
      </div>}
    </section>
  );
}
