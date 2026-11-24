import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_ROUTES } from '../../../lib/routes';
import { getApiClient, refreshOperations } from '../../../services/operations';
import type { Trip } from '../../../types/ops';
import { assignmentIssue, type DispatchRow, type RegisteredDriver } from '../model';
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
  useEffect(() => { setDriverId(currentDriverId === null ? '' : String(currentDriverId)); setError(null); }, [trip.id, currentDriverId]);
  const apiTrips = trips.filter((item) => item.source === 'api');
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

      <Link className="dsp-link" to={APP_ROUTES.trip(trip.id)}>{t('dispatch.openRoute')} ↗</Link>
      {trip.backendId && <div className="dsp-editor-files"><RouteFiles key={trip.backendId} routeId={trip.backendId} editable /></div>}
    </aside>
  );
}
