import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/Badge';
import { getApiClient, respondDemoRequest, useConnection, useDemoConversations } from '../../../services/operations';
import type { BackendDriverRequest } from '../../../services/api/types';
import { APP_ROUTES } from '../../../lib/routes';

const statusTone = {
  coletando: 'wait',
  aguardando_cco: 'alert',
  respondido: 'ok',
  timeout: 'brand',
} as const;

/** Linha comum aos dois modos: API (`/cco/chamados`) ou chamados semeados da Demo. */
type RequestRow = {
  id: number; tripId: string; routeNumber: number; status: BackendDriverRequest['status'];
  subject: string; description: string; highway: string | null; km: number | null; attempts: number; maxAttempts: number;
};

/** Chamados abertos do motorista. `onMessage` abre o compositor de mensagem da viagem (mesmo fluxo do alerta). */
export function DriverRequests({ onMessage, onlyTripId }: { onMessage?: (tripId: string) => void; onlyTripId?: string } = {}) {
  const { t } = useTranslation();
  const connection = useConnection();
  const isApi = connection.mode === 'api';
  const demo = useDemoConversations();
  const [apiRows, setRows] = useState<BackendDriverRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const client = getApiClient();

  useEffect(() => {
    if (connection.mode !== 'api' || !client) return;
    const current = ++generation.current;
    let disposed = false;
    const refresh = async () => {
      try {
        const next = await client.listDriverRequests({ open: true });
        if (!disposed && generation.current === current) {
          setRows(next);
          setError(null);
        }
      } catch {
        if (!disposed && generation.current === current) setError(t('driverRequests.loadError'));
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [client, connection.mode, t]);

  const allRows: RequestRow[] = isApi
    ? apiRows.map((row) => ({
      id: row.id, tripId: `api-route-${row.rota_id}`, routeNumber: row.rota_id, status: row.status, subject: row.assunto, description: row.descricao,
      highway: row.rodovia, km: row.km, attempts: row.tentativas, maxAttempts: row.max_tentativas,
    }))
    : demo.requests.filter((row) => row.status !== 'respondido').map((row) => ({
      id: row.id, tripId: row.tripId, routeNumber: row.routeNumber, status: row.status, subject: t(row.subjectKey), description: t(row.descriptionKey),
      highway: row.highway, km: row.km, attempts: row.attempts, maxAttempts: row.maxAttempts,
    }));
  const rows = onlyTripId ? allRows.filter((row) => row.tripId === onlyTripId) : allRows;
  // Demo não depende de conexão; na API, responder exige o stream conectado.
  const canSend = !isApi || connection.status === 'connected';

  const respond = async (row: RequestRow) => {
    const resposta = drafts[row.id]?.trim();
    if (!resposta || pending !== null) return;
    if (!isApi) {
      respondDemoRequest(row.id, resposta);
      setDrafts((current) => ({ ...current, [row.id]: '' }));
      return;
    }
    if (!client) return;
    setPending(row.id);
    setError(null);
    try {
      await client.respondDriverRequest(row.id, resposta);
      setDrafts((current) => ({ ...current, [row.id]: '' }));
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch {
      setError(t('driverRequests.replyError'));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="rounded-card border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{t('driverRequests.title')}</h2>
        <span className="rounded-full bg-ink-800 px-2.5 py-1 text-xs text-ink-300">{t('driverRequests.count', { n: rows.length })}</span>
      </div>
      {error && <p role="alert" className="border-b border-alert-500/25 bg-alert-500/5 px-5 py-3 text-sm text-alert-500">{error}</p>}
      <ul className="max-h-[580px] divide-y divide-ink-700 overflow-auto">
        {rows.length === 0 && <li className="px-5 py-12 text-center text-sm text-ink-300">{t('driverRequests.empty')}</li>}
        {rows.map((row) => (
          <li key={row.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={APP_ROUTES.trip(row.tripId)} className="font-display text-base font-semibold hover:text-brand-500">
                    {t('driverRequests.route', { id: row.routeNumber })}
                  </Link>
                  <Badge tone={statusTone[row.status]} label={t(`driverRequests.status.${row.status}`)} />
                </div>
                <p className="mt-2 text-sm font-medium text-ink-100">{row.subject}</p>
                <p className="mt-1 text-sm text-ink-300">{row.description}</p>
                <p className="mt-2 text-xs text-ink-400">
                  {row.highway && row.km !== null ? `${row.highway} · km ${row.km}` : t('driverRequests.locationMissing')}
                  {` · ${t('driverRequests.attempts', { n: row.attempts, max: row.maxAttempts })}`}
                </p>
              </div>
              {onMessage && <button type="button" onClick={() => onMessage(row.tripId)}
                className="rounded-input border border-ink-700 px-3 py-2 text-sm font-semibold hover:bg-ink-800">{t('driverRequests.message')}</button>}
            </div>
            {row.status === 'aguardando_cco' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={drafts[row.id] ?? ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                  maxLength={2000}
                  rows={2}
                  placeholder={t('driverRequests.replyPlaceholder')}
                  className="min-h-16 flex-1 rounded-input border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-50 outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => void respond(row)}
                  disabled={pending !== null || !(drafts[row.id] ?? '').trim() || !canSend}
                  className="rounded-input bg-brand-500 text-on-accent px-3 py-2 text-sm font-semibold transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-50"
                >
                  {pending === row.id ? t('driverRequests.replying') : t('driverRequests.reply')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
