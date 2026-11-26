import { useEffect, useMemo, useState } from 'react';
import { getApiClient, useDemoRegistry, useMode } from '../../../services/operations';
import type { BackendDriver, BackendUserProfile } from '../../../services/api/types';
import { demoRegisteredDrivers, registeredDrivers } from '../model';

/** Motoristas elegíveis: no modo API, perfil persistido + cadastro operacional; na Demo, o cadastro local. */
export function useDispatchDrivers() {
  const mode = useMode();
  const client = getApiClient();
  const registry = useDemoRegistry();
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
  const apiDrivers = useMemo(() => registeredDrivers(profiles, drivers), [profiles, drivers]);
  const demoDrivers = useMemo(() => demoRegisteredDrivers(registry.drivers), [registry.drivers]);
  return {
    eligibleDrivers: mode === 'api' ? apiDrivers : demoDrivers,
    loading: mode === 'api' && loading,
    failed: mode === 'api' && failed,
    reload: () => setReload((value) => value + 1),
  };
}

/** Operadores do CCO: perfis `cco` do backend ou cadastro local da Demo. */
export function useOperators() {
  const mode = useMode();
  const client = getApiClient();
  const registry = useDemoRegistry();
  const [profiles, setProfiles] = useState<BackendUserProfile[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!client || mode !== 'api') return;
    const controller = new AbortController();
    setStatus('loading');
    void client.listProfiles('cco', controller.signal)
      .then((users) => { setProfiles(users); setStatus('ready'); })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [client, mode, reload]);
  const operators = mode === 'api'
    ? profiles.map((profile) => ({ id: profile.id, name: profile.name, email: profile.email }))
    : registry.operators;
  return { operators, status: mode === 'api' ? status : 'ready' as const, reload: () => setReload((value) => value + 1) };
}
