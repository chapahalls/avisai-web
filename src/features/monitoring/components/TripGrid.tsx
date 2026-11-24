import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { receiverById, useOps } from '../../../services/operations';
import { brl, clock, hhmm } from '../../../utils/format';
import { stayValue } from '../../../utils/stay';
import { deriveAlerts, etaMinutes, latestCall, signalAgeMinutes, waitMinutes } from '../model';
import { driverName, phaseTone, statusLabel } from './labels';

const FILTERS = ['all', 'route', 'receiver', 'alert'] as const;
type Filter = (typeof FILTERS)[number];

/** Grade de viagens com filtros e busca; clicar seleciona o veículo no painel. */
export function TripGrid({ selectedTripId, onSelect }: { selectedTripId: string | null; onSelect: (tripId: string) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const { trips, tasks, calls, simMinutes } = useOps();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const alerted = new Set(deriveAlerts({ trips, tasks, simMinutes }).map((alert) => alert.tripId));
  const franchise = BUSINESS.franchiseHours * 60;
  const normalized = query.trim().toLocaleLowerCase(locale);
  const rows = trips.filter((trip) => {
    const matches = filter === 'all'
      || filter === 'route' && (trip.phase === 'driving' || trip.phase === 'approaching')
      || filter === 'receiver' && trip.phase === 'waiting'
      || filter === 'alert' && alerted.has(trip.id);
    const text = `${trip.plate} ${driverName(trip, t)} ${receiverById(trip.receiverId).name} ${trip.backend?.invoiceNumber ?? ''}`.toLocaleLowerCase(locale);
    return matches && (!normalized || text.includes(normalized));
  });

  return (
    <section className="mon-panel mon-grid" aria-labelledby="mon-grid-title">
      <header className="mon-panel-heading">
        <div className="mon-grid-title"><h2 id="mon-grid-title">{t('monitoring.grid.title')}</h2><p>{t('monitoring.grid.count', { shown: rows.length, total: trips.length })}</p></div>
        <div className="mon-grid-tools">
          <div className="mon-segmented" role="group" aria-label={t('monitoring.grid.title')}>
            {FILTERS.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{t(`monitoring.grid.filters.${item}`)}</button>)}
          </div>
          <label className="mon-search"><span className="sr-only">{t('monitoring.grid.search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('monitoring.grid.search')} /></label>
        </div>
      </header>
      <div className="mon-table-wrap">
        <table className="mon-table">
          <thead>
            <tr>{(['plate', 'driver', 'status', 'receiver', 'eta', 'notice', 'stay', 'signal'] as const).map((column) => <th key={column} scope="col">{t(`monitoring.grid.columns.${column}`)}</th>)}</tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={8} className="mon-empty">{t('monitoring.grid.empty')}</td></tr>}
            {rows.map((trip) => {
              const wait = waitMinutes(trip, simMinutes);
              const eta = etaMinutes(trip);
              const call = latestCall(calls, trip.id);
              const signal = signalAgeMinutes(trip, Date.now());
              const stay = trip.source === 'api' ? trip.stay?.valueBRL ?? null : wait === null ? null : stayValue(wait, trip.capacityTons);
              const timing = trip.phase === 'unloaded' ? t('monitoring.grid.unloaded')
                : trip.phase === 'waiting' ? wait === null ? '—' : t('monitoring.grid.waiting', { time: hhmm(wait, locale) })
                  : eta === null ? '—' : clock(simMinutes + eta);
              const notice = call?.resultCode === 'dock_confirmed' ? { tone: 'ok', text: t('monitoring.grid.noticeConfirmed', { dock: call.dock ?? '—' }) }
                : call?.resultCode === 'next_day' ? { tone: 'wait', text: t('monitoring.grid.noticeNextDay') }
                  : call?.resultCode === 'no_answer' ? { tone: 'alert', text: t('monitoring.grid.noticeNoAnswer') }
                    : trip.notifiedBeforeArrival ? { tone: 'ok', text: t('monitoring.grid.noticeNotified') }
                      : { tone: 'muted', text: t('monitoring.grid.noticePending') };
              const stayText = stay ? brl(stay, locale)
                : trip.phase === 'waiting' && wait !== null && wait < franchise ? t('monitoring.grid.franchiseLeft', { time: hhmm(franchise - wait, locale) }) : '—';
              const selected = trip.id === selectedTripId;
              return (
                <tr key={trip.id} data-selected={selected} aria-selected={selected} onClick={() => onSelect(trip.id)}>
                  <th scope="row"><button type="button" className="mon-plate" onClick={(event) => { event.stopPropagation(); onSelect(trip.id); }}>{trip.plate}</button></th>
                  <td>{driverName(trip, t)}</td>
                  <td><span className="mon-status" data-tone={alerted.has(trip.id) ? 'alert' : phaseTone[trip.phase]}>{statusLabel(trip, t)}</span></td>
                  <td>{receiverById(trip.receiverId).name}</td>
                  <td className="mon-mono">{timing}</td>
                  <td data-tone={notice.tone}>{notice.text}</td>
                  <td>{stayText}</td>
                  <td className="mon-mono">{trip.source === 'api' ? signal === null ? '—' : `${Math.round(signal * 60)} s` : t('monitoring.vehicle.signalLive')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
