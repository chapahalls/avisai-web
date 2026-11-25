import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverRequests } from '../features/tasks';
import { FleetMap } from '../features/fleet';
import { AgentDecisions, DriverMessages, EventFeed, LiveAlerts } from '../features/trips';
import { AlertQueue, deriveAlerts, DockWindows, MonitoringKpis, TripGrid, VehiclePanel } from '../features/monitoring';
import { useMode, useOps } from '../services/operations';
import '../features/monitoring/monitoring.css';

/** Monitoramento (mockup 02): KPIs, alertas, mapa, veículo, grade e docas. */
export function DashboardPage({ initialTripId }: { initialTripId?: string } = {}) {
  const { t } = useTranslation();
  const mode = useMode();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId ?? null);
  const [alertQueueExpanded, setAlertQueueExpanded] = useState(true);
  const [selectionDismissed, setSelectionDismissed] = useState(false);
  const [alertTripId, setAlertTripId] = useState<string | null>(null);
  const trips = useOps((state) => state.trips);
  const tasks = useOps((state) => state.tasks);
  const simMinutes = useOps((state) => state.simMinutes);
  const alertTrip = useOps((state) => alertTripId ? state.trips.find((trip) => trip.id === alertTripId) : undefined);

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
    selectTrip(tripId);
  };

  return (
    <div className="mon">
      <h1 className="sr-only">{t('monitoring.title')}</h1>
      <MonitoringKpis />
      <div className="mon-main" data-selected={Boolean(selectedTripId)} data-alert-expanded={alertQueueExpanded}>
        <AlertQueue expanded={alertQueueExpanded} onToggle={() => setAlertQueueExpanded((value) => !value)} selectedTripId={selectedTripId} onSelect={selectTrip} />
        <div className="mon-map"><FleetMap key={mode} selectedTripId={selectedTripId} onSelectTrip={selectTrip} /></div>
        {selectedTripId && <div className="mon-side"><VehiclePanel key={selectedTripId} tripId={selectedTripId} onClose={closeVehiclePanel} /></div>}
      </div>
      <TripGrid selectedTripId={selectedTripId} onSelect={selectTrip} />
      <DockWindows onSelect={selectTrip} />
      <LiveAlerts onAlertSelect={selectFromAlert} />
      {alertTrip?.backendId && <section className="cco-alert-message" aria-label={t('driverMessages.alertTitle')}>
        <DriverMessages key={alertTrip.id} routeId={alertTrip.backendId} driverName={alertTrip.driver} highlighted onDismissHighlight={() => setAlertTripId(null)} />
      </section>}
      <section className="cco-operation-panels" aria-label={t('cco.followUp')}>
        <DriverRequests />
        <AgentDecisions />
        <EventFeed limit={16} onAlertSelect={selectFromAlert} />
      </section>
    </div>
  );
}
