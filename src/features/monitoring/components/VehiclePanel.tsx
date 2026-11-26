import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import { BUSINESS, SIMULATION } from '../../../lib/config';
import { APP_ROUTES } from '../../../lib/routes';
import { receiverById, useOps } from '../../../services/operations';
import { brl, clock, hhmm } from '../../../utils/format';
import { stayValue } from '../../../utils/stay';
import { etaMinutes, latestCall, signalAgeMinutes, waitMinutes } from '../model';
import { driverName, phaseTone, statusLabel } from './labels';

/** Painel do veículo selecionado: estado, carga, ETA/espera e estadia. */
export function VehiclePanel({ tripId, onClose }: { tripId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const trip = useOps((state) => state.trips.find((item) => item.id === tripId));
  const simMinutes = useOps((state) => state.simMinutes);
  const calls = useOps((state) => state.calls);
  if (!trip) {
    return <section className="mon-panel mon-vehicle"><p className="mon-empty">{t('monitoring.vehicle.empty')}</p></section>;
  }
  const receiver = receiverById(trip.receiverId);
  const wait = waitMinutes(trip, simMinutes);
  const eta = etaMinutes(trip);
  const moving = trip.phase === 'driving' || trip.phase === 'approaching';
  // Velocidade só existe na simulação; a API não envia telemetria de velocidade.
  const speed = trip.source === 'api' ? null : moving ? SIMULATION.speedKmh : 0;
  const signal = signalAgeMinutes(trip, Date.now());
  // API: estadia vem do backend; Demo: regra local de src/utils/stay.ts.
  const stay = trip.source === 'api' ? trip.stay?.valueBRL ?? null : wait === null ? null : stayValue(wait, trip.capacityTons);
  const call = latestCall(calls, trip.id);
  const etaText = trip.phase === 'cancelled' ? t('monitoring.grid.cancelled')
    : trip.phase === 'unloaded'
    ? t('monitoring.grid.unloaded')
    : trip.phase === 'waiting'
      ? wait === null ? '—' : t('monitoring.grid.waiting', { time: hhmm(wait, locale) })
      : eta === null ? '—' : t('monitoring.grid.eta', { time: clock(simMinutes + eta) });
  const notice = call?.resultCode === 'dock_confirmed'
    ? t('monitoring.grid.noticeConfirmed', { dock: call.dock ?? '—' })
    : trip.notifiedBeforeArrival ? t('monitoring.grid.noticeNotified') : t('monitoring.grid.noticePending');
  const rows = [
    [t('monitoring.vehicle.receiver'), receiver.name],
    [t('monitoring.vehicle.cargo'), `${t('monitoring.vehicle.cargoValue', { tons: trip.backend?.cargoTons ?? trip.capacityTons })}${trip.backend?.invoiceNumber ? ` · NF ${trip.backend.invoiceNumber}` : ''}`],
    [t('monitoring.vehicle.eta'), etaText],
    [t('monitoring.vehicle.notified'), notice],
    [t('monitoring.vehicle.stay'), stay === null || stay === 0 ? '—' : brl(stay, locale)],
  ];

  return (
    <section className="mon-panel mon-vehicle" aria-labelledby="mon-vehicle-plate">
      <header className="mon-vehicle-heading">
        <div>
          <p className="mon-eyebrow">{t('monitoring.vehicle.eyebrow')}</p>
          <h2 id="mon-vehicle-plate" aria-live="polite">{trip.plate}</h2>
          <p>{driverName(trip, t)} · {receiver.name}</p>
        </div>
        <div className="mon-vehicle-controls">
          <span className="mon-status" data-tone={phaseTone[trip.phase]}>{statusLabel(trip, t)}</span>
          <button type="button" className="mon-panel-toggle" aria-expanded={expanded} aria-controls="mon-vehicle-details" aria-label={t(expanded ? 'monitoring.vehicle.collapse' : 'monitoring.vehicle.expand')} onClick={() => setExpanded((value) => !value)}>
            <Icon name="chevron" className={`h-3.5 w-3.5${expanded ? ' is-expanded' : ''}`} />
          </button>
          <button type="button" className="mon-panel-close" aria-label={t('monitoring.vehicle.close')} onClick={onClose}>×</button>
        </div>
      </header>
      <div id="mon-vehicle-details" className="mon-vehicle-details" hidden={!expanded}>
        <dl className="mon-vehicle-stats">
          <div><dt>{t('monitoring.vehicle.speed')}</dt><dd>{speed === null ? '—' : `${speed} km/h`}</dd></div>
          <div><dt>{t('monitoring.vehicle.progress')}</dt><dd>{Math.round(trip.progress * 100)}%</dd></div>
          <div><dt>{t('monitoring.vehicle.signal')}</dt><dd>{trip.source === 'api' ? signal === null ? '—' : `${Math.round(signal * 60)} s` : t('monitoring.vehicle.signalLive')}</dd></div>
        </dl>
        <dl className="mon-vehicle-rows">
          {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {trip.phase === 'waiting' && wait !== null && (
          <div className="mon-franchise" aria-label={t('monitoring.kpis.avgWaitHint', { hours: BUSINESS.franchiseHours })}>
            <span style={{ width: `${Math.min(100, (wait / (BUSINESS.franchiseHours * 60)) * 100)}%` }} data-over={wait > BUSINESS.franchiseHours * 60} />
          </div>
        )}
        <div className="mon-vehicle-actions">
          <Link className="mon-button" data-variant="primary" to={APP_ROUTES.trip(trip.id)}>{t('monitoring.vehicle.openTrip')}</Link>
          <Link className="mon-button" to={APP_ROUTES.dispatch}>{t('monitoring.vehicle.dispatch')}</Link>
        </div>
      </div>
    </section>
  );
}
