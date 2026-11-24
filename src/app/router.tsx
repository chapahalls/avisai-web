import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from '../features/auth';
import { Layout } from '../components/Layout';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { MetricsPage } from '../pages/MetricsPage';
import { ReceiversPage } from '../pages/ReceiversPage';
import { CallsPage } from '../pages/CallsPage';
import { TripPage } from '../pages/TripPage';
import { DispatchPage } from '../pages/DispatchPage';
import { OperatorPage } from '../pages/OperatorPage';
import { HomePage } from '../pages/HomePage';

function RequireSession() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  return session ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

function LoginRoute() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return session ? <Navigate to={from?.startsWith('/') && from !== '/login' ? from : '/'} replace /> : <LoginPage />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<RequireSession />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="metrics" element={<MetricsPage />} />
            <Route path="receivers" element={<ReceiversPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="operator" element={<OperatorPage />} />
            <Route path="trips/:id" element={<TripPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
