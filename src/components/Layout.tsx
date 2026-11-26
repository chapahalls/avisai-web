import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiConfigured, retryConnection, setMode, useConnection, useOps } from '../services/operations';
import { useSession } from '../features/auth';
import { clock } from '../utils/format';
import { DemoControls } from './DemoControls';
import { Icon } from './Icon';
import { RodarMark } from './RodarLogo';
import { ConnectionBanner } from './ConnectionBanner';
import '../cco.css';
import { APP_ROUTES } from '../lib/routes';
import { useTheme } from '../lib/theme';

const links = [
  { to: APP_ROUTES.dashboard, key: 'nav.monitoring', icon: 'truck' },
  { to: APP_ROUTES.dispatch, key: 'nav.dispatch', icon: 'dashboard' },
  { to: APP_ROUTES.metrics, key: 'nav.analytics', icon: 'metrics' },
  { to: APP_ROUTES.mobileDemo, key: 'nav.mobileDemo', icon: 'mobile' },
] as const;

const initials = (name: string) => name.split(/\s+/).map((part) => part.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

export function Layout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isDashboard = location.pathname === APP_ROUTES.dashboard;
  const simMinutes = useOps((state) => state.simMinutes);
  const running = useOps((state) => state.running);
  const connection = useConnection();
  const connectedMode = connection.mode === 'api';
  const logout = useSession((state) => state.logout);
  const session = useSession((state) => state.session);
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggle);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => { delete root.dataset.theme; };
  }, [theme]);

  return (
    <div className={`cco-shell${isDashboard ? ' cco-shell-dashboard' : ''}`}>
      <a href="#main-content" className="sr-only z-50 rounded-input bg-brand-500 text-on-accent p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">{t('app.skipContent')}</a>
      <header className="cco-topbar">
        <Link to={APP_ROUTES.dashboard} className="cco-brand" aria-label={t('app.name')}>
          <RodarMark className="cco-brand-mark" />
        </Link>
        <nav aria-label={t('nav.main')} className="cco-top-nav">
          {links.filter((link) => !connectedMode || link.to !== APP_ROUTES.mobileDemo).map((link) => (
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
          <details className="cco-mode-menu">
            <summary className="cco-mode-badge" data-mode={connectedMode ? 'live' : 'demo'} aria-label={t(connectedMode ? 'cco.mode.live' : 'cco.mode.demo')}>
              <span>{t(connectedMode ? 'cco.mode.liveLabel' : 'cco.mode.demoLabel')}</span><Icon name="chevron" className="h-3 w-3" />
            </summary>
            <div className="cco-mode-panel">
              <strong>{t('cco.mode.menu')}</strong>
              <button type="button" aria-pressed={!connectedMode} onClick={() => setMode('demo')}>{t('cco.mode.useDemo')}</button>
              <button type="button" aria-pressed={connectedMode} disabled={!apiConfigured} onClick={() => setMode('api')}>{t('cco.mode.useLive')}</button>
              {!apiConfigured && <p>{t('cco.mode.liveUnavailable')}</p>}
              {connectedMode && connection.status !== 'connected' && <button type="button" onClick={() => retryConnection()}>{t('cco.mode.retry')}</button>}
            </div>
          </details>
          <div className="cco-running-state" data-running={connectedMode ? connection.status === 'connected' : running} role="status"><span aria-hidden="true" /><span className="cco-running-label">{connectedMode ? t(`api.connection.status.${connection.status}`) : running ? t('demo.running') : t('demo.paused')}</span></div>
          {!connectedMode && <details className="cco-demo-menu">
            <summary><Icon name={running ? 'pause' : 'play'} className="h-3.5 w-3.5" /><span>{t('cco.demoControls')}</span><Icon name="chevron" className="h-3 w-3" /></summary>
            <div className="cco-demo-panel"><DemoControls /></div>
          </details>}
          <button type="button" className="cco-theme-toggle" onClick={toggleTheme} aria-pressed={theme === 'light'} aria-label={t('app.themeLight')} title={t(theme === 'light' ? 'app.themes.light' : 'app.themes.dark')}>
            <Icon name={theme === 'light' ? 'sun' : 'moon'} className="h-4 w-4" />
          </button>
          <div className="cco-language-picker">
            <select aria-label={t('app.language')} value={i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR'} onChange={(event) => void i18n.changeLanguage(event.target.value)}>
              <option value="pt-BR">{t('app.languages.pt')}</option>
              <option value="en">{t('app.languages.en')}</option>
            </select>
            <Icon name="chevron" className="h-3 w-3" />
          </div>
          <details className="cco-profile-menu">
            <summary className="cco-profile" aria-label={`${t('auth.operator')}: ${session?.name ?? t('auth.operator')}`}>
              <span className="cco-profile-avatar" aria-hidden="true">{initials(session?.name ?? t('auth.operator'))}</span>
              <span className="cco-profile-copy"><strong>{session?.name ?? t('auth.operator')}</strong><span>{t(connectedMode ? 'api.workspace' : 'cco.demoWorkspace')}</span></span>
              <Icon name="chevron" className="cco-profile-chevron h-3 w-3" />
            </summary>
            <div className="cco-profile-panel">
              <div className="cco-profile-panel-heading"><div><strong>{t('cco.access.title')}</strong><span>{t('cco.access.subtitle')}</span></div><span className="cco-access-badge">2FA</span></div>
              <ol className="cco-access-steps">
                <li><span>01</span><p>{t('cco.access.admin')}</p></li>
                <li><span>02</span><p>{t('cco.access.invite')}</p></li>
                <li><span>03</span><p>{t('cco.access.password')}</p></li>
                <li><span>04</span><p>{t('cco.access.twoFactor')}</p></li>
              </ol>
              <p className="cco-access-note">{t('cco.access.note')}</p>
            </div>
          </details>
          <button type="button" onClick={logout} className="cco-logout" title={t('auth.logout')} aria-label={t('auth.logout')}><Icon name="logout" className="h-4 w-4" /><span>{t('auth.logout')}</span></button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={`cco-main${isDashboard ? ' cco-main-dashboard' : ''}`}>{!isDashboard && <ConnectionBanner quietWhenHealthy={location.pathname.startsWith(APP_ROUTES.dispatch) || location.pathname === APP_ROUTES.mobileDemo || location.pathname.startsWith(`${APP_ROUTES.dashboard}/trips/`)} />}<Outlet /></main>
    </div>
  );
}
