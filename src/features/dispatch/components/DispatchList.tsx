import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { APP_ROUTES } from '../../../lib/routes';
import { getApiClient, receiverById, refreshOperations, useMode, useOps } from '../../../services/operations';
import { DISPATCH_FILTERS, demoDispatchRows, dispatchCounts, dispatchRows, matchesDispatchFilter, type DispatchFilter, type DispatchRow } from '../model';
import { useDispatchDrivers, useOperators } from '../hooks/useDispatchDrivers';
import { Pager, pageSlice } from './Pager';
import { RouteEditor } from './RouteEditor';

const initials = (name: string) => name.split(/\s+/).map((part) => part.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
const stateTone = { editable: 'info', unassigned: 'wait', onRoute: 'ok', atReceiver: 'wait', available: 'muted' } as const;

/** Trip dispatch (mockup 03): motoristas e operadores cadastrados, viagens e edição da rota. Na Demo, cadastros locais e viagens simuladas. */
export function DispatchList() {
  const { t, i18n } = useTranslation();
  const mode = useMode();
  const client = getApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const trips = useOps((state) => state.trips);
  const isApi = mode === 'api' && Boolean(client);
  const { eligibleDrivers, loading, failed, reload } = useDispatchDrivers();
  const operators = useOperators();
  const [filter, setFilter] = useState<DispatchFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [operatorPage, setOperatorPage] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ key: string; name?: string } | null>(() => {
    const state = location.state as { notice?: string; name?: string } | null;
    return state?.notice ? { key: state.notice, name: state.name } : null;
  });
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const rows = useMemo(() => isApi ? dispatchRows(eligibleDrivers, trips) : demoDispatchRows(eligibleDrivers, trips), [isApi, eligibleDrivers, trips]);
  const filters = DISPATCH_FILTERS;
  const counts = dispatchCounts(rows, filters);
  const activeFilter = filter;

  // Depois de publicar, a lista abre já com a nova rota em edição.
  useEffect(() => {
    const published = (location.state as { tripKey?: string } | null)?.tripKey;
    if (!published) return;
    const row = rows.find((item) => item.trip?.id === published);
    if (row) { setEditingKey(row.key); navigate(location.pathname, { replace: true, state: null }); }
  }, [location.pathname, location.state, navigate, rows]);

  const normalized = query.trim().toLocaleLowerCase(locale);
  const visible = rows.filter((row) => matchesDispatchFilter(row, activeFilter) && (!normalized || [
    row.driver?.profile.name, row.driver?.profile.email, row.driver?.driver.telefone_e164, row.trip?.plate,
    row.trip?.backend?.destinationName, row.trip?.backend?.originName, row.trip && !isApi ? receiverById(row.trip.receiverId).name : null,
  ].filter(Boolean).join(' ').toLocaleLowerCase(locale).includes(normalized)));
  const editing = rows.find((row): row is DispatchRow & { trip: NonNullable<DispatchRow['trip']> } => row.key === editingKey && Boolean(row.trip));
  const pageRows = pageSlice(visible, page);
  const filterLabel = (item: DispatchFilter) => item === 'all' || item === 'editable' || item === 'available'
    ? t(`dispatch.list.filters.${item}`) : t(`api.routeStatus.${item}`);

  return (
    <div className="dsp" data-editing={Boolean(editing)}>
      <div className="dsp-content">
        <header className="dsp-heading">
          <div>
            <p className="dsp-eyebrow">{t('nav.dispatch')}</p>
            <h1>{t('dispatch.list.title')}</h1>
            <p>{t('dispatch.list.subtitle')}</p>
          </div>
          <div className="dsp-heading-actions">
            <Link className="dsp-button" to={APP_ROUTES.dispatchRegister('operator')}><span aria-hidden="true">＋</span>{t('dispatch.register.operator.cta')}</Link>
            <Link className="dsp-button" data-variant={isApi ? undefined : 'primary'} to={APP_ROUTES.dispatchRegister('driver')}><span aria-hidden="true">＋</span>{t('dispatch.register.driver.cta')}</Link>
            {isApi && <Link className="dsp-button dsp-cta" data-variant="primary" to={APP_ROUTES.dispatchNew}><span aria-hidden="true">＋</span>{t('dispatch.list.create')}</Link>}
          </div>
        </header>

        {notice && <p role="status" className="dsp-notice">{t(`dispatch.notices.${notice.key}`, { name: notice.name })} <button type="button" onClick={() => setNotice(null)} aria-label={t('dispatch.list.dismiss')}>×</button></p>}
        {failed && <p role="alert" className="dsp-error">{t('dispatch.errors.driversFailed')} <button type="button" className="underline" onClick={reload}>{t('dispatch.refresh')}</button></p>}

        <div className="dsp-filters" role="group" aria-label={t('dispatch.list.filtersLabel')}>
          {filters.map((item) => (
            <button key={item} type="button" data-status={item} aria-pressed={activeFilter === item} onClick={() => { setFilter(item); setPage(0); }}>
              <span>{filterLabel(item)}</span>
              <strong>{counts[item]}</strong>
            </button>
          ))}
        </div>

        <section className="dsp-panel" aria-labelledby="dsp-table-title">
          <div className="dsp-toolbar">
            <h2 id="dsp-table-title" className="sr-only">{t('dispatch.list.title')}</h2>
            <label className="dsp-search"><span aria-hidden="true">⌕</span><span className="sr-only">{t('dispatch.list.search')}</span>
              <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={t('dispatch.list.search')} />
            </label>
            <span className="dsp-count">{t('dispatch.list.count', { count: eligibleDrivers.length })}</span>
            {isApi && <button type="button" className="dsp-button" onClick={() => { reload(); operators.reload(); void refreshOperations(); }}>{t('dispatch.refresh')}</button>}
          </div>
          <div className="dsp-table-wrap">
            <table className="dsp-table">
              <thead>
                <tr>{(['driver', 'vehicle', 'status', 'route', 'action'] as const).map((column) => <th key={column} scope="col">{t(`dispatch.list.columns.${column}`)}</th>)}</tr>
              </thead>
              <tbody>
                {loading && !rows.length && <tr><td colSpan={5} className="dsp-empty">{t('dispatch.loading')}</td></tr>}
                {!loading && !visible.length && <tr><td colSpan={5} className="dsp-empty">{t('dispatch.list.empty')}</td></tr>}
                {pageRows.map((row) => {
                  const { trip, driver } = row;
                  const name = driver?.profile.name ?? t('dispatch.unassigned');
                  return (
                    <tr key={row.key} data-editing={row.key === editingKey}>
                      <th scope="row">
                        <span className="dsp-driver">
                          <span className="dsp-avatar" aria-hidden="true">{driver ? initials(name) : '—'}</span>
                          <span><strong>{name}</strong><span>{driver?.driver.telefone_e164 ?? driver?.profile.email ?? t('dispatch.list.noDriver')}</span></span>
                        </span>
                      </th>
                      <td>{trip?.plate ? <span className="dsp-plate-badge">{trip.plate}</span> : <span className="dsp-sub" aria-hidden="true">—</span>}</td>
                      <td><span className="dsp-status" data-tone={stateTone[row.state]}>{filterLabel(row.status)}</span></td>
                      <td>
                        {trip && !isApi ? <><strong className="dsp-route">{receiverById(trip.receiverId).name}</strong><span className="dsp-sub">{t('dispatch.list.from', { origin: t('fleet.origin') })}</span></>
                          : trip ? <><strong className="dsp-route">{trip.backend?.destinationName}</strong><span className="dsp-sub">{t('dispatch.list.from', { origin: trip.backend?.originName })}</span></>
                          : <><strong className="dsp-route">{t('dispatch.list.noTrip')}</strong><span className="dsp-sub">{t(isApi ? 'dispatch.list.createHint' : 'dispatch.list.demoCreateHint')}</span></>}
                      </td>
                      <td className="dsp-action">
                        {/* Igual nos dois modos: "Ver viagem" em toda linha com viagem; editar/atribuir/criar só existem com o backend. */}
                        <span className="dsp-actions">
                        {trip && <Link className="dsp-button" to={APP_ROUTES.trip(trip.id)}>{t('dispatch.list.openTrip')}</Link>}
                        {isApi && (row.state === 'editable' || row.state === 'unassigned') && (
                          <button type="button" className="dsp-button" data-variant={row.key === editingKey ? 'primary' : undefined} aria-pressed={row.key === editingKey}
                            onClick={() => setEditingKey((current) => current === row.key ? null : row.key)}>
                            {t(row.key === editingKey ? 'dispatch.list.editing' : row.state === 'unassigned' ? 'dispatch.list.assign' : 'dispatch.list.edit')}
                          </button>
                        )}
                        {isApi && row.state === 'available' && driver && (
                          <Link className="dsp-button" to={`${APP_ROUTES.dispatchNew}?driver=${driver.driver.id}`}>{t('dispatch.list.createTrip')}</Link>
                        )}
                        {!trip && !isApi && <span className="dsp-sub" aria-hidden="true">—</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager total={visible.length} page={page} onPage={setPage} label={t('dispatch.list.pagination.label')} />
        </section>

        <section className="dsp-panel dsp-operators" aria-labelledby="dsp-operators-title">
          <header className="dsp-toolbar">
            <h2 id="dsp-operators-title">{t('dispatch.operators.title')}</h2>
            <span className="dsp-count">{t('dispatch.operators.count', { count: operators.operators.length })}</span>
          </header>
          {operators.status === 'loading' && <p className="dsp-empty">{t('dispatch.loading')}</p>}
          {operators.status === 'error' && <p role="alert" className="dsp-error">{t('dispatch.operators.failed')} <button type="button" className="underline" onClick={operators.reload}>{t('dispatch.refresh')}</button></p>}
          {operators.status === 'ready' && (
            <ul className="dsp-operator-list">
              {!operators.operators.length && <li className="dsp-empty">{t('dispatch.operators.empty')}</li>}
              {pageSlice(operators.operators, operatorPage).map((operator) => (
                <li key={operator.id}>
                  <span className="dsp-avatar" aria-hidden="true">{initials(operator.name)}</span>
                  <span><strong>{operator.name}</strong><span>{operator.email}</span></span>
                </li>
              ))}
            </ul>
          )}
          {operators.status === 'ready' && <Pager total={operators.operators.length} page={operatorPage} onPage={setOperatorPage} label={t('dispatch.operators.pagination')} />}
        </section>
      </div>
      {editing && (
        <RouteEditor key={editing.trip.id} row={editing} drivers={eligibleDrivers} trips={trips}
          onClose={() => setEditingKey(null)} onSaved={() => { setNotice({ key: 'assigned' }); setEditingKey(null); }} />
      )}
    </div>
  );
}
