import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverRequests } from '../features/tasks';
import { FleetMap } from '../features/fleet';
import { DriverMessages, LiveAlerts, TripTimeline } from '../features/trips';
import { AlertQueue, deriveAlerts, DockWindows, MonitoringKpis, TripGrid, VehiclePanel } from '../features/monitoring';
import { useMode, useOps } from '../services/operations';
import { Icon } from '../components/Icon';
import { isTripClosed } from '../types/ops';
import '../features/monitoring/monitoring.css';

const pageNames = ['map', 'trips', 'requests'] as const;

/** Monitoramento (mockup 02): KPIs, alertas, mapa, veículo + linha do tempo, grade e docas. */
export function DashboardPage({ initialTripId, onlyTripId }: { initialTripId?: string; onlyTripId?: string } = {}) {
  const { t } = useTranslation();
  const mode = useMode();
  const [activePage, setActivePage] = useState(0);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId ?? null);
  const [alertQueueExpanded, setAlertQueueExpanded] = useState(true);
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [alertTripId, setAlertTripId] = useState<string | null>(null);
  const allTrips = useOps((state) => state.trips);
  const allTasks = useOps((state) => state.tasks);
  const trips = onlyTripId ? allTrips.filter((trip) => trip.id === onlyTripId) : allTrips;
  const tasks = onlyTripId ? allTasks.filter((task) => task.tripId === onlyTripId) : allTasks;
  const simMinutes = useOps((state) => state.simMinutes);
  const alertTrip = useOps((state) => alertTripId ? state.trips.find((trip) => trip.id === alertTripId) : undefined);
  // API precisa da rota do backend para conversar; a Demo usa a viagem local.
  const messageTrip = alertTrip && (mode !== 'api' || alertTrip.backendId) ? alertTrip : undefined;
  // As três telas existem nos dois modos; na Demo, chamados e mensagens são locais.
  const pageCount = 3;
  const page = Math.min(activePage, pageCount - 1);

  useEffect(() => {
    if (activePage >= pageCount) setActivePage(0);
  }, [activePage, pageCount]);

  // Seleção inicial: o alerta mais grave; sem alertas, a primeira viagem ativa.
  useEffect(() => {
    if (selectedTripId && trips.some((trip) => trip.id === selectedTripId)) return;
    if (selectionDismissed) return;
    const firstAlert = deriveAlerts({ trips, tasks, simMinutes })[0]?.tripId;
    const nextTripId = firstAlert ?? trips.find((trip) => !isTripClosed(trip.phase))?.id ?? trips[0]?.id ?? null;
    if (nextTripId !== selectedTripId) setSelectedTripId(nextTripId);
  }, [selectedTripId, selectionDismissed, trips, tasks, simMinutes]);

  const selectTrip = (tripId: string) => {
    setSelectionDismissed(false);
    setSelectedTripId(tripId);
  };

  const closeVehiclePanel = () => {
    setSelectionDismissed(true);
    setSelectedTripId(null);
  };

  const selectFromAlert = (tripId: string) => {
    setAlertTripId(tripId);
    setActivePage(2);
    selectTrip(tripId);
  };

  const selectTripFromGrid = (tripId: string) => {
    selectTrip(tripId);
    setActivePage(0);
  };

  return (
    <div className="mon">
      <h1 className="sr-only">{t('monitoring.title')}</h1>
      <nav className="mon-view-pager" aria-label={t('monitoring.viewPager.label')}>
        <button type="button" className="mon-view-pager-arrow" aria-label={t('monitoring.viewPager.previous')} disabled={page === 0} onClick={() => setActivePage(page - 1)}>
          <Icon name="chevron" className="h-4 w-4 rotate-90" />
        </button>
        <ol className="mon-view-pager-tabs">
          {pageNames.slice(0, pageCount).map((name, index) => (
            <li key={name}>
              <button type="button" aria-current={page === index ? 'page' : undefined} onClick={() => setActivePage(index)}>
                <span className="mon-view-pager-index" aria-hidden="true">{index + 1}</span>
                <span className="mon-view-pager-name">{t(`monitoring.viewPager.${name}`)}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="mon-view-pager-arrow" aria-label={t('monitoring.viewPager.next')} disabled={page >= pageCount - 1} onClick={() => setActivePage(page + 1)}>
          <Icon name="chevron" className="h-4 w-4 -rotate-90" />
        </button>
        <p className="sr-only" aria-live="polite">{t('monitoring.viewPager.page', { current: page + 1, total: pageCount })} · {t(`monitoring.viewPager.${pageNames[page]}`)}</p>
      </nav>
      <MonitoringKpis onlyTripId={onlyTripId} />
      <div className="mon-view-stage">
        <div className="mon-view mon-main" aria-hidden={page !== 0} inert={page !== 0} data-selected={Boolean(selectedTripId)} data-alert-expanded={alertQueueExpanded}>
          <AlertQueue onlyTripId={onlyTripId} expanded={alertQueueExpanded} onToggle={() => setAlertQueueExpanded((value) => !value)} selectedTripId={selectedTripId} onSelect={selectTrip} />
          <div className="mon-map"><FleetMap key={mode} tripId={onlyTripId} selectedTripId={selectedTripId} onSelectTrip={selectTrip} /></div>
          {selectedTripId && <div className="mon-side">
            <VehiclePanel key={selectedTripId} tripId={selectedTripId} onClose={closeVehiclePanel} />
            <div className="mon-side-timeline"><TripTimeline key={selectedTripId} tripId={selectedTripId} compact /></div>
          </div>}
        </div>
        <div className="mon-view mon-trips-view" aria-hidden={page !== 1} inert={page !== 1}>
          <TripGrid onlyTripId={onlyTripId} selectedTripId={selectedTripId} onSelect={selectTripFromGrid} />
          <DockWindows onlyTripId={onlyTripId} onSelect={selectTripFromGrid} />
        </div>
        <div className={`mon-view mon-requests-view${messageTrip ? ' has-message' : ''}`} aria-hidden={page !== 2} inert={page !== 2}>
          <DriverRequests onlyTripId={onlyTripId} onMessage={selectFromAlert} />
          {messageTrip && <section className="cco-alert-message" aria-label={t('driverMessages.alertTitle')}>
            <DriverMessages key={messageTrip.id} tripId={messageTrip.id} routeId={messageTrip.backendId} driverName={messageTrip.driver} highlighted onDismissHighlight={() => setAlertTripId(null)} />
          </section>}
        </div>
      </div>
      <LiveAlerts onlyTripId={onlyTripId} onAlertSelect={selectFromAlert} />
    </div>
  );
}
