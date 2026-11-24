import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConnection, useOps } from '../services/operations';
import { useSession } from '../features/auth';
import { clock } from '../utils/format';
import { DemoControls } from './DemoControls';
import { Icon } from './Icon';
import { RodarMark } from './RodarLogo';
import { ConnectionBanner } from './ConnectionBanner';
import '../cco.css';
import { APP_ROUTES } from '../lib/routes';

const links = [
  { to: APP_ROUTES.dashboard, key: 'nav.monitoring', icon: 'truck' },
  { to: APP_ROUTES.dispatch, key: 'nav.dispatch', icon: 'dashboard' },
  { to: APP_ROUTES.metrics, key: 'nav.analytics', icon: 'metrics' },
] as const;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

export function Layout() {
  const { t, i18n } = useTranslation();
  const simMinutes = useOps((state) => state.simMinutes);
  const running = useOps((state) => state.running);
  const connection = useConnection();
  const connectedMode = connection.mode === 'api';
  const logout = useSession((state) => state.logout);
  const session = useSession((state) => state.session);

  return (
    <div className="cco-shell">
      <a href="#main-content" className="sr-only z-50 rounded-input bg-brand-500 p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">{t('app.skipContent')}</a>
      <header className="cco-topbar">
        <Link to={APP_ROUTES.dashboard} className="cco-brand" aria-label={t('app.name')}>
          <RodarMark className="cco-brand-mark" />
          <span className="cco-brand-text"><strong>{t('cco.brand')}</strong><span>{t('cco.brandSubtitle')}</span></span>
        </Link>
        <nav aria-label={t('nav.main')} className="cco-top-nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === APP_ROUTES.dashboard} className={({ isActive }) => `cco-nav-link${isActive ? ' is-active' : ''}`}>
              <Icon name={link.icon} className="h-4 w-4" />
              <span>{t(link.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="cco-clock">
          <time>{clock(simMinutes)}</time>
          <span>{t(connectedMode ? 'api.clock' : 'app.simClock')}</span>
        </div>
        <div className="cco-topbar-actions">
          <div className="cco-running-state" data-running={connectedMode ? connection.status === 'connected' : running} role="status"><span aria-hidden="true" />{connectedMode ? t(`api.connection.status.${connection.status}`) : running ? t('demo.running') : t('demo.paused')}</div>
          {!connectedMode && <details className="cco-demo-menu">
            <summary><Icon name={running ? 'pause' : 'play'} className="h-3.5 w-3.5" /><span>{t('cco.demoControls')}</span><Icon name="chevron" className="h-3 w-3" /></summary>
            <div className="cco-demo-panel"><DemoControls /></div>
          </details>}
          <div className="cco-language-picker">
            <select aria-label={t('app.language')} value={i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR'} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
              <option value="pt-BR">{t('app.languages.pt')}</option>
              <option value="en">{t('app.languages.en')}</option>
            </select>
            <Icon name="chevron" className="h-3 w-3" />
          </div>
          <div className="cco-profile">
            <span className="cco-profile-avatar" aria-hidden="true">{initials(session?.name ?? t('auth.operator'))}</span>
            <div><strong>{session?.name ?? t('auth.operator')}</strong><span>{t(connectedMode ? 'api.workspace' : 'cco.demoWorkspace')}</span></div>
          </div>
          <button onClick={logout} className="cco-logout" title={t('auth.logout')} aria-label={t('auth.logout')}><Icon name="logout" className="h-4 w-4" /><span>{t('auth.logout')}</span></button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="cco-main"><ConnectionBanner /><Outlet /></main>
    </div>
  );
}
