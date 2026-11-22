import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiClient } from '../../../services/operations';
import { ApiError } from '../../../services/api/client';
import type { BackendFile } from '../../../services/api/types';

const inputClass = 'mt-1 w-full rounded-input border border-ink-700 bg-ink-950 p-2.5 text-sm';
const buttonClass = 'rounded-input bg-brand-500 px-4 py-2.5 text-sm font-semibold hover:bg-brand-600 disabled:opacity-50';

/** Arquivos persistidos na viagem; nunca usa armazenamento do navegador como entrega mobile. */
export function RouteFiles({ routeId, editable = false }: { routeId: number; editable?: boolean }) {
  const { t, i18n } = useTranslation();
  const [files, setFiles] = useState<BackendFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const client = getApiClient();
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setFiles([]); setLoading(true); setError(null);
    void client?.listRouteFiles(routeId, controller.signal).then((next) => {
      if (version === generation.current) setFiles(next);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && version === generation.current) setError(cause instanceof ApiError && [404, 405].includes(cause.status ?? 0) ? 'unsupported' : 'loadFailed');
    }).finally(() => { if (version === generation.current) setLoading(false); });
    return () => { generation.current++; controller.abort(); };
  }, [client, routeId, revision]);
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || busy.current) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('arquivo');
    if (!(file instanceof File) || file.size === 0) { setError('emptyFile'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('tooLarge'); return; }
    const version = generation.current;
    busy.current = true; setPending(true); setError(null);
    try {
      await client.uploadRouteFile(routeId, file, { categoria: String(form.get('categoria')), descricao: String(form.get('descricao') ?? '') });
      if (version === generation.current) { formRef.current?.reset(); setRevision((value) => value + 1); }
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof ApiError && cause.status === 413 ? 'tooLarge'
        : cause instanceof ApiError && cause.status === 415 ? 'type' : 'uploadFailed');
    } finally { busy.current = false; setPending(false); }
  };
  const download = async (file: BackendFile) => {
    if (!client || downloading !== null) return;
    setDownloading(file.id); setError(null);
    try {
      const blob = await client.downloadRouteFile(routeId, file.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.nome_original; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { setError('downloadFailed'); }
    finally { setDownloading(null); }
  };
  return <section className="space-y-4" aria-label={t('dispatch.files.title')}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display text-lg font-semibold">{t('dispatch.files.title')}</h3>
      <button type="button" className="text-sm text-brand-500 hover:underline" disabled={pending} onClick={() => setRevision((value) => value + 1)}>{t('dispatch.refresh')}</button>
    </div>
    <p className="text-xs leading-relaxed text-ink-300">{t('dispatch.files.notice')}</p>
    {loading ? <p role="status" className="text-sm text-ink-300">{t('dispatch.loading')}</p>
      : files.length === 0 ? <p className="rounded-input border border-dashed border-ink-700 p-4 text-sm text-ink-300">{t('dispatch.files.empty')}</p>
      : <ul className="space-y-2">{files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-input border border-ink-700 bg-ink-950/50 p-3">
        <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{file.nome_original}</p>
          <p className="mt-1 text-xs text-ink-300">{t(`dispatch.files.categories.${file.categoria}`, { defaultValue: file.categoria })} · {(file.tamanho_bytes / 1024).toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 0 })} KB</p>
          {file.descricao && <p className="mt-1 break-words text-xs text-ink-300">{file.descricao}</p>}</div>
        <button type="button" disabled={downloading !== null} onClick={() => void download(file)} className="rounded-input border border-ink-700 px-3 py-2 text-xs hover:bg-ink-800 disabled:opacity-50">{t(downloading === file.id ? 'dispatch.files.downloading' : 'dispatch.files.download')}</button>
      </li>)}</ul>}
    {error && <p role="alert" className="text-sm text-alert-500">{t(`dispatch.files.errors.${error}`)}</p>}
    {editable && <form key={routeId} ref={formRef} onSubmit={(event) => void upload(event)} className="grid gap-3 rounded-input border border-ink-700 p-4 sm:grid-cols-2">
      <label className="text-xs text-ink-300">{t('dispatch.files.file')}<input className={inputClass} name="arquivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" required disabled={pending} /></label>
      <label className="text-xs text-ink-300">{t('dispatch.files.category')}<select className={inputClass} name="categoria" disabled={pending}>
        {['nota_fiscal', 'documento', 'comprovante', 'imagem', 'outro'].map((category) => <option key={category} value={category}>{t(`dispatch.files.categories.${category}`)}</option>)}</select></label>
      <label className="text-xs text-ink-300 sm:col-span-2">{t('dispatch.files.description')}<input className={inputClass} name="descricao" maxLength={1000} disabled={pending} /></label>
      <div className="sm:col-span-2"><button type="submit" disabled={pending || loading || error === 'unsupported' || !client} className={buttonClass} aria-busy={pending}>{t(pending ? 'dispatch.files.uploading' : 'dispatch.files.upload')}</button></div>
    </form>}
  </section>;
}
