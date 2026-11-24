import { useEffect, useMemo, useState } from 'react';
import { getApiClient, useMode } from '../../../services/operations';
import type { BackendDriver, BackendUserProfile } from '../../../services/api/types';
import { registeredDrivers } from '../model';

/** Motoristas elegíveis (perfil persistido + cadastro operacional) do backend. */
export function useDispatchDrivers() {
  const mode = useMode();
  const client = getApiClient();
  const [drivers, setDrivers] = useState<BackendDriver[]>([]);
  const [profiles, setProfiles] = useState<BackendUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!client || mode !== 'api') { setDrivers([]); setProfiles([]); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    void Promise.all([client.listProfiles('driver', controller.signal), client.listDrivers(controller.signal)]).then(([users, items]) => {
      setProfiles(users);
      setDrivers(items);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, mode, reload]);
  const eligibleDrivers = useMemo(() => registeredDrivers(profiles, drivers), [profiles, drivers]);
  return { eligibleDrivers, loading, failed, reload: () => setReload((value) => value + 1) };
}
