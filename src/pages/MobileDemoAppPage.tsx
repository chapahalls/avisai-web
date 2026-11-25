import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardPage } from './DashboardPage';
import { MobileWebDemoPage } from './MobileWebDemoPage';
import { useMode, useOps } from '../services/operations';
import './mobile-demo-app.css';

type WorkspaceView = 'split' | 'mobile' | 'dashboard';

export function MobileDemoAppPage() {
  const { t } = useTranslation();
  const mode = useMode();
  const tripId = useOps((state) => state.trips[0]?.id);
  const [view, setView] = useState<WorkspaceView>('split');

  return (
    <section className="mobile-demo-app-page" aria-labelledby="mobile-demo-title">
      <header className="mobile-demo-heading">
        <div>
          <h1 id="mobile-demo-title">{t('mobileDemo.title')}</h1>
          <p>{t('mobileDemo.description')}</p>
        </div>
        {mode === 'demo' && <div className="mobile-demo-view-switch" role="group" aria-label={t('mobileDemo.viewLabel')}>
          {(['split', 'mobile', 'dashboard'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>
              {t(`mobileDemo.views.${option}`)}
            </button>
          ))}
        </div>}
      </header>

      {mode === 'api' ? <>
        <p className="mobile-demo-api-note" role="note">{t('mobileDemo.apiNotice')}</p>
        <MobileWebDemoPage />
      </> : <div className="mobile-demo-workspace" data-view={view}>
        <section className="mobile-demo-dashboard-pane" aria-label={t('mobileDemo.dashboardPane')} hidden={view === 'mobile'}>
          <DashboardPage initialTripId={tripId} />
        </section>
        <section className="mobile-demo-phone-pane" aria-label={t('mobileDemo.mobilePane')} hidden={view === 'dashboard'}>
          <MobileWebDemoPage embedded integrated />
        </section>
      </div>}
    </section>
  );
}
