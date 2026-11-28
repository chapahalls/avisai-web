import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { receiverById, useOps } from '../../../services/operations';
import { clock, hhmm } from '../../../utils/format';
import { deriveAlerts, etaMinutes, signalAgeMinutes, waitMinutes } from '../model';
import { driverName, phaseTone, statusLabel } from './labels';

const FILTERS = ['all', 'route', 'receiver', 'alert'] as const;
type Filter = (typeof FILTERS)[number];
const PAGE_SIZE = 8;

/** Grade de viagens com filtros e busca; clicar seleciona o veículo no painel. */
export function TripGrid({ selectedTripId, onSelect, onlyTripId }: { selectedTripId: string | null; onSelect: (tripId: string) => void; onlyTripId?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const { trips: allTrips, tasks: allTasks, simMinutes } = useOps();
  const trips = onlyTripId ? allTrips.filter((trip) => trip.id === onlyTripId) : allTrips;
  const tasks = onlyTripId ? allTasks.filter((task) => task.tripId === onlyTripId) : allTasks;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const alerted = new Set(deriveAlerts({ trips, tasks, simMinutes }).map((alert) => alert.tripId));
  const normalized = query.trim().toLocaleLowerCase(locale);
  const rows = trips.filter((trip) => {
    const matches = filter === 'all'
      || filter === 'route' && (trip.phase === 'driving' || trip.phase === 'approaching')
      || filter === 'receiver' && trip.phase === 'waiting'
      || filter === 'alert' && alerted.has(trip.id);
    const text = `${trip.plate} ${driverName(trip, t)} ${receiverById(trip.receiverId).name} ${trip.backend?.invoiceNumber ?? ''}`.toLocaleLowerCase(locale);
    return matches && (!normalized || text.includes(normalized));
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const rangeStart = rows.length ? currentPage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, rows.length);

  return (
    <section className="mon-panel mon-grid" aria-labelledby="mon-grid-title">
      <header className="mon-panel-heading">
        <div className="mon-grid-title"><h2 id="mon-grid-title">{t('monitoring.grid.title')}</h2><p>{t('monitoring.grid.count', { shown: rows.length, total: trips.length })}</p></div>
        <div className="mon-grid-tools">
          <div className="mon-segmented" role="group" aria-label={t('monitoring.grid.title')}>
            {FILTERS.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setPage(0); }}>{t(`monitoring.grid.filters.${item}`)}</button>)}
          </div>
          <label className="mon-search"><span className="sr-only">{t('monitoring.grid.search')}</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={t('monitoring.grid.search')} /></label>
        </div>
      </header>
      <div className="mon-table-wrap">
        <table className="mon-table">
          <thead>
            <tr>{(['plate', 'driver', 'status', 'receiver', 'eta', 'signal'] as const).map((column) => <th key={column} scope="col">{t(`monitoring.grid.columns.${column}`)}</th>)}</tr>
          </thead>
          <tbody data-has-selection={Boolean(selectedTripId)}>
            {!rows.length && <tr><td colSpan={6} className="mon-empty">{t('monitoring.grid.empty')}</td></tr>}
            {visibleRows.map((trip) => {
              const wait = waitMinutes(trip, simMinutes);
              const eta = etaMinutes(trip);
              const signal = signalAgeMinutes(trip, Date.now());
              const timing = trip.phase === 'cancelled' ? t('monitoring.grid.cancelled') : trip.phase === 'unloaded' ? t('monitoring.grid.unloaded')
                : trip.phase === 'waiting' ? wait === null ? '—' : t('monitoring.grid.waiting', { time: hhmm(wait, locale) })
                  : eta === null ? '—' : clock(simMinutes + eta);
              const selected = trip.id === selectedTripId;
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: onClick é um alvo extra para mouse; o botão da placa já cobre a mesma ação pelo teclado.
                <tr key={trip.id} data-selected={selected} aria-selected={selected} onClick={() => onSelect(trip.id)}>
                  <th scope="row"><button type="button" className="mon-plate" onClick={(event) => { event.stopPropagation(); onSelect(trip.id); }}>{trip.plate}</button></th>
                  <td><span>{driverName(trip, t)}</span>{selected && <span className="mon-focus-badge">{t('monitoring.selection.focus')}</span>}</td>
                  <td><span className="mon-status" data-tone={alerted.has(trip.id) ? 'alert' : phaseTone[trip.phase]}>{statusLabel(trip, t)}</span></td>
                  <td>{receiverById(trip.receiverId).name}</td>
                  <td className="mon-mono">{timing}</td>
                  <td className="mon-mono">{trip.source === 'api' ? signal === null ? '—' : `${Math.round(signal * 60)} s` : t('monitoring.vehicle.signalLive')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav className="mon-pagination" aria-label={t('monitoring.grid.paginationLabel')}>
        <span>{t('monitoring.grid.paginationRange', { from: rangeStart, to: rangeEnd, total: rows.length })}</span>
        <div>
          <button type="button" className="mon-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('monitoring.grid.previous')}</button>
          <span aria-live="polite">{t('monitoring.grid.page', { page: currentPage + 1, pages: pageCount })}</span>
          <button type="button" className="mon-button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t('monitoring.grid.next')}</button>
        </div>
      </nav>
    </section>
  );
}
