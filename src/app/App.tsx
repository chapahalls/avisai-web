import { useEffect } from 'react';
import { startOperations, useMode } from '../services/operations';
import { useSession } from '../features/auth';
import { AppRouter } from './router';

export function App() {
  const mode = useMode();
  const session = useSession((state) => state.session);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode não é lido no corpo, mas reinicia as operações ao trocar Demo/API.
  useEffect(() => session ? startOperations() : undefined, [mode, session]);
  return <AppRouter />;
}
