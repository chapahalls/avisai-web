import { receiverById, useOps } from '../../../services/operations';

export function useTrip(tripId: string) {
  const trip = useOps((s) => s.trips.find((item) => item.id === tripId));
  const simMinutes = useOps((s) => s.simMinutes);
  const waited = trip?.source === 'api' ? trip.stay?.waitMin ?? 0 : trip?.arrivedAtMin !== undefined ? (trip.unloadedAtMin ?? simMinutes) - trip.arrivedAtMin : 0;
  return { trip, waited, receiver: trip ? receiverById(trip.receiverId) : undefined };
}
