import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { APP_ROUTES } from '../../../lib/routes';
import { getApiClient, refreshOperations, setMode, useMode, useOps } from '../../../services/operations';
import { dispatchCounts, dispatchRows, matchesDispatchFilter, type DispatchFilter, type DispatchRow } from '../model';
import { useDispatchDrivers } from '../hooks/useDispatchDrivers';
import { RouteEditor } from './RouteEditor';

const FILTERS: DispatchFilter[] = ['all', 'editable', 'onRoute', 'atReceiver', 'available'];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
const stateTone = { editable: 'info', unassigned: 'wait', onRoute: 'ok', atReceiver: 'wait', available: 'muted' } as const;

/** Trip dispatch (mockup 03): motoristas cadastrados, suas viagens e a edição da rota. */
export function DispatchList() {
  const { t, i18n } = useTranslation();
  const mode = useMode();
  const client = getApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const trips = useOps((state) => state.trips);
  const { eligibleDrivers, loading, failed, reload } = useDispatchDrivers();
  const [filter, setFilter] = useState<DispatchFilter>('all');
  const [query, setQuery] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const rows = useMemo(() => dispatchRows(eligibleDrivers, trips), [eligibleDrivers, trips]);
  const counts = dispatchCounts(rows);

  // Depois de publicar, a lista abre já com a nova rota em edição.
  useEffect(() => {
    const published = (location.state as { tripKey?: string } | null)?.tripKey;
    if (!published) return;
    const row = rows.find((item) => item.trip?.id === published);
    if (row) { setEditingKey(row.key); navigate(location.pathname, { replace: true, state: null }); }
  }, [location.pathname, location.state, navigate, rows]);

  if (mode !== 'api' || !client) {
    return (
      <div className="dsp">
        <header className="dsp-heading"><div><p className="dsp-eyebrow">{t('nav.dispatch')}</p><h1>{t('dispatch.list.title')}</h1><p>{t('dispatch.demoNotice')}</p></div></header>
        <div className="dsp-panel dsp-demo">
          <p>{t('dispatch.configureApi')}</p>
          {client && <button type="button" className="dsp-button" data-variant="primary" onClick={() => setMode('api')}>{t('api.connection.useApi')}</button>}
        </div>
      </div>
    );
  }

  const normalized = query.trim().toLocaleLowerCase(locale);
  const visible = rows.filter((row) => matchesDispatchFilter(row, filter) && (!normalized || [
    row.driver?.profile.name, row.driver?.profile.email, row.driver?.driver.telefone_e164, row.trip?.plate,
    row.trip?.backend?.destinationName, row.trip?.backend?.originName,
  ].filter(Boolean).join(' ').toLocaleLowerCase(locale).includes(normalized)));
  const editing = rows.find((row): row is DispatchRow & { trip: NonNullable<DispatchRow['trip']> } => row.key === editingKey && Boolean(row.trip));
  const agentRule = t('dispatch.list.agentRule', { attempts: BUSINESS.maxCcoAttempts, minutes: BUSINESS.ccoAttemptIntervalMin });

  return (
    <div className="dsp" data-editing={Boolean(editing)}>
      <div className="dsp-content">
        <header className="dsp-heading">
          <div>
            <p className="dsp-eyebrow">{t('nav.dispatch')}</p>
            <h1>{t('dispatch.list.title')}</h1>
            <p>{t('dispatch.list.subtitle')}</p>
          </div>
          <Link className="dsp-button dsp-cta" data-variant="primary" to={APP_ROUTES.dispatchNew}><span aria-hidden="true">＋</span>{t('dispatch.list.create')}</Link>
        </header>

        {notice && <p role="status" className="dsp-notice">{t(`dispatch.notices.${notice}`)} <button type="button" onClick={() => setNotice(null)} aria-label={t('dispatch.list.dismiss')}>×</button></p>}
        {failed && <p role="alert" className="dsp-error">{t('dispatch.errors.driversFailed')} <button type="button" className="underline" onClick={reload}>{t('dispatch.refresh')}</button></p>}

        <div className="dsp-filters" role="group" aria-label={t('dispatch.list.filtersLabel')}>
          {FILTERS.map((item) => (
            <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
              <span>{t(`dispatch.list.filters.${item}`)}</span>
              <strong>{counts[item]}</strong>
            </button>
          ))}
        </div>

        <section className="dsp-panel" aria-labelledby="dsp-table-title">
          <div className="dsp-toolbar">
            <h2 id="dsp-table-title" className="sr-only">{t('dispatch.list.title')}</h2>
            <label className="dsp-search"><span aria-hidden="true">⌕</span><span className="sr-only">{t('dispatch.list.search')}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('dispatch.list.search')} />
            </label>
            <span className="dsp-count">{t('dispatch.list.count', { count: eligibleDrivers.length })}</span>
            <button type="button" className="dsp-button" onClick={() => { reload(); void refreshOperations(); }}>{t('dispatch.refresh')}</button>
          </div>
          <div className="dsp-table-wrap">
            <table className="dsp-table">
              <thead>
                <tr>{(['driver', 'vehicle', 'status', 'route', 'window', 'agent', 'action'] as const).map((column) => <th key={column} scope="col">{t(`dispatch.list.columns.${column}`)}</th>)}</tr>
              </thead>
              <tbody>
                {loading && !rows.length && <tr><td colSpan={7} className="dsp-empty">{t('dispatch.loading')}</td></tr>}
                {!loading && !visible.length && <tr><td colSpan={7} className="dsp-empty">{t('dispatch.list.empty')}</td></tr>}
                {visible.map((row) => {
                  const { trip, driver } = row;
                  const name = driver?.profile.name ?? t('dispatch.unassigned');
                  const locked = row.state === 'onRoute' || row.state === 'atReceiver';
                  return (
                    <tr key={row.key} data-editing={row.key === editingKey}>
                      <th scope="row">
                        <span className="dsp-driver">
                          <span className="dsp-avatar" aria-hidden="true">{driver ? initials(name) : '—'}</span>
                          <span><strong>{name}</strong><span>{driver?.driver.telefone_e164 ?? driver?.profile.email ?? t('dispatch.list.noDriver')}</span></span>
                        </span>
                      </th>
                      <td className="dsp-plate">{trip?.plate || '—'}</td>
                      <td><span className="dsp-status" data-tone={stateTone[row.state]}>{t(row.state === 'editable' && trip ? `api.routeStatus.${trip.backend?.status}` : `dispatch.list.states.${row.state}`)}</span></td>
                      <td>
                        {trip ? <><strong className="dsp-route">{trip.backend?.destinationName}</strong><span className="dsp-sub">{t('dispatch.list.from', { origin: trip.backend?.originName })}</span></>
                          : <><strong className="dsp-route">{t('dispatch.list.noTrip')}</strong><span className="dsp-sub">{t('dispatch.list.createHint')}</span></>}
                      </td>
                      <td className="dsp-mono">{trip?.backend?.arrivalWindow || '—'}</td>
                      <td>{trip ? agentRule : '—'}</td>
                      <td className="dsp-action">
                        {locked && <span className="dsp-locked"><span aria-hidden="true">🔒</span>{t(`dispatch.list.locked.${row.state}`)}</span>}
                        {(row.state === 'editable' || row.state === 'unassigned') && (
                          <button type="button" className="dsp-button" data-variant={row.key === editingKey ? 'primary' : undefined} aria-pressed={row.key === editingKey}
                            onClick={() => setEditingKey((current) => current === row.key ? null : row.key)}>
                            {t(row.key === editingKey ? 'dispatch.list.editing' : row.state === 'unassigned' ? 'dispatch.list.assign' : 'dispatch.list.edit')}
                          </button>
                        )}
                        {row.state === 'available' && driver && (
                          <Link className="dsp-button" to={`${APP_ROUTES.dispatchNew}?driver=${driver.driver.id}`}>{t('dispatch.list.createTrip')}</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {editing && (
        <RouteEditor key={editing.trip.id} row={editing} drivers={eligibleDrivers} trips={trips}
          onClose={() => setEditingKey(null)} onSaved={() => { setNotice('assigned'); setEditingKey(null); }} />
      )}
    </div>
  );
}
