import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useSession } from '../features/auth';
import { Layout } from '../components/Layout';
import { lazy, Suspense, type ReactNode } from 'react';

/* Cada página vira um chunk: o painel não baixa o three.js da home e do login, e vice-versa. */
const HomePage = lazy(() => import('../pages/HomePage').then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MetricsPage = lazy(() => import('../pages/MetricsPage').then((m) => ({ default: m.MetricsPage })));
const TripPage = lazy(() => import('../pages/TripPage').then((m) => ({ default: m.TripPage })));
const DispatchPage = lazy(() => import('../pages/DispatchPage').then((m) => ({ default: m.DispatchPage })));
const DispatchNewPage = lazy(() => import('../pages/DispatchNewPage').then((m) => ({ default: m.DispatchNewPage })));
const OperatorPage = lazy(() => import('../pages/OperatorPage').then((m) => ({ default: m.OperatorPage })));

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="page-loading" role="status" aria-busy="true" />}>{children}</Suspense>;
}
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
  return session ? <Navigate to={from?.startsWith(DASHBOARD_BASE) ? from : APP_ROUTES.dashboard} replace /> : <Page><LoginPage /></Page>;
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
        <Route path="/home" element={<Page><HomePage /></Page>} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path={DASHBOARD_BASE} element={<RequireSession />}>
          <Route element={<Layout />}>
            <Route index element={<Page><DashboardPage /></Page>} />
            <Route path="metrics" element={<Page><MetricsPage /></Page>} />
            <Route path="receivers" element={<Navigate to={`${APP_ROUTES.metrics}?tab=receivers`} replace />} />
            <Route path="calls" element={<Navigate to={`${APP_ROUTES.metrics}?tab=calls`} replace />} />
            <Route path="dispatch" element={<Page><DispatchPage /></Page>} />
            <Route path="dispatch/new" element={<Page><DispatchNewPage /></Page>} />
            <Route path="operator" element={<Page><OperatorPage /></Page>} />
            <Route path="trips/:id" element={<Page><TripPage /></Page>} />
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
