import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/PageHeader';
import { Badge } from '../../../components/Badge';
import { getApiClient, refreshOperations, setMode, useMode, useOps } from '../../../services/operations';
import { routeKey } from '../../../services/operations/adapter';
import type { BackendDriver } from '../../../services/api/types';
import { assignmentIssue, emptyDraft, routeInput, type RouteDraft } from '../model';
import { RouteFiles } from './RouteFiles';

const fieldClass = 'mt-1 w-full rounded-input border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-50';
const primary = 'rounded-input bg-brand-500 px-4 py-2.5 text-sm font-semibold hover:bg-brand-600 disabled:opacity-50';
const panel = 'min-w-0 space-y-4 rounded-card border border-ink-700 bg-ink-900 p-4 sm:p-5';

export function DispatchBoard() {
  const { t } = useTranslation();
  const mode = useMode();
  const client = getApiClient();
  const trips = useOps((state) => state.trips);
  const [drivers, setDrivers] = useState<BackendDriver[]>([]);
  const [draft, setDraft] = useState<RouteDraft>({ ...emptyDraft });
  const [selected, setSelected] = useState('');
  const [driverId, setDriverId] = useState('');
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<'publish' | 'assign' | 'driver' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const driverForm = useRef<HTMLFormElement>(null);
  const activeTrips = trips.filter((trip) => trip.source === 'api');
  const trip = activeTrips.find((item) => item.id === selected);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!client || mode !== 'api') { setLoadingDrivers(false); return; }
    const controller = new AbortController();
    setLoadingDrivers(true);
    void client.listDrivers(controller.signal).then(setDrivers).catch(() => {
      if (!controller.signal.aborted) setError('driversFailed');
    }).finally(() => { if (!controller.signal.aborted) setLoadingDrivers(false); });
    return () => controller.abort();
  }, [client, mode, reload]);
  useEffect(() => {
    if (!selected && activeTrips[0]) setSelected(activeTrips[0].id);
    if (selected && activeTrips.length && !activeTrips.some((item) => item.id === selected)) setSelected(activeTrips[0].id);
  }, [activeTrips, selected]);
  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || busy.current) return;
    let input;
    try { input = routeInput(draft); }
    catch (cause) { setError(`validation.${cause instanceof Error ? cause.message : 'required'}`); return; }
    busy.current = true; setPending('publish'); setError(null); setNotice(null);
    try {
      const result = await client.publishRoute(input);
      await refreshOperations();
      if (!mounted.current) return;
      setSelected(routeKey(result.id)); setDriverId(''); setDraft({ ...emptyDraft }); setNotice('published');
    } catch {
      // Publicação pode ter sido persistida antes de uma falha; não repetir automaticamente.
      await refreshOperations();
      if (mounted.current) setError('publishFailed');
    } finally { busy.current = false; if (mounted.current) setPending(null); }
  };
  const assign = async (event: FormEvent) => {
    event.preventDefault();
    const driver = drivers.find((item) => String(item.id) === driverId);
    if (!client || busy.current || !trip?.backendId || !driver) return;
    const issue = assignmentIssue(trip, driver, activeTrips);
    if (issue) { setError(`assignment.${issue}`); return; }
    busy.current = true; setPending('assign'); setError(null); setNotice(null);
    try {
      await client.assignRoute(trip.backendId, driver.id);
      await refreshOperations();
      if (mounted.current) setNotice('assigned');
    } catch {
      await refreshOperations();
      if (mounted.current) setError('assignFailed');
    } finally { busy.current = false; if (mounted.current) setPending(null); }
  };
  const createDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || busy.current) return;
    const form = new FormData(event.currentTarget);
    if (!String(form.get('nome') ?? '').trim()) { setError('validation.required'); return; }
    busy.current = true; setPending('driver'); setError(null);
    try {
      const driver = await client.createDriver({
        nome: String(form.get('nome')).trim(), email: String(form.get('email')).trim() || null,
        telefone_e164: String(form.get('telefone')).trim() || null, empresa_id: 1,
      });
      if (!mounted.current) return;
      setDrivers((items) => [...items, driver]); setDriverId(String(driver.id)); driverForm.current?.reset(); setNotice('driverCreated');
    } catch { if (mounted.current) setError('driverFailed'); }
    finally { busy.current = false; if (mounted.current) setPending(null); }
  };
  const field = (key: keyof RouteDraft, coordinate = false) => <label key={key} className="min-w-0 text-xs text-ink-300">
    {t(`dispatch.fields.${key}`)}<input name={key} className={fieldClass} value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))}
      inputMode={coordinate || key === 'tons' ? 'decimal' : key === 'receiverPhone' ? 'tel' : undefined}
      required={!['invoice', 'window'].includes(key)} maxLength={coordinate || key === 'tons' ? 25 : key === 'cargo' ? 2000 : 255}
      placeholder={coordinate ? key.endsWith('Lat') ? '-23.5505' : '-46.6333' : key === 'receiverPhone' ? '+5511999999999' : undefined} disabled={pending !== null} />
  </label>;
  if (mode !== 'api' || !client) return <div className={panel}>
    <PageHeader title={t('dispatch.title')} description={t('dispatch.demoNotice')} />
    {client && <button type="button" onClick={() => setMode('api')} className={primary}>{t('api.connection.useApi')}</button>}
    <p className="text-sm text-ink-300">{t('dispatch.configureApi')}</p>
  </div>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PageHeader title={t('dispatch.title')} eyebrow={t('dispatch.eyebrow')} description={t('dispatch.subtitle')} />
      <button type="button" disabled={pending !== null} onClick={() => { setReload((value) => value + 1); void refreshOperations(); }} className="rounded-input border border-ink-700 px-4 py-2.5 text-sm hover:bg-ink-800">{t('dispatch.refresh')}</button>
    </div>
    <ol className="grid gap-3 sm:grid-cols-3">{['publish', 'assign', 'files'].map((step, index) => <li key={step} className="flex items-center gap-3 rounded-input border border-ink-700 bg-ink-900 px-4 py-3 text-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 font-semibold text-brand-500">{index + 1}</span>{t(`dispatch.steps.${step}`)}</li>)}</ol>
    {error && <p role="alert" className="rounded-input border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-500">{t(`dispatch.errors.${error}`)}</p>}
    {notice && <p role="status" className="rounded-input border border-ok-500/30 bg-ok-500/5 p-3 text-sm text-ok-500">{t(`dispatch.notices.${notice}`)}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className={panel}>
        <h2 className="font-display text-xl font-semibold">{t('dispatch.newRoute')}</h2>
        <p className="text-xs leading-relaxed text-ink-300">{t('dispatch.routeNotice')}</p>
        <form onSubmit={(event) => void publish(event)} className="space-y-5">
          <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">{t('dispatch.journey')}</legend>
            {field('origin')}{field('destination')}
            {field('originLat', true)}{field('originLng', true)}{field('destinationLat', true)}{field('destinationLng', true)}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">{t('dispatch.cargo')}</legend>
            {field('plate')}{field('invoice')}{field('cargo')}{field('tons')}{field('window')}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">{t('dispatch.receiver')}</legend>
            {field('receiverCompany')}{field('receiverName')}{field('receiverPhone')}
          </fieldset>
          <button type="submit" disabled={pending !== null} aria-busy={pending === 'publish'} className={primary}>{t(pending === 'publish' ? 'dispatch.publishing' : 'dispatch.publish')}</button>
        </form>
      </section>
      <div className="min-w-0 space-y-5">
        <section className={panel}>
          <h2 className="font-display text-xl font-semibold">{t('dispatch.assignment')}</h2>
          <label className="block text-xs text-ink-300">{t('dispatch.selectRoute')}<select className={fieldClass} value={selected} disabled={pending !== null} onChange={(event) => { setSelected(event.target.value); setDriverId(''); setError(null); setNotice(null); }}>
            <option value="">{t('dispatch.chooseRoute')}</option>
            {activeTrips.map((item) => <option key={item.id} value={item.id}>#{item.backendId} · {item.plate || '—'} · {item.backend?.destinationName} · {t(`api.routeStatus.${item.backend?.status}`)}</option>)}
          </select></label>
          {trip ? <>
            <div className="space-y-2 rounded-input border border-ink-700 bg-ink-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-display">{trip.plate || '—'}</strong><Badge tone="brand" label={t(`api.routeStatus.${trip.backend?.status}`)} /></div>
              <p className="break-words text-sm">{trip.backend?.originName} → {trip.backend?.destinationName}</p>
              <p className="text-xs text-ink-300">{t('dispatch.currentDriver')}: {trip.driver || t('dispatch.unassigned')} · {trip.capacityTons} t</p>
              <Link to={`/trips/${trip.id}`} className="inline-block text-xs text-brand-500 hover:underline">{t('dispatch.openRoute')}</Link>
            </div>
            <form onSubmit={(event) => void assign(event)} className="space-y-3">
              <label className="block text-xs text-ink-300">{t('dispatch.driver')}<select className={fieldClass} value={driverId} onChange={(event) => setDriverId(event.target.value)} required disabled={pending !== null || loadingDrivers || trip.backend?.status === 'descarregada'}>
                <option value="">{t(loadingDrivers ? 'dispatch.loading' : 'dispatch.chooseDriver')}</option>
                {drivers.map((driver) => {
                  const issue = assignmentIssue(trip, driver, activeTrips);
                  return <option key={driver.id} value={driver.id} disabled={Boolean(issue)}>{driver.nome} · #{driver.id}{issue ? ` · ${t(`dispatch.driverStates.${issue}`)}` : ''}</option>;
                })}
              </select></label>
              <p className="text-xs leading-relaxed text-ink-300">{t('dispatch.assignmentNotice')}</p>
              <button type="submit" disabled={pending !== null || !driverId || trip.backend?.status === 'descarregada' || trip.backend?.driverId === Number(driverId)} aria-busy={pending === 'assign'} className={primary}>{t(pending === 'assign' ? 'dispatch.assigning' : 'dispatch.assign')}</button>
            </form>
          </> : <p className="text-sm text-ink-300">{t('dispatch.noRoutes')}</p>}
          <details className="rounded-input border border-ink-700">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t('dispatch.newDriver')}</summary>
            <form ref={driverForm} onSubmit={(event) => void createDriver(event)} className="space-y-3 border-t border-ink-700 p-4">
              <label className="block text-xs text-ink-300">{t('dispatch.driverName')}<input className={fieldClass} name="nome" required maxLength={255} disabled={pending !== null} /></label>
              <label className="block text-xs text-ink-300">{t('dispatch.driverEmail')}<input className={fieldClass} name="email" type="email" required maxLength={255} disabled={pending !== null} /></label>
              <label className="block text-xs text-ink-300">{t('dispatch.driverPhone')}<input className={fieldClass} name="telefone" type="tel" pattern="\+[1-9][0-9]{7,14}" placeholder="+5511999999999" disabled={pending !== null} /></label>
              <button className={primary} type="submit" disabled={pending !== null}>{t(pending === 'driver' ? 'dispatch.saving' : 'dispatch.createDriver')}</button>
            </form>
          </details>
        </section>
        {trip?.backendId && <section className={panel} key={trip.backendId}>
          <RouteFiles routeId={trip.backendId} editable />
          <aside className="space-y-2 rounded-input border border-brand-500/20 bg-brand-500/5 p-3">
            <h3 className="text-sm font-semibold">{t('dispatch.mobileTitle')}</h3>
            <p className="text-xs leading-relaxed text-ink-300">{t(trip.backend?.driverId ? 'dispatch.mobileReady' : 'dispatch.mobileAwaiting')}</p>
            {trip.backend?.driverId && <p className="break-all font-mono text-xs">driverId: {trip.backend.driverId} · tripId: {trip.backendId}</p>}
          </aside>
        </section>}
      </div>
    </div>
  </div>;
}
