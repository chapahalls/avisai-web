import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardPage } from './DashboardPage';
import { MobileWebDemoPage } from './MobileWebDemoPage';
import { LiveVoiceButton } from '../features/driver-app';
import { useConnection, useMode, useOps } from '../services/operations';
import { APP_ROUTES } from '../lib/routes';
import './mobile-demo-app.css';

type WorkspaceView = 'split' | 'mobile';

export function MobileDemoAppPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useMode();
  const connection = useConnection();
  const tripId = useOps((state) => state.trips[0]?.id);
  const [view, setView] = useState<WorkspaceView>('split');

  useEffect(() => {
    if (mode === 'api' && connection.status === 'connected') {
      navigate(APP_ROUTES.dashboard, { replace: true });
    }
  }, [connection.status, mode, navigate]);

  return (
    <section className="mobile-demo-app-page" aria-labelledby="mobile-demo-title">
      <h1 id="mobile-demo-title" className="sr-only">{t('mobileDemo.title')}</h1>

      {mode === 'api' ? <>
        <p className="mobile-demo-api-note" role="note">{t('mobileDemo.apiNotice')}</p>
        <MobileWebDemoPage />
      </> : <div className="mobile-demo-workspace" data-view={view}>
        <section className="mobile-demo-dashboard-pane" aria-label={t('mobileDemo.dashboardPane')} hidden={view === 'mobile'}>
          <DashboardPage initialTripId={tripId} onlyTripId={tripId} />
        </section>
        <section className="mobile-demo-phone-pane" aria-label={t('mobileDemo.mobilePane')}>
          <div className="mobile-demo-controls">
            <div className="mobile-demo-view-switch" role="group" aria-label={t('mobileDemo.viewLabel')}>
              {(['split', 'mobile'] as const).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>
                  {t(`mobileDemo.views.${option}`)}
                </button>
              ))}
            </div>
            <LiveVoiceButton />
          </div>
          <MobileWebDemoPage embedded integrated dashboardVisible={view === 'split'} />
        </section>
      </div>}
    </section>
  );
}
