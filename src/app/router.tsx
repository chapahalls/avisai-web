import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useSession } from '../features/auth';
import { Layout } from '../components/Layout';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { MetricsPage } from '../pages/MetricsPage';
import { TripPage } from '../pages/TripPage';
import { DispatchPage } from '../pages/DispatchPage';
import { DispatchNewPage } from '../pages/DispatchNewPage';
import { OperatorPage } from '../pages/OperatorPage';
import { HomePage } from '../pages/HomePage';
import { APP_ROUTES, DASHBOARD_BASE } from '../lib/routes';

function RequireSession() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  return session ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
}

function LoginRoute() {
  const session = useSession((s) => s.session);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return session ? <Navigate to={from?.startsWith(DASHBOARD_BASE) ? from : APP_ROUTES.dashboard} replace /> : <LoginPage />;
}

/** Endereços antigos (antes de /dashboard) continuam funcionando. */
function LegacyTripRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={APP_ROUTES.trip(id)} replace />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path={DASHBOARD_BASE} element={<RequireSession />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="metrics" element={<MetricsPage />} />
            <Route path="receivers" element={<Navigate to={`${APP_ROUTES.metrics}?tab=receivers`} replace />} />
            <Route path="calls" element={<Navigate to={`${APP_ROUTES.metrics}?tab=calls`} replace />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="dispatch/new" element={<DispatchNewPage />} />
            <Route path="operator" element={<OperatorPage />} />
            <Route path="trips/:id" element={<TripPage />} />
            <Route path="*" element={<Navigate to={APP_ROUTES.dashboard} replace />} />
          </Route>
        </Route>
        <Route path="/metrics" element={<Navigate to={APP_ROUTES.metrics} replace />} />
        <Route path="/receivers" element={<Navigate to={`${APP_ROUTES.metrics}?tab=receivers`} replace />} />
        <Route path="/calls" element={<Navigate to={`${APP_ROUTES.metrics}?tab=calls`} replace />} />
        <Route path="/dispatch" element={<Navigate to={APP_ROUTES.dispatch} replace />} />
        <Route path="/operator" element={<Navigate to={APP_ROUTES.operator} replace />} />
        <Route path="/trips/:id" element={<LegacyTripRedirect />} />
        <Route path="*" element={<Navigate to={APP_ROUTES.dashboard} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
