import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/Badge';
import { Icon } from '../../../components/Icon';
import { PageHeader } from '../../../components/PageHeader';
import { CallLogList } from '../../calls';
import { brl, hhmm } from '../../../utils/format';
import { BUSINESS } from '../../../lib/config';
import { confirmUnload, useConnection } from '../../../services/operations';
import { useTrip } from '../hooks/useTrip';
import { EventFeed } from './EventFeed';
import { TripDossier } from './TripDossier';

export function TripDetails({ tripId, route }: { tripId: string; route?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { trip, receiver, waited } = useTrip(tripId);
  const connection = useConnection();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  if (!trip || !receiver) {
    return (
      <div className="rounded-card border border-ink-700 bg-ink-900 p-8">
        <h1 className="font-display text-2xl font-semibold">{t(connection.mode === 'api' ? connection.status === 'connecting' ? 'api.connection.loading' : 'api.trip.unavailable' : 'trip.gone')}</h1>
        <p className="my-3 text-sm text-ink-300">{t(connection.mode === 'api' ? 'api.trip.unavailableHint' : 'trip.goneHint')}</p>
        <Link className="inline-block rounded-input bg-brand-500 px-4 py-2.5 text-sm font-semibold" to="/">{t('trip.back')}</Link>
      </div>
    );
  }
  const isApi = trip.source === 'api';
  const waitMin = isApi ? trip.stay?.waitMin : waited;
  const franchiseHours = isApi ? trip.stay?.franchiseHours : BUSINESS.franchiseHours;
  const pendingUnload = connection.pendingUnloadIds.includes(trip.id);
  return (
    <>
      <Link to="/" className="inline-block text-sm text-brand-500 hover:underline">{t('trip.back')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title={trip.plate} eyebrow={t(isApi ? 'api.trip.eyebrow' : 'trip.eyebrow')} description={t('trip.route', { driver: isApi ? trip.driver : t('drivers.name', { letter: trip.driver.slice(-1) }), receiver: receiver.name })} />
        <Badge tone={trip.phase === 'waiting' ? 'wait' : trip.phase === 'unloaded' ? 'ok' : 'brand'} label={isApi && trip.backend ? t(`api.routeStatus.${trip.backend.status}`, { defaultValue: trip.backend.status }) : t(`phase.${trip.phase}`)} />
      </div>
      <div className={`grid gap-4 ${isApi ? 'sm:grid-cols-2' : ''}`}>
        <div className="rounded-card border border-ink-700 bg-ink-900 p-5">
          <p className="flex items-center gap-2 text-sm text-ink-300"><Icon name="clock" className="h-4 w-4" />{t('trip.stopped')}</p>
          <p className={`mt-3 font-display text-4xl font-semibold ${waitMin !== undefined && franchiseHours !== undefined && waitMin > franchiseHours * 60 ? 'text-wait-500' : 'text-ink-50'}`}>{waitMin === undefined ? t('common.unavailable') : hhmm(waitMin, locale)}</p>
          <p className="mt-3 text-sm text-ink-300">{trip.phase === 'unloaded' ? t('trip.clockStopped') : franchiseHours === undefined ? t('api.trip.stayUnavailable') : t(isApi ? 'api.trip.franchise' : 'trip.franchise', { hours: franchiseHours })}</p>
        </div>
        {isApi ? (
          <div className="rounded-card border border-ink-700 bg-ink-900 p-5">
            <p className="text-sm text-ink-300">{t('api.trip.detention')}</p>
            <p className="mt-3 font-display text-4xl font-semibold">
              {trip.stay?.valueBRL === undefined
                ? t('common.unavailable')
                : brl(trip.stay.valueBRL, locale)}
            </p>
            <p className="mt-3 text-sm text-ink-300">
              {trip.stay
                ? t('api.trip.calculationTons', {
                    tons: trip.stay.capacityTons.toLocaleString(locale),
                  })
                : t('api.trip.stayUnavailable')}
            </p>
          </div>
        ) : null}
      </div>
      {isApi && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink-700 bg-ink-900 p-4">
          <p className="text-sm text-ink-300">{t('api.trip.serverState')} {trip.backend ? t(`api.routeStatus.${trip.backend.status}`, { defaultValue: trip.backend.status }) : t(`phase.${trip.phase}`)}</p>
          {trip.phase === 'waiting' && <button type="button" onClick={() => void confirmUnload(trip.id)} disabled={pendingUnload || connection.status !== 'connected'} aria-busy={pendingUnload} className="rounded-input bg-brand-500 px-4 py-2.5 text-sm font-semibold transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-50">{t(pendingUnload ? 'api.actions.confirmingUnload' : 'api.actions.confirmUnload')}</button>}
          {connection.actionError && <p role="alert" className="w-full text-sm text-alert-500">{t('api.actions.failed')} {connection.actionError}</p>}
        </div>
      )}
      {route}
      <TripDossier tripId={trip.id} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <EventFeed tripId={trip.id} limit={50} />
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold">{t('nav.calls')}</h2>
          <CallLogList tripId={trip.id} />
        </div>
      </div>
    </>
  );
}
