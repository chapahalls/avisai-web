import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../features/auth';
import { RodarLogo } from '../components/RodarLogo';
import { LoginGlobe } from '../features/home';
import { apiConfigured, getApiClient, setMode, useMode } from '../services/operations';
import type { BackendUserProfile } from '../services/api/types';

export function LoginPage() {
  const { t } = useTranslation();
  const login = useSession((s) => s.login);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('cco@avisai.test');
  const [error, setError] = useState(false);
  const mode = useMode();
  const [profiles, setProfiles] = useState<BackendUserProfile[]>([]);
  const [profilesStatus, setProfilesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (mode !== 'api') return;
    const controller = new AbortController();
    let active = true;
    setProfiles([]);
    setProfilesStatus('loading');
    const client = getApiClient();
    if (!client) {
      setProfilesStatus('error');
      return;
    }
    void client.listProfiles('cco', controller.signal).then((users) => {
      if (!active) return;
      setProfiles(users);
      setEmail((previous) => users.some((user) => user.email === previous) ? previous : users[0]?.email ?? '');
      setProfilesStatus('ready');
    }).catch(() => { if (active) setProfilesStatus('error'); });
    return () => { active = false; controller.abort(); };
  }, [mode, reload]);
  const canLogin = mode !== 'api' || profilesStatus === 'ready' && profiles.some((profile) => profile.email === email);
  return (
    <div className="grid min-h-screen bg-night-950 bg-[radial-gradient(ellipse_at_20%_0%,_var(--color-ink-800),_var(--color-night-950)_60%)] lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <div className="order-2 flex items-center justify-center p-5 sm:p-8 lg:order-1 lg:p-12">
      <div className="w-full max-w-md rounded-card border border-ink-700 bg-ink-900/90 p-7 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
        <p className="mb-8"><RodarLogo size={44} /></p>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-500">{t('auth.eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t('auth.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">{t('auth.subtitle')}</p>
        <div className="my-7 space-y-3 border-y border-ink-700 py-5">
          {['arrival', 'waiting', 'evidence'].map((item) => (
            <p key={item} className="flex items-center gap-3 text-sm text-ink-300">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {t(`auth.benefits.${item}`)}
            </p>
          ))}
        </div>
        <form onSubmit={async (event) => {
            event.preventDefault();
            if (loading || !canLogin) return;
            setLoading(true);
            setError(false);
            try { await login(email, mode); } catch { setError(true); } finally { setLoading(false); }
          }}>
        {mode === 'api' && <div className="mb-4">
          <label className="block text-xs text-ink-300">{t('dispatch.login.profile')}
            <select required value={email} disabled={loading || profilesStatus !== 'ready' || profiles.length === 0}
              onChange={(event) => { setEmail(event.target.value); setError(false); }}
              className="mt-2 w-full rounded-input border border-ink-700 bg-ink-950 px-3 py-3 text-sm text-ink-50">
              {profiles.length === 0 && <option value="">{t(profilesStatus === 'loading' ? 'dispatch.loading' : 'dispatch.login.empty')}</option>}
              {profiles.map((profile) => <option key={profile.id} value={profile.email}>{profile.name} · {profile.email}</option>)}
            </select>
          </label>
          {profilesStatus === 'error' && <div role="alert" className="mt-3 text-sm text-alert-500">
            <p>{t('dispatch.login.profilesFailed')}</p>
            <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-2 underline">{t('dispatch.refresh')}</button>
          </div>}
        </div>}
        {error && <p role="alert" className="mb-3 text-sm text-alert-500">{t('dispatch.login.failed')}</p>}
        <button type="submit"
          disabled={loading || !canLogin}
          className="w-full rounded-input bg-brand-500 px-4 py-3.5 text-sm font-semibold transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? t('auth.loading') : t('auth.sso')}
        </button>
        </form>
        {apiConfigured && <button type="button" disabled={loading} onClick={() => { setMode(mode === 'api' ? 'demo' : 'api'); setError(false); }}
          className="mt-4 w-full rounded-input border border-ink-700 px-4 py-2.5 text-sm text-ink-300 hover:bg-ink-800 disabled:opacity-50">{t(mode === 'api' ? 'api.connection.useDemo' : 'api.connection.useApi')}</button>}
        <p className="mt-4 text-center text-xs leading-relaxed text-ink-300">{t(mode === 'api' ? 'dispatch.login.notice' : 'auth.mockNotice')}</p>
      </div>
      </div>
      <div className="order-1 h-[42svh] min-h-[280px] lg:order-2 lg:h-auto lg:min-h-screen">
        <LoginGlobe />
      </div>
    </div>
  );
}
