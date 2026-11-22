import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOps } from '../services/mock/engine';
import { useSession } from '../features/auth';
import { clock } from '../utils/format';

const links = [
  { to: '/', key: 'nav.dashboard' },
  { to: '/metrics', key: 'nav.metrics' },
  { to: '/receivers', key: 'nav.receivers' },
  { to: '/calls', key: 'nav.calls' },
];

export function Layout() {
  const { t, i18n } = useTranslation();
  const { simMinutes, running, toggle, operatorResponsiveness, setResponsiveness } = useOps();
  const { session, logout } = useSession();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-ink-700 bg-ink-900 p-4 md:block">
        <p className="font-display text-xl font-bold text-brand-500">AvisAI</p>
        <p className="mb-6 text-xs text-ink-300">{t('app.subtitle')}</p>
        <nav className="space-y-1">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end className={({ isActive }) => `block rounded-input px-3 py-2 text-sm ${isActive ? 'bg-brand-500 text-ink-50' : 'text-ink-300 hover:bg-ink-800'}`}>
              {t(l.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8 space-y-3 rounded-card border border-dashed border-ink-700 p-3 text-xs text-ink-300">
          <p>{t('demo.title')}</p>
          <button onClick={toggle} className="w-full rounded-input border border-ink-700 px-2 py-1 text-ink-50 hover:bg-ink-800">
            {running ? t('demo.pause') : t('demo.play')}
          </button>
          <label className="block">
            {t('demo.responsiveness', { v: Math.round(operatorResponsiveness * 100) })}
            <input type="range" min={0} max={1} step={0.05} value={operatorResponsiveness} onChange={(e) => setResponsiveness(Number(e.target.value))} className="w-full accent-brand-500" />
          </label>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-700 px-6 py-3">
          <div className="flex items-center gap-3 text-sm text-ink-300">
            <span className="font-display text-lg text-ink-50">{clock(simMinutes)}</span>
            <span>{t('app.simClock')}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)} className="rounded-input border border-ink-700 bg-ink-900 px-2 py-1">
              <option value="pt-BR">PT</option>
              <option value="en">EN</option>
            </select>
            <span className="text-ink-300">{session?.name}</span>
            <button onClick={logout} className="text-ink-300 hover:text-ink-50">{t('auth.logout')}</button>
          </div>
        </header>
        <main className="flex-1 space-y-4 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
