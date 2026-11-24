import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/Badge';
import { getApiClient, useConnection } from '../../../services/operations';
import type { BackendDriverRequest } from '../../../services/api/types';
import { APP_ROUTES } from '../../../lib/routes';

const statusTone = {
  coletando: 'wait',
  aguardando_cco: 'alert',
  respondido: 'ok',
  timeout: 'brand',
} as const;

export function DriverRequests() {
  const { t } = useTranslation();
  const connection = useConnection();
  const [rows, setRows] = useState<BackendDriverRequest[]>([]);
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

  if (connection.mode !== 'api') return null;

  const respond = async (row: BackendDriverRequest) => {
    const resposta = drafts[row.id]?.trim();
    if (!client || !resposta || pending !== null) return;
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
                  <Link to={APP_ROUTES.trip(`api-route-${row.rota_id}`)} className="font-display text-base font-semibold hover:text-brand-500">
                    {t('driverRequests.route', { id: row.rota_id })}
                  </Link>
                  <Badge tone={statusTone[row.status]} label={t(`driverRequests.status.${row.status}`)} />
                </div>
                <p className="mt-2 text-sm font-medium text-ink-100">{row.assunto}</p>
                <p className="mt-1 text-sm text-ink-300">{row.descricao}</p>
                <p className="mt-2 text-xs text-ink-400">
                  {row.rodovia && row.km !== null ? `${row.rodovia} · km ${row.km}` : t('driverRequests.locationMissing')}
                  {` · ${t('driverRequests.attempts', { n: row.tentativas, max: row.max_tentativas })}`}
                </p>
              </div>
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
                  disabled={pending !== null || !(drafts[row.id] ?? '').trim() || connection.status !== 'connected'}
                  className="rounded-input bg-brand-500 px-3 py-2 text-sm font-semibold transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-50"
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
