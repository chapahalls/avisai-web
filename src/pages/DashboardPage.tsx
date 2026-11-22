import { KpiGrid } from '../features/metrics';
import { TaskQueue } from '../features/tasks';
import { FleetMap } from '../features/fleet';
import { EventFeed } from '../features/trips';

export function DashboardPage() {
  return (
    <>
      <KpiGrid />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <FleetMap />
        <TaskQueue />
      </div>
      <EventFeed />
    </>
  );
}
