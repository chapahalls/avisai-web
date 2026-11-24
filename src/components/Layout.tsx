import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConnection, useOps } from '../services/operations';
import { useSession } from '../features/auth';
import { clock } from '../utils/format';
import { DemoControls } from './DemoControls';
import { Icon } from './Icon';
import { RodarLogo } from './RodarLogo';
import { ConnectionBanner } from './ConnectionBanner';
import '../cco.css';

const links = [
  { to: '/', key: 'cco.monitoring', icon: 'truck' },
  { to: '/dispatch', key: 'dispatch.nav', icon: 'dashboard' },
  { to: '/metrics', key: 'nav.metrics', icon: 'metrics' },
  { to: '/receivers', key: 'nav.receivers', icon: 'receivers' },
  { to: '/calls', key: 'nav.calls', icon: 'calls' },
] as const;

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
      <aside className="cco-sidebar">
        <Link to="/" className="cco-brand" aria-label={t('app.name')}>
          <RodarLogo size={38} className="cco-brand-logo" />
          <span className="cco-brand-subtitle">{t('app.subtitle')}</span>
        </Link>
        <p className="cco-nav-group">{t('cco.workspace')}</p>
        <nav aria-label={t('nav.main')} className="cco-side-nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end title={t(link.key)} aria-label={t(link.key)} className={({ isActive }) => `cco-nav-link${isActive ? ' is-active' : ''}`}>
              <Icon name={link.icon} className="h-[18px] w-[18px]" />
              <span>{t(link.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="cco-sidebar-footer">
          <span className="cco-sidebar-status" aria-hidden="true"><Icon name="clock" className="h-4 w-4" /></span>
          <div><p>{t(connectedMode ? 'api.workspace' : 'cco.demoWorkspace')}</p><span>{t(connectedMode ? 'api.connection.mockAreas' : 'app.localMock')}</span></div>
        </div>
      </aside>
      <div className="cco-workspace">
        <header className="cco-topbar">
          <div className="cco-topbar-left">
            <Link to="/" className="cco-mobile-brand" aria-label={t('app.name')}><RodarLogo size={24} /></Link>
            <div className="cco-topbar-title"><span>{t('cco.controlRoom')}</span><strong>{t('cco.roadOperations')}</strong></div>
            <span className="cco-topbar-divider" aria-hidden="true" />
            <div className="cco-clock">
              <Icon name="clock" className="h-4 w-4" />
              <div><time>{clock(simMinutes)}</time><span>{t(connectedMode ? 'api.clock' : 'app.simClock')}</span></div>
            </div>
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
              <span className="cco-profile-avatar" aria-hidden="true"><Icon name="receivers" className="h-4 w-4" /></span>
              <div><strong>{session?.name ?? t('auth.operator')}</strong><span>{t('cco.operatorRole')}</span></div>
            </div>
            <button onClick={logout} className="cco-logout" title={t('auth.logout')} aria-label={t('auth.logout')}><Icon name="logout" className="h-4 w-4" /><span>{t('auth.logout')}</span></button>
          </div>
        </header>
        <nav aria-label={t('nav.main')} className="cco-mobile-nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={({ isActive }) => `cco-mobile-nav-link${isActive ? ' is-active' : ''}`}><Icon name={link.icon} className="h-4 w-4" />{t(link.key)}</NavLink>
          ))}
        </nav>
        <main id="main-content" tabIndex={-1} className="cco-main"><ConnectionBanner /><Outlet /></main>
      </div>
    </div>
  );
}
