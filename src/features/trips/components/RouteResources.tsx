import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiClient } from '../../../services/operations';
import type { BackendDocument, BackendRequest } from '../../../services/api/types';
import { brl } from '../../../utils/format';
import { Badge } from '../../../components/Badge';
import { RouteFiles } from '../../dispatch';
import { APP_ROUTES } from '../../../lib/routes';

export function RouteDocuments({ routeId, showCommercialValues = true }: { routeId: number; showCommercialValues?: boolean }) {
  const { t, i18n } = useTranslation();
  const [documents, setDocuments] = useState<BackendDocument[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false); setDocuments([]);
    void getApiClient()?.getDocuments(routeId, controller.signal).then(setDocuments).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [routeId]);
  return <div className="space-y-5">
    <RouteFiles routeId={routeId} />
    <Link to={APP_ROUTES.dispatch} className="inline-block text-sm text-brand-500 hover:underline">{t('dispatch.nav')}</Link>
    <section className="space-y-3 border-t border-ink-700 pt-5">
      <h3 className="font-display font-semibold">{t('dispatch.documents.title')}</h3>
      <p className="text-xs leading-relaxed text-ink-300">{t('dispatch.documents.notice')}</p>
      {loading && <p role="status" className="text-xs text-ink-300">{t('dispatch.loading')}</p>}
      {failed && <p role="status" className="text-xs text-wait-500">{t('dispatch.documents.failed')}</p>}
      {documents.map((document) => <article key={document.id} className="space-y-3 rounded-input border border-dashed border-wait-500/30 bg-ink-950/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{document.title}</h4><Badge tone="wait" label={t('dispatch.documents.mock')} /></div>
        <p className="break-words text-sm">{document.kind === 'NF-e' ? document.items : document.plate}</p>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div><dt className="text-ink-300">{t('dispatch.documents.number')}</dt><dd className="mt-1 break-all">{document.number}</dd></div>
          <div><dt className="text-ink-300">{t(document.kind === 'NF-e' ? 'dispatch.documents.issuer' : 'dispatch.documents.carrier')}</dt><dd className="mt-1 break-words">{document.kind === 'NF-e' ? document.issuer : document.carrier}</dd></div>
          {showCommercialValues && <div><dt className="text-ink-300">{t(document.kind === 'NF-e' ? 'dispatch.documents.invoiceValue' : 'dispatch.documents.freightValue')}</dt><dd className="mt-1">{brl(document.kind === 'NF-e' ? document.valueBRL : document.freightBRL, i18n.resolvedLanguage)}</dd></div>}
        </dl>
      </article>)}
    </section>
  </div>;
}

export function RouteRequests({ routeId }: { routeId: number }) {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<BackendRequest[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    let inFlight = false;
    const refresh = () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      void getApiClient()?.getRequests(routeId, controller.signal).then((next) => {
        if (version === generation.current) {
          setRequests(next);
          setError((value) => value === 'loadingFailed' ? null : value);
        }
      }).catch(() => {
        if (!controller.signal.aborted && version === generation.current) setError('loadingFailed');
      }).finally(() => {
        inFlight = false;
        if (version === generation.current) setLoading(false);
      });
    };
    setRequests([]); setLoading(true); refresh();
    const timer = setInterval(refresh, 10_000);
    return () => { generation.current++; clearInterval(timer); controller.abort(); };
  }, [routeId, reload]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const client = getApiClient();
    if (!client || busy.current || !question.trim()) return;
    const version = generation.current;
    busy.current = true; setPending(true); setError(null);
    try {
      await client.createRequest(routeId, question.trim());
      if (version === generation.current) { setQuestion(''); setReload((value) => value + 1); }
    } catch {
      if (version === generation.current) {
        setError('sendFailed');
        setReload((value) => value + 1);
      }
    } finally { busy.current = false; setPending(false); }
  };
  return <section className="space-y-4 rounded-input border border-ink-700 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{t('dispatch.requests.title')}</h3>
      <button type="button" disabled={pending} onClick={() => { setError(null); setReload((value) => value + 1); }} className="text-xs text-brand-500 hover:underline">{t('dispatch.requests.refresh')}</button></div>
    <p className="text-xs leading-relaxed text-ink-300">{t('dispatch.requests.notice')}</p>
    <form onSubmit={(event) => void send(event)} className="space-y-3">
      <label className="block text-xs text-ink-300">{t('dispatch.requests.question')}<textarea value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={2000} disabled={pending} className="mt-2 min-h-20 w-full resize-y rounded-input border border-ink-700 bg-ink-950 p-3 text-sm text-ink-50" /></label>
      <button type="submit" disabled={pending || !question.trim()} aria-busy={pending} className="rounded-input bg-brand-500 px-4 py-2.5 text-sm font-semibold hover:bg-brand-600 disabled:opacity-50">{t(pending ? 'dispatch.requests.sending' : 'dispatch.requests.send')}</button>
    </form>
    {error && <p role="alert" className="text-sm text-alert-500">{t(`dispatch.requests.${error}`)}</p>}
    {loading && <p role="status" className="text-sm text-ink-300">{t('dispatch.loading')}</p>}
    {!loading && !error && requests.length === 0 && <p className="text-sm text-ink-300">{t('dispatch.requests.empty')}</p>}
    {requests.map((request) => <article key={request.id} className="space-y-3 rounded-input bg-ink-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-300">#{request.id}</p><Badge tone={request.status === 'respondida' ? 'ok' : 'wait'} label={t(`dispatch.requests.status.${request.status}`)} /></div>
      <p className="whitespace-pre-wrap break-words text-sm">{request.pergunta}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-ink-300">{request.resposta || t('dispatch.requests.awaiting')}</p>
      {request.transcricao && <details><summary className="cursor-pointer text-xs text-brand-500">{t('dispatch.requests.transcript')}</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs text-ink-300">{request.transcricao}</p></details>}
    </article>)}
  </section>;
}
