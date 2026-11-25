import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverRequests } from '../features/tasks';
import { FleetMap } from '../features/fleet';
import { AgentDecisions, DriverMessages, EventFeed, LiveAlerts } from '../features/trips';
import { AlertQueue, deriveAlerts, DockWindows, LiveCall, MonitoringKpis, TripGrid, VehiclePanel } from '../features/monitoring';
import { useMode, useOps } from '../services/operations';
import '../features/monitoring/monitoring.css';

/** Monitoramento (mockup 02): KPIs, alertas, mapa, veículo, grade e docas. */
export function DashboardPage({ initialTripId }: { initialTripId?: string } = {}) {
  const { t } = useTranslation();
  const mode = useMode();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId ?? null);
  const [alertTripId, setAlertTripId] = useState<string | null>(null);
  const trips = useOps((state) => state.trips);
  const tasks = useOps((state) => state.tasks);
  const simMinutes = useOps((state) => state.simMinutes);
  const alertTrip = useOps((state) => alertTripId ? state.trips.find((trip) => trip.id === alertTripId) : undefined);

  // Seleção inicial: o alerta mais grave; sem alertas, a primeira viagem ativa.
  useEffect(() => {
    if (selectedTripId && trips.some((trip) => trip.id === selectedTripId)) return;
    const firstAlert = deriveAlerts({ trips, tasks, simMinutes })[0]?.tripId;
    setSelectedTripId(firstAlert ?? trips.find((trip) => trip.phase !== 'unloaded')?.id ?? trips[0]?.id ?? null);
  }, [selectedTripId, trips, tasks, simMinutes]);

  const selectFromAlert = (tripId: string) => {
    setAlertTripId(tripId);
    setSelectedTripId(tripId);
  };

  return (
    <div className="mon">
      <h1 className="sr-only">{t('monitoring.title')}</h1>
      <MonitoringKpis />
      <div className="mon-main">
        <AlertQueue selectedTripId={selectedTripId} onSelect={setSelectedTripId} />
        <div className="mon-map"><FleetMap key={mode} selectedTripId={selectedTripId} onSelectTrip={setSelectedTripId} /></div>
        <div className="mon-side">
          <VehiclePanel tripId={selectedTripId} />
          <LiveCall tripId={selectedTripId} />
        </div>
      </div>
      <TripGrid selectedTripId={selectedTripId} onSelect={setSelectedTripId} />
      <DockWindows onSelect={setSelectedTripId} />
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
