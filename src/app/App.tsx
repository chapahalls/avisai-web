import { useEffect } from 'react';
import { startOperations, useMode } from '../services/operations';
import { useSession } from '../features/auth';
import { AppRouter } from './router';

export function App() {
  const mode = useMode();
  const session = useSession((state) => state.session);
  useEffect(() => session ? startOperations() : undefined, [mode, session]);
  return <AppRouter />;
}
