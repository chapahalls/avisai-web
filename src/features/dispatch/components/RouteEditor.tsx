import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_ROUTES } from '../../../lib/routes';
import { ApiError } from '../../../services/api/client';
import { getApiClient, refreshOperations } from '../../../services/operations';
import type { Trip } from '../../../types/ops';
import { assignmentIssue, CANCEL_REASON_MAX, CANCEL_REASON_MIN, canCancelTrip, type DispatchRow, type RegisteredDriver } from '../model';
import { RouteFiles } from './RouteFiles';

/**
 * Painel "Editando rota": paradas da rota (origem e entrega), troca do motorista
 * e arquivos. O backend ainda não aceita paradas extras nem reordenação, então
 * essas ações não são simuladas aqui.
 */
export function RouteEditor({ row, drivers, trips, onClose, onSaved }: {
  row: DispatchRow & { trip: Trip };
  drivers: RegisteredDriver[];
  trips: Trip[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const client = getApiClient();
  const { trip } = row;
  const currentDriverId = trip.backend?.driverId ?? null;
  const [driverId, setDriverId] = useState(currentDriverId === null ? '' : String(currentDriverId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: trip.id não é lido no corpo, mas reseta o formulário ao trocar de viagem.
  useEffect(() => { setDriverId(currentDriverId === null ? '' : String(currentDriverId)); setError(null); }, [trip.id, currentDriverId]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: trip.id não é lido no corpo, mas reseta o cancelamento ao trocar de viagem.
  useEffect(() => { setCancelOpen(false); setReason(''); setCancelError(null); }, [trip.id]);
  const apiTrips = trips.filter((item) => item.source === 'api');
  const reasonValid = reason.trim().length >= CANCEL_REASON_MIN && reason.trim().length <= CANCEL_REASON_MAX;

  const cancelTrip = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || busy.current || !trip.backendId || !reasonValid || !canCancelTrip(trip)) return;
    busy.current = true; setCancelPending(true); setCancelError(null);
    try {
      await client.cancelRoute(trip.backendId, reason);
      await refreshOperations();
      if (mounted.current) onSaved();
    } catch (cause) {
      // O servidor pode ter cancelado antes da falha; atualiza e não repete sozinho.
      await refreshOperations();
      const status = cause instanceof ApiError ? cause.status : undefined;
      if (mounted.current) setCancelError(status === 409 ? 'cancelConflict' : 'cancelFailed');
    } finally { busy.current = false; if (mounted.current) setCancelPending(false); }
  };
  const changed = driverId !== '' && Number(driverId) !== currentDriverId;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const driver = drivers.find((item) => String(item.driver.id) === driverId)?.driver;
    if (!client || busy.current || !trip.backendId || !driver || !changed) return;
    const issue = assignmentIssue(trip, driver, apiTrips);
    if (issue) { setError(`assignment.${issue}`); return; }
    busy.current = true; setPending(true); setError(null);
    try {
      await client.assignRoute(trip.backendId, driver.id);
      await refreshOperations();
      if (mounted.current) onSaved();
    } catch {
      // O servidor pode ter salvo antes da falha; atualiza e não repete sozinho.
      await refreshOperations();
      if (mounted.current) setError('assignFailed');
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };

  const arrivalWindow = trip.backend?.arrivalWindow;
  return (
    <aside className="dsp-editor" aria-labelledby="dsp-editor-title">
      <header className="dsp-editor-heading">
        <p className="dsp-eyebrow">{t(row.state === 'unassigned' ? 'dispatch.list.editor.assignEyebrow' : 'dispatch.list.editor.eyebrow')}</p>
        <h2 id="dsp-editor-title">{row.driver?.profile.name ?? t('dispatch.unassigned')} · <span className="dsp-plate">{trip.plate || '—'}</span></h2>
        <p>{t(`api.routeStatus.${trip.backend?.status}`)}{arrivalWindow ? ` · ${t('dispatch.list.editor.window', { window: arrivalWindow })}` : ''}</p>
      </header>

      <ol className="dsp-stops" aria-label={t('dispatch.list.editor.stops')}>
        <li data-kind="origin">
          <span aria-hidden="true" />
          <div><strong>{trip.backend?.originName ?? '—'}</strong><p>{t('dispatch.list.editor.origin')}</p></div>
        </li>
        <li data-kind="delivery">
          <span aria-hidden="true">1</span>
          <div><strong>{trip.backend?.destinationName ?? '—'}</strong><p>{arrivalWindow ? t('dispatch.list.editor.deliveryWindow', { window: arrivalWindow }) : t('dispatch.list.editor.delivery')}</p></div>
        </li>
      </ol>
      <p className="dsp-note">{t('dispatch.list.editor.stopsPending')}</p>

      <form className="dsp-editor-form" onSubmit={(event) => void save(event)}>
        <label>
          <span>{t('dispatch.driver')}</span>
          <select value={driverId} onChange={(event) => { setDriverId(event.target.value); setError(null); }} disabled={pending}>
            <option value="">{t(drivers.length ? 'dispatch.chooseDriver' : 'dispatch.noRegisteredDrivers')}</option>
            {drivers.map(({ profile, driver }) => {
              const issue = Number(driver.id) === currentDriverId ? null : assignmentIssue(trip, driver, apiTrips);
              return <option key={profile.id} value={driver.id} disabled={Boolean(issue)}>{profile.name} · #{driver.id}{issue ? ` · ${t(`dispatch.driverStates.${issue}`)}` : ''}</option>;
            })}
          </select>
        </label>
        <p className="dsp-info">{t('dispatch.list.editor.saveNotice')}</p>
        {error && <p role="alert" className="dsp-error">{t(`dispatch.errors.${error}`)}</p>}
        <div className="dsp-editor-actions">
          <button type="button" className="dsp-button" onClick={onClose} disabled={pending}>{t('dispatch.list.editor.cancel')}</button>
          <button type="submit" className="dsp-button" data-variant="primary" disabled={pending || !changed} aria-busy={pending}>{t(pending ? 'dispatch.saving' : 'dispatch.list.editor.save')}</button>
        </div>
      </form>

      {canCancelTrip(trip) && <section className="dsp-cancel" aria-labelledby="dsp-cancel-title">
        <h3 id="dsp-cancel-title">{t('dispatch.cancelTrip.title')}</h3>
        {!cancelOpen
          ? <button type="button" className="dsp-button" data-variant="danger" onClick={() => setCancelOpen(true)} disabled={pending}>{t('dispatch.cancelTrip.open')}</button>
          : <form onSubmit={(event) => void cancelTrip(event)}>
              <p className="dsp-info">{t('dispatch.cancelTrip.warning')}</p>
              <label>
                <span>{t('dispatch.cancelTrip.reason')}</span>
                <textarea value={reason} onChange={(event) => { setReason(event.target.value); setCancelError(null); }} disabled={cancelPending}
                  required minLength={CANCEL_REASON_MIN} maxLength={CANCEL_REASON_MAX} rows={3} placeholder={t('dispatch.cancelTrip.placeholder')} />
              </label>
              {cancelError && <p role="alert" className="dsp-error">{t(`dispatch.errors.${cancelError}`)}</p>}
              <div className="dsp-editor-actions">
                <button type="button" className="dsp-button" onClick={() => { setCancelOpen(false); setReason(''); setCancelError(null); }} disabled={cancelPending}>{t('dispatch.cancelTrip.keep')}</button>
                <button type="submit" className="dsp-button" data-variant="danger" disabled={cancelPending || !reasonValid} aria-busy={cancelPending}>
                  {t(cancelPending ? 'dispatch.cancelTrip.cancelling' : 'dispatch.cancelTrip.confirm')}
                </button>
              </div>
            </form>}
      </section>}

      <Link className="dsp-link" to={APP_ROUTES.trip(trip.id)}>{t('dispatch.openRoute')} ↗</Link>
      {trip.backendId && <div className="dsp-editor-files"><RouteFiles key={trip.backendId} routeId={trip.backendId} editable /></div>}
    </aside>
  );
}
