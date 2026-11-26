import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverRequests } from '../features/tasks';
import { FleetMap } from '../features/fleet';
import { DriverMessages, LiveAlerts } from '../features/trips';
import { AlertQueue, deriveAlerts, DockWindows, MonitoringKpis, TripGrid, VehiclePanel } from '../features/monitoring';
import { useMode, useOps } from '../services/operations';
import { Icon } from '../components/Icon';
import '../features/monitoring/monitoring.css';

/** Monitoramento (mockup 02): KPIs, alertas, mapa, veículo, grade e docas. */
export function DashboardPage({ initialTripId }: { initialTripId?: string } = {}) {
  const { t } = useTranslation();
  const mode = useMode();
  const [activePage, setActivePage] = useState(0);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId ?? null);
  const [alertQueueExpanded, setAlertQueueExpanded] = useState(true);
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [alertTripId, setAlertTripId] = useState<string | null>(null);
  const trips = useOps((state) => state.trips);
  const tasks = useOps((state) => state.tasks);
  const simMinutes = useOps((state) => state.simMinutes);
  const alertTrip = useOps((state) => alertTripId ? state.trips.find((trip) => trip.id === alertTripId) : undefined);
  const pageCount = mode === 'api' ? 3 : 2;
  const page = Math.min(activePage, pageCount - 1);
  const pageName = page === 0 ? 'map' : page === 1 ? 'trips' : 'requests';

  useEffect(() => {
    if (activePage >= pageCount) setActivePage(0);
  }, [activePage, pageCount]);

  // Seleção inicial: o alerta mais grave; sem alertas, a primeira viagem ativa.
  useEffect(() => {
    if (selectedTripId && trips.some((trip) => trip.id === selectedTripId)) return;
    if (selectionDismissed) return;
    const firstAlert = deriveAlerts({ trips, tasks, simMinutes })[0]?.tripId;
    const nextTripId = firstAlert ?? trips.find((trip) => trip.phase !== 'unloaded')?.id ?? trips[0]?.id ?? null;
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
    if (mode === 'api') setActivePage(2);
    selectTrip(tripId);
  };

  const selectTripFromGrid = (tripId: string) => {
    selectTrip(tripId);
    setActivePage(0);
  };

  return (
    <div className="mon">
      <h1 className="sr-only">{t('monitoring.title')}</h1>
      <MonitoringKpis />
      <nav className="mon-view-pager" aria-label={t('monitoring.viewPager.label')}>
        <button type="button" className="mon-view-pager-arrow" aria-label={t('monitoring.viewPager.previous')} disabled={page === 0} onClick={() => setActivePage(page - 1)}>
          <Icon name="chevron" className="h-4 w-4 rotate-90" />
        </button>
        <div className="mon-view-pager-label" aria-live="polite">
          <strong>{t(`monitoring.viewPager.${pageName}`)}</strong>
          <span>{t('monitoring.viewPager.page', { current: page + 1, total: pageCount })}</span>
        </div>
        <button type="button" className="mon-view-pager-arrow" aria-label={t('monitoring.viewPager.next')} disabled={page >= pageCount - 1} onClick={() => setActivePage(page + 1)}>
          <Icon name="chevron" className="h-4 w-4 -rotate-90" />
        </button>
      </nav>
      <div className="mon-view-stage">
        <div className="mon-view mon-main" aria-hidden={page !== 0} inert={page !== 0} data-selected={Boolean(selectedTripId)} data-alert-expanded={alertQueueExpanded}>
          <AlertQueue expanded={alertQueueExpanded} onToggle={() => setAlertQueueExpanded((value) => !value)} selectedTripId={selectedTripId} onSelect={selectTrip} />
          <div className="mon-map"><FleetMap key={mode} selectedTripId={selectedTripId} onSelectTrip={selectTrip} /></div>
          {selectedTripId && <div className="mon-side"><VehiclePanel key={selectedTripId} tripId={selectedTripId} onClose={closeVehiclePanel} /></div>}
        </div>
        <div className="mon-view mon-trips-view" aria-hidden={page !== 1} inert={page !== 1}>
          <TripGrid selectedTripId={selectedTripId} onSelect={selectTripFromGrid} />
          <DockWindows onSelect={selectTripFromGrid} />
        </div>
        {mode === 'api' && <div className={`mon-view mon-requests-view${alertTrip?.backendId ? ' has-message' : ''}`} aria-hidden={page !== 2} inert={page !== 2}>
          <DriverRequests />
          {alertTrip?.backendId && <section className="cco-alert-message" aria-label={t('driverMessages.alertTitle')}>
            <DriverMessages key={alertTrip.id} routeId={alertTrip.backendId} driverName={alertTrip.driver} highlighted onDismissHighlight={() => setAlertTripId(null)} />
          </section>}
        </div>}
      </div>
      <LiveAlerts onAlertSelect={selectFromAlert} />
    </div>
  );
}
