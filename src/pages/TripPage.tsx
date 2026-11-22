import { useParams } from 'react-router-dom';
import { TripDetails } from '../features/trips';
import { FleetMap } from '../features/fleet';

export function TripPage() {
  const { id = '' } = useParams();
  return <TripDetails tripId={id} route={<FleetMap tripId={id} />} />;
}
