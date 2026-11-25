import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { APP_ROUTES } from '../../../lib/routes';
import { confirmUnload, receiverById, useConnection } from '../../../services/operations';
import { brl, hhmm } from '../../../utils/format';
import { stayValue } from '../../../utils/stay';
import { useDriverHistory } from '../hooks/useDriverHistory';
import { useTrip } from '../hooks/useTrip';
import { TripDossier } from './TripDossier';
import { TripTimeline } from './TripTimeline';
import './trips.css';

/** Motorista e viagem (mockup 06-motorista-e-viagem). */
export function TripDetails({ tripId, route }: { tripId: string; route?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const { trip, receiver, waited } = useTrip(tripId);
  const connection = useConnection();
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
  const pendingUnload = connection.pendingUnloadIds.includes(trip.id);
  const tone = trip.phase === 'waiting' ? waitMin !== undefined && waitMin > BUSINESS.franchiseHours * 60 ? 'alert' : 'wait' : trip.phase === 'unloaded' ? 'muted' : 'ok';
  const positionAge = trip.lastPositionAt ? (Date.now() - new Date(trip.lastPositionAt).getTime()) / 60_000 : null;
  const position = !isApi ? t('tripView.driver.positionLive')
    : trip.positionKnown === false || positionAge === null ? t('tripView.driver.positionMissing')
      : t('tripView.driver.positionAge', { source: trip.positionSource ? t(`api.positionSources.${trip.positionSource}`) : 'GPS', time: hhmm(positionAge, locale) });

  const driverRows: [string, string][] = [
    [t('tripView.driver.receiver'), receiver.name],
    ...(trip.backend?.receiverContact ? [[t('tripView.driver.contact'), trip.backend.receiverContact] as [string, string]] : []),
    [t('tripView.driver.notified'), t(trip.notifiedBeforeArrival ? 'tripView.driver.yes' : 'tripView.driver.no')],
    [t('tripView.driver.position'), position],
    [t('tripView.driver.wait'), waitMin === undefined ? '—' : hhmm(waitMin, locale)],
    [t('tripView.driver.stay'), stay === undefined || stay === 0 ? '—' : brl(stay, locale)],
  ];
  return (
    <div className="trv">
      <header className="trv-header">
        <div>
          <Link to={APP_ROUTES.dashboard} className="trv-back">← {t('tripView.back')}</Link>
          <h1>{driverName} <span className="trv-plate">{trip.plate}</span> <span className="trv-pill" data-tone={tone}>{waitMin !== undefined && trip.phase === 'waiting' ? t('tripView.statusWaiting', { status, time: hhmm(waitMin, locale) }) : status}</span></h1>
        </div>
        {isApi && trip.phase === 'waiting' && <div className="trv-actions">
          <button type="button" className="trv-button" data-variant="primary" onClick={() => void confirmUnload(trip.id)} disabled={pendingUnload || connection.status !== 'connected'} aria-busy={pendingUnload}>
            {t(pendingUnload ? 'tripView.actions.unloading' : 'tripView.actions.unload')}
          </button>
        </div>}
        {connection.actionError && <p role="alert" className="trv-error">{t('api.actions.failed')} {connection.actionError}</p>}
      </header>

      <div className="trv-layout">
        <section className="trv-card trv-driver" aria-labelledby="trv-driver-title">
          <h2 id="trv-driver-title">{t('tripView.driver.title')}</h2>
          <dl className="trv-rows">{driverRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </section>
        <section className="trv-card trv-history" aria-labelledby="trv-history-title">
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
        <section id="trv-map" className="trv-map" aria-label={t('tripView.map')}>{route}</section>
        <div className="trv-dossier"><TripDossier tripId={trip.id} /></div>

        <aside className="trv-right">
          <TripTimeline tripId={trip.id} />
        </aside>
      </div>
    </div>
  );
}

