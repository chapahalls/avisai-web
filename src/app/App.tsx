import { useEffect } from 'react';
import { startEngine } from '../services/mock/engine';
import { AppRouter } from './router';

export function App() {
  useEffect(() => startEngine(), []);
  return <AppRouter />;
}
