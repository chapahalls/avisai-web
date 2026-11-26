import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SIMULATION } from '../../../lib/config';
import { receiverById, useOps } from '../../../services/operations';
import { dockWindows } from '../model';

const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const span = DAY_END - DAY_START;
const position = (minute: number) => `${Math.min(100, Math.max(0, ((minute - DAY_START) / span) * 100))}%`;

/** Agenda de docas do dia por recebedor, com a linha do "agora". */
export function DockWindows({ onSelect, onlyTripId }: { onSelect: (tripId: string) => void; onlyTripId?: string }) {
  const { t, i18n } = useTranslation();
  const { trips: allTrips, calls: allCalls, simMinutes } = useOps();
  const trips = onlyTripId ? allTrips.filter((trip) => trip.id === onlyTripId) : allTrips;
  const calls = onlyTripId ? allCalls.filter((call) => call.tripId === onlyTripId) : allCalls;
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const normalized = query.trim().toLocaleLowerCase(locale);
  const rows = dockWindows({ trips, calls, simMinutes }).map((row) => {
    const laneEnds: number[] = [];
    const bars = row.bars.map((bar) => {
      let lane = laneEnds.findIndex((end) => bar.start >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(bar.end);
      } else {
        laneEnds[lane] = bar.end;
      }
      return { ...bar, lane };
    });
    return { ...row, bars, laneCount: Math.max(laneEnds.length, 1) };
  }).filter((row) => {
    const text = `${receiverById(row.receiverId).name} ${row.bars.map((bar) => bar.plate).join(' ')}`.toLocaleLowerCase(locale);
    return !normalized || text.includes(normalized);
  });
  const now = SIMULATION.startHour * 60 + simMinutes;
  const ticks = Array.from({ length: 9 }, (_, index) => DAY_START + index * 120);
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const rangeStart = rows.length ? currentPage * pageSize + 1 : 0;
  const rangeEnd = Math.min((currentPage + 1) * pageSize, rows.length);

  return (
    <section className="mon-panel mon-docks" aria-labelledby="mon-docks-title">
      <header className="mon-panel-heading">
        <div className="mon-grid-title"><h2 id="mon-docks-title">{t('monitoring.docks.title')}</h2><p>{t('monitoring.docks.subtitle')}</p></div>
        <div className="mon-docks-tools">
          <label className="mon-search"><span className="sr-only">{t('monitoring.docks.search')}</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={t('monitoring.docks.search')} /></label>
          <ul className="mon-legend">
            {(['waiting', 'unloaded', 'planned'] as const).map((kind) => <li key={kind}><i data-kind={kind} aria-hidden="true" />{t(`monitoring.docks.legend.${kind}`)}</li>)}
          </ul>
        </div>
      </header>
      {!rows.length ? <p className="mon-empty">{t(normalized ? 'monitoring.docks.noResults' : 'monitoring.docks.empty')}</p> : (
        <div className="mon-dock-scroll">
          <div className="mon-dock-chart" style={{ '--now': position(now) } as CSSProperties}>
            <div className="mon-dock-axis" aria-hidden="true">
              <span />
              <div>{ticks.map((tick) => <b key={tick} style={{ left: position(tick) }}>{`${String(tick / 60).padStart(2, '0')}h`}</b>)}</div>
            </div>
            {visibleRows.map((row) => (
              <div key={row.receiverId} className="mon-dock-row" style={{ '--dock-lanes': row.laneCount } as CSSProperties}>
                <span className="mon-dock-name">{receiverById(row.receiverId).name}</span>
                <div className="mon-dock-track" style={{ height: `${row.laneCount * 26}px` }}>
                  {row.bars.map((bar) => {
                    const kind = t(`monitoring.docks.kinds.${bar.kind}`);
                    const label = bar.dock !== undefined ? t('monitoring.docks.barDock', { plate: bar.plate, dock: bar.dock }) : t('monitoring.docks.bar', { plate: bar.plate, kind });
                    return (
                      <button key={bar.tripId} type="button" className="mon-dock-bar" data-kind={bar.kind}
                        style={{ top: `${bar.lane * 26 + 2}px`, bottom: 'auto', height: '22px', left: position(bar.start), width: `calc(${position(bar.end)} - ${position(bar.start)})` }}
                        title={`${label} · ${kind}`} aria-label={`${label} · ${kind}`} onClick={() => onSelect(bar.tripId)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <span className="mon-dock-now" aria-label={t('monitoring.docks.now')} />
          </div>
          <nav className="mon-pagination" aria-label={t('monitoring.grid.paginationLabel')}>
            <span>{t('monitoring.grid.paginationRange', { from: rangeStart, to: rangeEnd, total: rows.length })}</span>
            <div>
              <button type="button" className="mon-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('monitoring.grid.previous')}</button>
              <span aria-live="polite">{t('monitoring.grid.page', { page: currentPage + 1, pages: pageCount })}</span>
              <button type="button" className="mon-button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t('monitoring.grid.next')}</button>
            </div>
          </nav>
        </div>
      )}
    </section>
  );
}
