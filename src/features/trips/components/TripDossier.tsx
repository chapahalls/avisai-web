import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/Badge';
import { buildTripCommunications, buildTripDossier } from '../../../services/mock/dossier';
import { receiverById, useOps } from '../../../services/operations';
import type { CargoItem } from '../../../types/dossier';
import { brl, clock } from '../../../utils/format';
import { ApiTripDossier } from './ApiTripDossier';

const tabs = ['cargo', 'invoices', 'communications'] as const;
const COMMUNICATIONS_PAGE_SIZE = 4;
type DossierTab = typeof tabs[number];

function CargoItemCard({ item, compact, showCommercialValues }: { item: CargoItem; compact: boolean; showCommercialValues: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const number = (value: number) => value.toLocaleString(locale);
  return (
    <li className="rounded-input border border-ink-700 bg-ink-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{t(item.descriptionKey)}</h3>
        <span className="shrink-0 font-display text-sm text-brand-500">{t('dossier.kg', { value: number(item.weightKg) })}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-300">{t('dossier.itemPackaging', { count: number(item.packageCount), weight: number(item.unitWeightKg) })}</p>
      {showCommercialValues && <div className={`mt-3 flex flex-wrap justify-between gap-2 border-t border-ink-700/70 pt-3 ${compact ? 'text-xs' : 'text-sm'}`}>
        <span className="text-ink-300">{t('dossier.itemUnitValue', { value: brl(item.unitValueBRL, locale) })}</span>
        <span className="font-display font-semibold">{brl(item.totalValueBRL, locale)}</span>
      </div>}
    </li>
  );
}

export function TripDossier({ tripId, compact = false, showCommercialValues = true }: { tripId: string; compact?: boolean; showCommercialValues?: boolean }) {
  const trip = useOps((state) => state.trips.find((candidate) => candidate.id === tripId));
  if (trip?.source === 'api') {
    return <ApiTripDossier key={trip.id} trip={trip} compact={compact} showCommercialValues={showCommercialValues} mockComplements={<MockTripDossier tripId={tripId} compact={compact} apiComplement showCommercialValues={showCommercialValues} />} />;
  }
  return <MockTripDossier tripId={tripId} compact={compact} showCommercialValues={showCommercialValues} />;
}

function MockTripDossier({ tripId, compact, apiComplement = false, showCommercialValues = true }: { tripId: string; compact: boolean; apiComplement?: boolean; showCommercialValues?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const trip = useOps((state) => state.trips.find((candidate) => candidate.id === tripId));
  const events = useOps((state) => state.feed);
  const simMinutes = useOps((state) => state.simMinutes);
  const [activeTab, setActiveTab] = useState<DossierTab>('cargo');
  const [communicationsPage, setCommunicationsPage] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const componentId = useId();
  const visibleTabs = apiComplement ? tabs.filter((tab) => tab !== 'communications') : tabs;
  const dossier = useMemo(() => trip ? buildTripDossier(apiComplement ? { ...trip, id: `complement-${trip.id}`, capacityTons: 14, receiverId: 'r1' } : trip) : undefined, [trip?.id, trip?.capacityTons, trip?.receiverId, apiComplement]);
  const communications = useMemo(() => trip && !apiComplement ? buildTripCommunications(trip, events, simMinutes) : [], [trip, events, simMinutes, apiComplement]);
  const communicationsPageCount = Math.max(1, Math.ceil(communications.length / COMMUNICATIONS_PAGE_SIZE));
  const currentCommunicationsPage = Math.min(communicationsPage, communicationsPageCount - 1);
  const visibleCommunications = communications.slice(
    currentCommunicationsPage * COMMUNICATIONS_PAGE_SIZE,
    (currentCommunicationsPage + 1) * COMMUNICATIONS_PAGE_SIZE,
  );
  const communicationsRangeStart = communications.length ? currentCommunicationsPage * COMMUNICATIONS_PAGE_SIZE + 1 : 0;
  const communicationsRangeEnd = Math.min((currentCommunicationsPage + 1) * COMMUNICATIONS_PAGE_SIZE, communications.length);
  useEffect(() => { setActiveTab('cargo'); setCommunicationsPage(0); }, [tripId]);
  const number = (value: number) => value.toLocaleString(locale);
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % visibleTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index + visibleTabs.length - 1) % visibleTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleTabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(visibleTabs[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };
  if (!trip || !dossier) return <p role="status" className="p-5 text-sm text-ink-300">{t('dossier.gone')}</p>;
  const receiver = apiComplement ? { name: t('api.dossier.mockReceiver') } : receiverById(trip.receiverId);
  const title = t(apiComplement ? 'api.dossier.mockComplements' : 'dossier.title');
  return (
    <section className={`min-w-0 overflow-hidden rounded-card border border-ink-700 bg-ink-900 ${compact ? '' : 'shadow-lg shadow-depth/20'}`} aria-label={title}>
      <div className={compact ? 'p-4' : 'p-5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <Badge tone="wait" label={t('dossier.mockBadge')} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-300">{t(apiComplement ? 'api.dossier.mockNotice' : 'dossier.mockNotice')}</p>
        <dl className={`mt-4 grid gap-3 ${showCommercialValues ? 'grid-cols-2' : ''}`}>
          <div className="rounded-input border border-brand-500/20 bg-brand-500/5 p-3">
            <dt className="text-xs text-ink-300">{t('dossier.totalWeight')}</dt>
            <dd className={`mt-1 whitespace-nowrap font-display font-semibold text-brand-500 ${compact ? 'text-lg' : 'text-lg sm:text-2xl'}`}>{t('dossier.kg', { value: number(dossier.totalWeightKg) })}</dd>
          </div>
          {showCommercialValues && <div className="rounded-input border border-ink-700 bg-ink-950/40 p-3">
            <dt className="text-xs text-ink-300">{t('dossier.declaredValue')}</dt>
            <dd className={`mt-1 whitespace-nowrap font-display font-semibold ${compact ? 'text-sm' : 'text-sm sm:text-2xl'}`}>{brl(dossier.totalValueBRL, locale)}</dd>
          </div>}
        </dl>
        <p className="mt-3 text-xs text-ink-300">{t('dossier.manifestSummary', { invoices: dossier.invoices.length, packages: number(dossier.totalPackageCount), tons: dossier.capacityTons })}</p>
      </div>
      <div role="tablist" aria-label={t('dossier.tabsLabel')} className="flex border-y border-ink-700 bg-ink-950/30">
        {visibleTabs.map((tab, index) => (
          <button key={tab} type="button" role="tab" ref={(element) => { tabRefs.current[index] = element; }}
            id={`${componentId}-tab-${tab}`} aria-controls={`${componentId}-panel-${tab}`} aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={(event) => handleTabKey(event, index)}
            className={`min-w-0 flex-1 border-b-2 px-2 py-3 text-xs font-medium transition ${compact ? '' : 'sm:text-sm'} ${activeTab === tab ? 'border-brand-500 bg-brand-500/5 text-brand-500' : 'border-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-50'}`}>
            {t(`dossier.tabs.${tab}`)}
          </button>
        ))}
      </div>
      <div key={activeTab} role="tabpanel" id={`${componentId}-panel-${activeTab}`} aria-labelledby={`${componentId}-tab-${activeTab}`} tabIndex={0} className={compact ? 'space-y-4 p-4' : 'space-y-5 p-5'}>
        {activeTab === 'cargo' && (
          <>
            <dl className="grid gap-3 border-b border-ink-700 pb-4 text-sm">
              <div><dt className="text-xs text-ink-300">{t('dossier.originLabel')}</dt><dd className="mt-1">{t('dossier.origin')}</dd></div>
              <div><dt className="text-xs text-ink-300">{t('dossier.receiverLabel')}</dt><dd className="mt-1">{receiver.name}</dd></div>
            </dl>
            <ul className={`grid gap-3 ${compact ? '' : 'lg:grid-cols-3'}`}>
              {dossier.cargoItems.map((item) => <CargoItemCard key={item.id} item={item} compact={compact} showCommercialValues={showCommercialValues} />)}
            </ul>
            <p className="text-xs leading-relaxed text-ink-300">{t('dossier.cargoHint')}</p>
          </>
        )}
        {activeTab === 'invoices' && (
          <div className={`grid gap-4 ${compact ? '' : 'lg:grid-cols-2'}`}>
            {dossier.invoices.map((invoice) => (
              <article key={invoice.id} className="overflow-hidden rounded-input border border-ink-700 bg-ink-950/40">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 p-4">
                  <h3 className="font-display text-base font-semibold">{t('dossier.invoiceTitle', { number: invoice.number })}</h3>
                  <Badge tone="wait" label={t(`dossier.invoiceStatuses.${invoice.status}`)} />
                </header>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-4 p-4 text-sm">
                  <div><dt className="text-xs text-ink-300">{t('dossier.series')}</dt><dd className="mt-1 font-display">{invoice.series}</dd></div>
                  <div><dt className="text-xs text-ink-300">{t('dossier.issueDate')}</dt><dd className="mt-1">{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${invoice.issuedOn}T12:00:00Z`))}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-ink-300">{t('dossier.originLabel')}</dt><dd className="mt-1">{t(invoice.originNameKey)}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-ink-300">{t('dossier.receiverLabel')}</dt><dd className="mt-1">{receiver.name}</dd></div>
                </dl>
                <ul className="space-y-2 border-t border-ink-700 px-4 py-3 text-xs text-ink-300">
                  {invoice.cargoItems.map((item) => <li key={item.id} className="flex justify-between gap-3"><span>{t(item.descriptionKey)}</span><span className="shrink-0 font-display">{t('dossier.kg', { value: number(item.weightKg) })}</span></li>)}
                </ul>
                <div className="flex flex-wrap justify-between gap-2 border-t border-ink-700 p-4 text-sm">
                  <span className="text-ink-300">{t('dossier.invoiceSummary', { packages: number(invoice.totalPackageCount), weight: number(invoice.totalWeightKg) })}</span>
                  {showCommercialValues && <strong className="font-display">{brl(invoice.totalValueBRL, locale)}</strong>}
                </div>
              </article>
            ))}
          </div>
        )}
        {activeTab === 'communications' && (
          <>
            <ol className="space-y-3">
              {visibleCommunications.map((message) => (
                <li key={message.id} className={`rounded-input border p-3 ${message.source === 'driver' ? 'border-brand-500/25 bg-brand-500/5' : 'border-ink-700 bg-ink-950/40'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className={`font-semibold ${message.source === 'driver' ? 'text-brand-500' : 'text-wait-500'}`}>{t(`sources.${message.source}`)}</span>
                    <span className="flex items-center gap-2 text-ink-300">
                      <span>{t(`dossier.communications.kinds.${message.kind}`)}</span>
                      <span className="font-display">{clock(message.atMin)}</span>
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium">{t(message.titleKey)}</h3>
                  {message.messageKey && <p className="mt-1 text-sm leading-relaxed text-ink-300">{t(message.messageKey, message.values ?? {})}</p>}
                </li>
              ))}
            </ol>
            {communications.length > COMMUNICATIONS_PAGE_SIZE && (
              <nav className="trv-comms-pagination" aria-label={t('dossier.communications.paginationLabel')}>
                <span>{t('dossier.communications.range', { from: communicationsRangeStart, to: communicationsRangeEnd, total: communications.length })}</span>
                <div>
                  <button type="button" className="trv-comms-page-button" disabled={currentCommunicationsPage === 0} onClick={() => setCommunicationsPage(currentCommunicationsPage - 1)}>{t('dossier.communications.previous')}</button>
                  <span aria-live="polite">{t('dossier.communications.page', { page: currentCommunicationsPage + 1, pages: communicationsPageCount })}</span>
                  <button type="button" className="trv-comms-page-button" disabled={currentCommunicationsPage >= communicationsPageCount - 1} onClick={() => setCommunicationsPage(currentCommunicationsPage + 1)}>{t('dossier.communications.next')}</button>
                </div>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
