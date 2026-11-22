import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../features/auth';

export function LoginPage() {
  const { t } = useTranslation();
  const login = useSession((s) => s.login);
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-card border border-ink-700 bg-ink-900 p-8">
        <p className="font-display text-2xl font-bold text-brand-500">AvisAI</p>
        <h1 className="mt-2 text-xl font-semibold">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-ink-300">{t('auth.subtitle')}</p>
        <button
          onClick={async () => { setLoading(true); await login(); }}
          disabled={loading}
          className="mt-6 w-full rounded-input bg-brand-500 px-4 py-2.5 font-semibold hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? t('auth.loading') : t('auth.sso')}
        </button>
        <p className="mt-4 text-xs text-ink-300">{t('auth.mockNotice')}</p>
      </div>
    </div>
  );
}
