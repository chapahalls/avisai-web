import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { getApiClient, refreshOperations } from '../../../services/operations';
import { routeKey } from '../../../services/operations/adapter';
import { draftProgress, emptyDraft, routeFileIssue, routeInput, worstCaseReceiverCalls, type RouteDraft } from '../model';
import { useDispatchDrivers } from '../hooks/useDispatchDrivers';

const DRAFT_KEY = 'rodar.dispatch.draft';
const FILE_CATEGORIES = ['nota_fiscal', 'documento', 'comprovante', 'imagem', 'outro'] as const;
const PHASES = ['departure', 'route', 'approach', 'arrival', 'waiting', 'unload'] as const;

type QueuedFile = { id: string; file: File; category: (typeof FILE_CATEGORIES)[number] };
export type PublishResult = { tripKey: string; failedFiles: number };

const readDraft = (): { draft: RouteDraft; driverId: string } | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: Partial<RouteDraft>; driverId?: string };
    return { draft: { ...emptyDraft, ...parsed.draft }, driverId: parsed.driverId ?? '' };
  } catch { return null; }
};
const clearDraft = () => { try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* sem armazenamento */ } };

/**
 * Cadastro de viagem (mockup 04): motorista cadastrado, rota com origem e entrega,
 * regras do agente (somente leitura) e documentos enviados após a publicação.
 */
