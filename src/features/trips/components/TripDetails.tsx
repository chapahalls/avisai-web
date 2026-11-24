import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { APP_ROUTES } from '../../../lib/routes';
import { confirmUnload, receiverById, useConnection, useOps } from '../../../services/operations';
import { brl, clock, hhmm } from '../../../utils/format';
import { stayValue } from '../../../utils/stay';
import { useDriverHistory } from '../hooks/useDriverHistory';
import { useTrip } from '../hooks/useTrip';
import { confirmedDock, tripStops } from '../model';
import { DriverChat } from './DriverChat';
import { TripDossier } from './TripDossier';
import { TripTimeline } from './TripTimeline';
import './trips.css';

/** Motorista e viagem (mockup 06-motorista-e-viagem). */
export function TripDetails({ tripId, route }: { tripId: string; route?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const { trip, receiver, waited } = useTrip(tripId);
  const connection = useConnection();
  const calls = useOps((state) => state.calls);
  const feed = useOps((state) => state.feed);
  const simMinutes = useOps((state) => state.simMinutes);
  const history = useDriverHistory(trip?.driver ?? null);

  if (!trip || !receiver) {
    return (
      <div className="trv-card trv-gone">
        <h1>{t(connection.mode === 'api' ? connection.status === 'connecting' ? 'api.connection.loading' : 'api.trip.unavailable' : 'trip.gone')}</h1>
        <p>{t(connection.mode === 'api' ? 'api.trip.unavailableHint' : 'trip.goneHint')}</p>
        <Link className="trv-button" data-variant="primary" to={APP_ROUTES.dashboard}>{t('trip.back')}</Link>
      </div>
    );
  }

  const isApi = trip.source === 'api';
  const driverName = isApi ? trip.driver : t('drivers.name', { letter: trip.driver.slice(-1) });
  const status = isApi && trip.backend ? t(`api.routeStatus.${trip.backend.status}`, { defaultValue: trip.backend.status }) : t(`phase.${trip.phase}`);
  const waitMin = isApi ? trip.stay?.waitMin : trip.arrivedAtMin === undefined ? undefined : waited;
  const stay = isApi ? trip.stay?.valueBRL : waitMin === undefined ? undefined : stayValue(waitMin, trip.capacityTons);
  const dock = confirmedDock(calls, trip.id);
  const origin = trip.backend?.originName ?? t('dossier.origin');
  const occurrenceMinutes = feed.filter((event) => event.tripId === trip.id && event.type === 'OccurrenceCreated').map((event) => event.simMin);
  const stops = tripStops(trip, simMinutes, occurrenceMinutes);
  const pendingUnload = connection.pendingUnloadIds.includes(trip.id);
  const tone = trip.phase === 'waiting' ? waitMin !== undefined && waitMin > BUSINESS.franchiseHours * 60 ? 'alert' : 'wait' : trip.phase === 'unloaded' ? 'muted' : 'ok';
  const positionAge = trip.lastPositionAt ? (Date.now() - new Date(trip.lastPositionAt).getTime()) / 60_000 : null;
  const position = !isApi ? t('tripView.driver.positionLive')
    : trip.positionKnown === false || positionAge === null ? t('tripView.driver.positionMissing')
      : t('tripView.driver.positionAge', { source: trip.positionSource ? t(`api.positionSources.${trip.positionSource}`) : 'GPS', time: hhmm(positionAge, locale) });

  const driverRows: [string, string][] = [
    [t('tripView.driver.vehicle'), t('tripView.driver.vehicleValue', { plate: trip.plate, tons: trip.backend?.cargoTons ?? trip.capacityTons })],
    [t('tripView.driver.receiver'), receiver.name],
    ...(trip.backend?.receiverContact ? [[t('tripView.driver.contact'), trip.backend.receiverContact] as [string, string]] : []),
    [t('tripView.driver.notified'), t(trip.notifiedBeforeArrival ? 'tripView.driver.yes' : 'tripView.driver.no')],
    [t('tripView.driver.position'), position],
    [t('tripView.driver.wait'), waitMin === undefined ? '—' : hhmm(waitMin, locale)],
    [t('tripView.driver.stay'), stay === undefined || stay === 0 ? '—' : brl(stay, locale)],
  ];
  const stoppedTotal = stops.reduce((total, stop) => total + (stop.durationMin ?? 0), 0);

  return (
    <div className="trv">
      <header className="trv-header">
        <div>
          <Link to={APP_ROUTES.dashboard} className="trv-back">← {t('tripView.back')}</Link>
          <h1>{driverName} <span className="trv-plate">{trip.plate}</span> <span className="trv-pill" data-tone={tone}>{waitMin !== undefined && trip.phase === 'waiting' ? t('tripView.statusWaiting', { status, time: hhmm(waitMin, locale) }) : status}</span></h1>
          <p>
            {t('tripView.subtitle', { id: trip.backendId ? `#${trip.backendId}` : trip.id, origin, receiver: receiver.name })}
            {dock ? ` · ${t('tripView.dock', { dock: dock.dock ?? '—', time: clock(dock.atMin) })}` : ''}
          </p>
        </div>
        <div className="trv-actions">
          {isApi && trip.phase === 'waiting' && (
            <button type="button" className="trv-button" data-variant="primary" onClick={() => void confirmUnload(trip.id)} disabled={pendingUnload || connection.status !== 'connected'} aria-busy={pendingUnload}>
              {t(pendingUnload ? 'tripView.actions.unloading' : 'tripView.actions.unload')}
            </button>
          )}
          <a className="trv-button" href="#trv-map">{t('tripView.actions.map')}</a>
        </div>
        {connection.actionError && <p role="alert" className="trv-error">{t('api.actions.failed')} {connection.actionError}</p>}
      </header>

      <div className="trv-layout">
        <aside className="trv-left">
          <section className="trv-card" aria-labelledby="trv-driver-title">
            <h2 id="trv-driver-title">{t('tripView.driver.title')}</h2>
            <dl className="trv-rows">{driverRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </section>
          <section className="trv-card" aria-labelledby="trv-history-title">
            <header className="trv-card-heading">
              <h2 id="trv-history-title">{t('tripView.history.title')}</h2>
              {history.stats && <span>{t('tripView.history.trips', { count: history.stats.trips })}</span>}
            </header>
            {isApi ? <p className="trv-empty">{t('tripView.history.api')}</p> : !history.stats ? <p className="trv-empty">{t('tripView.history.empty')}</p> : (
              <dl className="trv-tiles">
                <div><dt>{t('tripView.history.tripsLabel')}</dt><dd>{history.stats.trips}</dd></div>
                <div><dt>{t('tripView.history.notified')}</dt><dd data-tone="ok">{history.stats.notifiedRate === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent' }).format(history.stats.notifiedRate)}</dd></div>
                <div><dt>{t('tripView.history.escalations')}</dt><dd data-tone="wait">{history.stats.escalations}</dd></div>
                <div><dt>{t('tripView.history.occurrences')}</dt><dd data-tone="alert">{history.stats.occurrences}</dd></div>
                <div><dt>{t('tripView.history.avgWait')}</dt><dd>{history.stats.avgWaitMin === null ? '—' : hhmm(history.stats.avgWaitMin, locale)}</dd></div>
                <div><dt>{t('tripView.history.stay')}</dt><dd>{brl(history.stats.stayDue, locale)}</dd></div>
              </dl>
            )}
          </section>
        </aside>

        <div className="trv-center">
          <section className="trv-card trv-flush" aria-labelledby="trv-stops-title">
            <header className="trv-card-heading">
              <h2 id="trv-stops-title">{t('tripView.stops.title')}</h2>
              <span>{t('tripView.stops.summary', { count: stops.length, time: hhmm(stoppedTotal, locale) })}</span>
            </header>
            <div className="trv-table-wrap">
              <table className="trv-table">
                <thead><tr>{(['place', 'start', 'duration', 'type', 'reason'] as const).map((column) => <th key={column} scope="col">{t(`tripView.stops.columns.${column}`)}</th>)}</tr></thead>
                <tbody>
                  {stops.map((stop) => (
                    <tr key={stop.key}>
                      <th scope="row">{stop.kind === 'origin' ? origin : receiver.name}</th>
                      <td className="trv-mono">{stop.startMin === null ? '—' : clock(stop.startMin)}</td>
                      <td className="trv-mono">{stop.durationMin === null ? '—' : hhmm(stop.durationMin, locale)}</td>
                      <td><span className="trv-tag" data-kind={stop.kind}>{t(`tripView.stops.kinds.${stop.kind}`)}</span></td>
                      <td>{t(`tripView.stops.reasons.${stop.kind === 'receiver' ? stop.done ? 'receiverDone' : 'receiverWaiting' : stop.kind}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <TripTimeline tripId={trip.id} />
          <section id="trv-map" className="trv-map" aria-label={t('tripView.map')}>{route}</section>
          <TripDossier tripId={trip.id} />
        </div>

        <aside className="trv-right">
          <DriverChat routeId={trip.backendId} driverName={driverName} stopped={trip.phase === 'waiting' || trip.phase === 'unloaded' || ['publicada', 'planejada', 'na_origem'].includes(trip.backend?.status ?? '')} />
        </aside>
      </div>
    </div>
  );
}

