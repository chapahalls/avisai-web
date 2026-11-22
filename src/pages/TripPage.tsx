import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { receiverById, useOps } from '../services/mock/engine';
import { EventFeed } from '../features/trips';
import { CallLogList } from '../features/calls';
import { Badge } from '../components/Badge';
import { brl, hhmm } from '../utils/format';
import { stayValue } from '../utils/stay';

export function TripPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const trip = useOps((s) => s.trips.find((x) => x.id === id));
  const simMinutes = useOps((s) => s.simMinutes);
  if (!trip) {
    return (
      <p className="text-ink-300">
        {t('trip.gone')} <Link className="text-brand-500" to="/">{t('nav.dashboard')}</Link>
      </p>
    );
  }
  const waited = trip.arrivedAtMin !== undefined ? (trip.unloadedAtMin ?? simMinutes) - trip.arrivedAtMin : 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold">{trip.plate}</h1>
        <Badge tone={trip.phase === 'waiting' ? 'wait' : trip.phase === 'unloaded' ? 'ok' : 'brand'} label={t(`phase.${trip.phase}`)} />
        <span className="text-sm text-ink-300">{trip.driver} → {receiverById(trip.receiverId).name}</span>
      </div>
      {trip.arrivedAtMin !== undefined && (
        <div className="rounded-card border border-ink-700 bg-ink-900 p-4">
          <p className="text-sm text-ink-300">{t('trip.stopped')}</p>
          <p className="font-display text-4xl font-bold text-wait-500">{hhmm(waited)}</p>
          <p className="text-sm text-ink-300">{t('trip.stay', { value: brl(stayValue(waited, trip.capacityTons)), t: trip.capacityTons })}</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <EventFeed tripId={trip.id} limit={50} />
        <CallLogList tripId={trip.id} />
      </div>
    </>
  );
}