export function RouteCreateForm({ initialDriverId = '', onPublished }: { initialDriverId?: string; onPublished: (result: PublishResult) => void }) {
  const { t } = useTranslation();
  const client = getApiClient();
  const { eligibleDrivers, loading, failed, reload } = useDispatchDrivers();
  const saved = useRef(readDraft()).current;
  const [draft, setDraft] = useState<RouteDraft>(saved?.draft ?? { ...emptyDraft });
  const [driverId, setDriverId] = useState(initialDriverId || saved?.driverId || '');
  const [restored, setRestored] = useState(Boolean(saved));
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState<'publish' | 'files' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!loading && driverId && !eligibleDrivers.some((item) => String(item.driver.id) === driverId)) setDriverId('');
  }, [driverId, eligibleDrivers, loading]);

  const selected = eligibleDrivers.find((item) => String(item.driver.id) === driverId);
  const progress = draftProgress(draft, selected ? selected.driver.id : null);
  const disabled = pending !== null;
  const update = (key: keyof RouteDraft, value: string) => { setDraft((current) => ({ ...current, [key]: value })); setDraftSaved(false); };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: QueuedFile[] = [];
    let rejected: string | null = null;
    for (const file of Array.from(list)) {
      const issue = routeFileIssue(file);
      if (issue) { rejected = issue; continue; }
      next.push({ id: `${file.name}-${file.size}-${file.lastModified}`, file, category: file.type === 'application/pdf' ? 'documento' : 'imagem' });
    }
    // Um arquivo recusado mantém o aviso, mesmo que outros do mesmo envio sejam aceitos.
    setFileError(rejected);
    setFiles((current) => [...current, ...next.filter((item) => !current.some((existing) => existing.id === item.id))]);
  };

  const saveDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, driverId }));
      setDraftSaved(true);
    } catch { setError('draftFailed'); }
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || busy.current) return;
    if (!selected) { setError('validation.driver'); return; }
    let input: ReturnType<typeof routeInput>;
    try { input = routeInput(draft, selected.driver.id); }
    catch (cause) { setError(`validation.${cause instanceof Error ? cause.message : 'required'}`); return; }
    busy.current = true; setPending('publish'); setError(null);
    let routeId: number;
    try {
      routeId = (await client.publishRoute(input)).id;
    } catch {
      // A publicação pode ter sido persistida antes da falha; não repetir automaticamente.
      await refreshOperations();
      if (mounted.current) { setError('publishFailed'); setPending(null); }
      busy.current = false;
      return;
    }
    clearDraft();
    // Documentos só existem depois da rota: envio um a um, sem nova tentativa automática.
    let failedFiles = 0;
    if (files.length && mounted.current) setPending('files');
    for (const item of files) {
      try { await client.uploadRouteFile(routeId, item.file, { categoria: item.category, descricao: '' }); }
      catch { failedFiles += 1; }
    }
    await refreshOperations();
    busy.current = false;
    if (mounted.current) onPublished({ tripKey: routeKey(routeId), failedFiles });
  };

  const input = (key: keyof RouteDraft, options: { coordinate?: boolean; optional?: boolean; wide?: boolean } = {}) => (
    <label className={`dsn-field${options.wide ? ' dsn-wide' : ''}`}>
      <span>{t(`dispatch.fields.${key}`)}</span>
      <input name={key} value={draft[key]} onChange={(event) => update(key, event.target.value)} disabled={disabled}
        required={!options.optional} inputMode={options.coordinate || key === 'tons' ? 'decimal' : key === 'receiverPhone' ? 'tel' : undefined}
        maxLength={options.coordinate || key === 'tons' ? 25 : key === 'cargo' ? 2000 : 255}
        placeholder={options.coordinate ? key.endsWith('Lat') ? '-23.5505' : '-46.6333' : key === 'receiverPhone' ? '+5511999999999' : undefined} />
    </label>
  );

  const steps = [
    { id: 'driver', done: progress.driver, hint: selected ? `${selected.profile.name}${draft.plate ? ` · ${draft.plate.toUpperCase()}` : ''}` : t('dispatch.create.steps.pending') },
    { id: 'route', done: progress.route, hint: draft.destination || t('dispatch.create.steps.pending') },
    { id: 'agent', done: true, hint: t('dispatch.create.steps.agentHint') },
    { id: 'documents', done: files.length > 0, hint: t('dispatch.create.steps.documentsHint', { count: files.length }) },
  ];
  const summary = [
    ['driver', selected?.profile.name ?? '—'],
    ['vehicle', draft.plate ? `${draft.plate.toUpperCase()}${draft.tons ? ` · ${draft.tons} t` : ''}` : '—'],
    ['delivery', draft.destination || '—'],
    ['window', draft.window || '—'],
    ['notice', t('dispatch.create.rules.noticeValue', { km: BUSINESS.approachKm })],
    ['insistence', t('dispatch.create.rules.insistenceValue', { attempts: BUSINESS.maxCcoAttempts, minutes: BUSINESS.ccoAttemptIntervalMin })],
    ['documents', String(files.length)],
  ] as const;

  return (
    <form className="dsn" onSubmit={(event) => void publish(event)} noValidate>
      <nav className="dsn-steps" aria-label={t('dispatch.create.steps.label')}>
        <ol>
          {steps.map((step, index) => (
            <li key={step.id} data-done={step.done}>
              <a href={`#dsn-${step.id}`}>
                <span className="dsn-step-number" aria-hidden="true">{step.done ? '✓' : index + 1}</span>
                <span><strong>{t(`dispatch.create.steps.${step.id}`)}</strong><span>{step.hint}</span></span>
                <span className="sr-only">{t(step.done ? 'dispatch.create.steps.done' : 'dispatch.create.steps.todo')}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="dsn-body">
        {restored && <p role="status" className="dsn-banner">{t('dispatch.create.draftRestored')} <button type="button" onClick={() => { clearDraft(); setDraft({ ...emptyDraft }); setDriverId(initialDriverId); setRestored(false); }}>{t('dispatch.create.discardDraft')}</button></p>}
        {failed && <p role="alert" className="dsn-alert">{t('dispatch.errors.driversFailed')} <button type="button" onClick={reload}>{t('dispatch.refresh')}</button></p>}

        <section id="dsn-driver" className="dsn-card" aria-labelledby="dsn-driver-title">
          <p className="dsn-eyebrow">{t('dispatch.create.stepLabel', { n: 1 })}</p>
          <h2 id="dsn-driver-title">{t('dispatch.create.steps.driver')}</h2>
          <div className="dsn-grid">
            <label className="dsn-field dsn-wide">
              <span>{t('dispatch.driver')}</span>
              <select value={driverId} onChange={(event) => { setDriverId(event.target.value); setDraftSaved(false); }} required disabled={disabled || loading}>
                <option value="">{t(loading ? 'dispatch.loading' : eligibleDrivers.length ? 'dispatch.chooseDriver' : 'dispatch.noRegisteredDrivers')}</option>
                {eligibleDrivers.map(({ profile, driver }) => <option key={profile.id} value={driver.id}>{profile.name} · #{driver.id}</option>)}
              </select>
            </label>
            <div className="dsn-readonly"><span>{t('dispatch.create.phone')}</span><strong>{selected?.driver.telefone_e164 ?? '—'}</strong></div>
            <div className="dsn-readonly"><span>{t('dispatch.create.email')}</span><strong>{selected?.profile.email ?? '—'}</strong></div>
            {input('plate')}
            {input('tons')}
          </div>
          <p className="dsn-note">{t('dispatch.create.driverNote')}</p>
        </section>

        <section id="dsn-route" className="dsn-card" aria-labelledby="dsn-route-title">
          <p className="dsn-eyebrow">{t('dispatch.create.stepLabel', { n: 2 })}</p>
          <h2 id="dsn-route-title">{t('dispatch.create.steps.route')}</h2>
          <div className="dsn-stop" data-kind="origin">
            <span className="dsn-stop-marker" aria-hidden="true" />
            <div className="dsn-grid">
              <p className="dsn-stop-title dsn-wide">{t('dispatch.create.origin')}</p>
              {input('origin', { wide: true })}
              {input('originLat', { coordinate: true })}
              {input('originLng', { coordinate: true })}
            </div>
          </div>
          <div className="dsn-stop" data-kind="delivery">
            <span className="dsn-stop-marker" aria-hidden="true">1</span>
            <div className="dsn-grid">
              <p className="dsn-stop-title dsn-wide">{t('dispatch.create.delivery')}</p>
              {input('destination', { wide: true })}
              {input('destinationLat', { coordinate: true })}
              {input('destinationLng', { coordinate: true })}
              {input('receiverCompany')}
              {input('receiverName')}
              {input('receiverPhone')}
              {input('window', { optional: true })}
              {input('cargo', { wide: true })}
              {input('invoice', { optional: true })}
            </div>
          </div>
          <button type="button" className="dsn-add" disabled aria-describedby="dsn-stops-note">{t('dispatch.create.addStop')}</button>
          <p id="dsn-stops-note" className="dsn-note">{t('dispatch.list.editor.stopsPending')}</p>
        </section>

        <section id="dsn-agent" className="dsn-card" aria-labelledby="dsn-agent-title">
          <p className="dsn-eyebrow">{t('dispatch.create.stepLabel', { n: 3 })}</p>
          <h2 id="dsn-agent-title">{t('dispatch.create.steps.agent')}</h2>
          <p className="dsn-lead">{t('dispatch.create.rules.lead')}</p>
          <dl className="dsn-rules">
            <div><dt>{t('dispatch.create.rules.attempts')}</dt><dd>{BUSINESS.maxCcoAttempts}</dd><span>{t('dispatch.create.rules.attemptsHint')}</span></div>
            <div><dt>{t('dispatch.create.rules.interval')}</dt><dd>{t('dispatch.create.rules.minutes', { value: BUSINESS.ccoAttemptIntervalMin })}</dd></div>
            <div><dt>{t('dispatch.create.rules.notice')}</dt><dd>{t('dispatch.create.rules.km', { value: BUSINESS.approachKm })}</dd></div>
            <div><dt>{t('dispatch.create.rules.franchise')}</dt><dd>{t('dispatch.create.rules.hours', { value: BUSINESS.franchiseHours })}</dd></div>
          </dl>
          <h3 className="dsn-subtitle">{t('dispatch.create.rules.phasesTitle')}</h3>
          <ol className="dsn-phases">
            {PHASES.map((phase) => (
              <li key={phase}><span aria-hidden="true" /><strong>{t(`dispatch.create.rules.phases.${phase}.title`)}</strong><p>{t(`dispatch.create.rules.phases.${phase}.body`, { km: BUSINESS.approachKm, hours: BUSINESS.franchiseHours })}</p></li>
            ))}
          </ol>
          <p className="dsn-note">{t('dispatch.create.rules.readOnly')}</p>
        </section>

        <section id="dsn-documents" className="dsn-card" aria-labelledby="dsn-documents-title">
          <p className="dsn-eyebrow">{t('dispatch.create.stepLabel', { n: 4 })}</p>
          <h2 id="dsn-documents-title">{t('dispatch.create.steps.documents')}</h2>
          <p className="dsn-lead">{t('dispatch.create.documents.lead')}</p>
          <label className="dsn-drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (!disabled) addFiles(event.dataTransfer.files); }}>
            <span aria-hidden="true">⇪</span>
            <strong>{t('dispatch.create.documents.drop')}</strong>
            <span>{t('dispatch.create.documents.types')}</span>
            <input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp,image/gif" disabled={disabled}
              onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          </label>
          {fileError && <p role="alert" className="dsn-alert">{t(`dispatch.files.errors.${fileError}`)}</p>}
          <ul className="dsn-files">
            {files.map((item) => (
              <li key={item.id}>
                <span className="dsn-file-kind" aria-hidden="true">{item.file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                <span className="dsn-file-name"><strong>{item.file.name}</strong><span>{(item.file.size / 1024).toFixed(0)} KB</span></span>
                <label><span className="sr-only">{t('dispatch.files.category')}</span>
                  <select value={item.category} disabled={disabled} onChange={(event) => setFiles((current) => current.map((file) => file.id === item.id ? { ...file, category: event.target.value as QueuedFile['category'] } : file))}>
                    {FILE_CATEGORIES.map((category) => <option key={category} value={category}>{t(`dispatch.files.categories.${category}`)}</option>)}
                  </select>
                </label>
                <button type="button" disabled={disabled} onClick={() => setFiles((current) => current.filter((file) => file.id !== item.id))} aria-label={t('dispatch.create.documents.remove', { name: item.file.name })}>×</button>
              </li>
            ))}
          </ul>
          <p className="dsn-note">{t('dispatch.create.documents.after')}</p>
        </section>

        {error && <p role="alert" className="dsn-alert">{t(`dispatch.errors.${error}`)}</p>}
        <div className="dsn-actions">
          <button type="button" className="dsp-button" onClick={saveDraft} disabled={disabled}>{t(draftSaved ? 'dispatch.create.draftSaved' : 'dispatch.create.saveDraft')}</button>
          <button type="submit" className="dsp-button" data-variant="primary" disabled={disabled || loading || !progress.ready} aria-busy={disabled}>
            {t(pending === 'files' ? 'dispatch.create.uploading' : pending === 'publish' ? 'dispatch.publishing' : 'dispatch.publish')}
          </button>
        </div>
      </div>

      <aside className="dsn-summary" aria-labelledby="dsn-summary-title">
        <h2 id="dsn-summary-title">{t('dispatch.create.summary.title')}</h2>
        <dl>{summary.map(([key, value]) => <div key={key}><dt>{t(`dispatch.create.summary.${key}`)}</dt><dd>{value}</dd></div>)}</dl>
        <div className="dsn-cost">
          <span>{t('dispatch.create.summary.costTitle')}</span>
          <strong>{t('dispatch.create.summary.calls', { count: worstCaseReceiverCalls(1, BUSINESS.maxCcoAttempts) })}</strong>
          <p>{t('dispatch.create.summary.costHint')}</p>
        </div>
      </aside>
    </form>
  );
}
