/** Caminhos do painel do CCO: tudo deriva de /dashboard. */
export const DASHBOARD_BASE = '/dashboard';

export const APP_ROUTES = {
  dashboard: DASHBOARD_BASE,
  dispatch: `${DASHBOARD_BASE}/dispatch`,
  dispatchNew: `${DASHBOARD_BASE}/dispatch/new`,
  metrics: `${DASHBOARD_BASE}/metrics`,
  mobileDemo: `${DASHBOARD_BASE}/mobile-demo`,
  operator: `${DASHBOARD_BASE}/operator`,
  trip: (id: string) => `${DASHBOARD_BASE}/trips/${id}`,
} as const;
