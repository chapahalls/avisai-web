import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/Badge';
import type { Trip } from '../../../types/ops';
import { CallLogList } from '../../calls';
import { EventFeed } from './EventFeed';
import { RouteDocuments, RouteRequests } from './RouteResources';

const tabs = ['cargo', 'invoices', 'communications'] as const;
type DossierTab = typeof tabs[number];

/** Apresenta campos recebidos sem transformar uma referência de NF em documento fiscal. */
export function ApiTripDossier({ trip, compact, mockComplements }: { trip: Trip; compact: boolean; mockComplements: ReactNode }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const [activeTab, setActiveTab] = useState<DossierTab>('cargo');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const componentId = useId();
  const data = trip.backend;
  const display = (value: unknown) => typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(locale) : t('common.unavailable');
  const cargoTons = typeof data?.cargoTons === 'number' && Number.isFinite(data.cargoTons)
    ? t('api.dossier.tons', { tons: data.cargoTons.toLocaleString(locale) }) : t('common.unavailable');
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabs[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };
  const fields = [
    { key: 'origin', value: display(data?.originName) },
    { key: 'destination', value: display(data?.destinationName) },
    { key: 'driver', value: display(trip.driver) },
    { key: 'arrivalWindow', value: display(data?.arrivalWindow) },
    { key: 'receiverContact', value: display(data?.receiverContact) },
  ];
  return (
    <section className="min-w-0 overflow-hidden rounded-card border border-ink-700 bg-ink-900" aria-label={t('dossier.title')}>
      <header className={compact ? 'space-y-3 p-4' : 'space-y-3 p-5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t('dossier.title')}</h2>
          <Badge tone="brand" label={t('api.dossier.basicData')} />
        </div>
        <p className="text-xs leading-relaxed text-ink-300">{t('api.dossier.basicNotice')}</p>
        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-input border border-brand-500/20 bg-brand-500/5 p-3">
            <dt className="text-xs text-ink-300">{t('api.dossier.cargoWeight')}</dt>
            <dd className="mt-1 break-words font-display text-lg font-semibold text-brand-500">{cargoTons}</dd>
          </div>
          <div className="min-w-0 rounded-input border border-ink-700 bg-ink-950/40 p-3">
            <dt className="text-xs text-ink-300">{t('api.dossier.invoiceNumber')}</dt>
            <dd className="mt-1 break-words font-display text-base font-semibold">{display(data?.invoiceNumber)}</dd>
          </div>
        </dl>
      </header>
      <div role="tablist" aria-label={t('dossier.tabsLabel')} className="flex border-y border-ink-700 bg-ink-950/30">
        {tabs.map((tab, index) => <button key={tab} type="button" role="tab" ref={(element) => { tabRefs.current[index] = element; }}
          id={`${componentId}-tab-${tab}`} aria-controls={`${componentId}-panel-${tab}`} aria-selected={activeTab === tab}
          tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={(event) => handleTabKey(event, index)}
          className={`min-w-0 flex-1 break-words border-b-2 px-2 py-3 text-xs font-medium transition ${compact ? '' : 'sm:text-sm'} ${activeTab === tab ? 'border-brand-500 bg-brand-500/5 text-brand-500' : 'border-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-50'}`}>
          {t(`dossier.tabs.${tab}`)}
        </button>)}
      </div>
      <div key={`${trip.id}-${activeTab}`} role="tabpanel" id={`${componentId}-panel-${activeTab}`} aria-labelledby={`${componentId}-tab-${activeTab}`} tabIndex={0} className={compact ? 'space-y-4 p-4' : 'space-y-5 p-5'}>
        {activeTab === 'cargo' && <>
          <div className="rounded-input border border-ink-700 bg-ink-950/40 p-4">
            <h3 className="text-xs text-ink-300">{t('api.dossier.cargoDescription')}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{display(data?.cargoDescription)}</p>
          </div>
          <dl className="grid gap-4 text-sm">
            {fields.map((field) => <div key={field.key}><dt className="text-xs text-ink-300">{t(`api.dossier.${field.key}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{field.value}</dd></div>)}
          </dl>
        </>}
        {activeTab === 'invoices' && <article className="space-y-4 rounded-input border border-ink-700 bg-ink-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-semibold">{t('api.dossier.invoiceReference', { number: display(data?.invoiceNumber) })}</h3>
            <Badge tone="brand" label={t('api.dossier.receivedReference')} />
          </div>
          <p className="text-xs leading-relaxed text-ink-300">{t('api.dossier.invoiceNotice')}</p>
          <dl className="grid gap-4 text-sm">
            {fields.filter((field) => field.key === 'origin' || field.key === 'destination').map((field) => <div key={field.key}><dt className="text-xs text-ink-300">{t(`api.dossier.${field.key}`)}</dt><dd className="mt-1 break-words">{field.value}</dd></div>)}
          </dl>
          {trip.backendId && <RouteDocuments routeId={trip.backendId} />}
        </article>}
        {activeTab === 'communications' && <>
          <p className="text-xs leading-relaxed text-ink-300">{t('api.dossier.communicationsNotice')}</p>
          {trip.backendId && <RouteRequests key={trip.backendId} routeId={trip.backendId} />}
          <EventFeed tripId={trip.id} limit={50} />
          <CallLogList tripId={trip.id} />
        </>}
        {activeTab === 'cargo' && <details className="overflow-hidden rounded-input border border-dashed border-wait-500/40">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-wait-500">{t('api.dossier.mockComplements')}</summary>
          <div className="border-t border-wait-500/25 p-2">{mockComplements}</div>
        </details>}
      </div>
    </section>
  );
}
