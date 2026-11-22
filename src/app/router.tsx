import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useSession } from '../features/auth';
import { Layout } from '../components/Layout';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { MetricsPage } from '../pages/MetricsPage';
import { ReceiversPage } from '../pages/ReceiversPage';
import { CallsPage } from '../pages/CallsPage';
import { TripPage } from '../pages/TripPage';

export function AppRouter() {
  const session = useSession((s) => s.session);
  if (!session) return <LoginPage />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="receivers" element={<ReceiversPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="trips/:id" element={<TripPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
