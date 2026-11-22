import { useTranslation } from 'react-i18next';
import { apiConfigured, retryConnection, setMode, useConnection, useOps } from '../services/operations';

export function ConnectionBanner() {
  const { t, i18n } = useTranslation();
  const state = useConnection();
  const count = useOps((data) => data.trips.length);
  if (state.mode === 'demo') {
    return apiConfigured ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-input border border-ink-700 bg-ink-900 px-4 py-3 text-xs">
        <span>{t('app.localMock')}</span>
        <button className="font-semibold text-brand-500 hover:underline" onClick={() => setMode('api')}>{t('api.connection.useApi')}</button>
      </div>
    ) : null;
  }
  const time = state.lastSyncedAt ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'medium' }).format(new Date(state.lastSyncedAt)) : null;
  return (
    <section className="space-y-2 rounded-input border border-ink-700 bg-ink-900 px-4 py-3 text-xs" aria-label={t('api.connection.title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3" role="status">
          <strong className={state.status === 'connected' ? 'text-ok-500' : 'text-wait-500'}>{t(`api.connection.status.${state.status}`)}</strong>
          {time && <span className="text-ink-300">{t('api.connection.lastSync', { time })}</span>}
        </div>
        <div className="flex flex-wrap gap-4">
          <button onClick={() => { retryConnection(); }} className="font-semibold text-brand-500 hover:underline">{t('api.connection.retry')}</button>
          <button onClick={() => setMode('demo')} className="text-ink-300 hover:underline">{t('api.connection.useDemo')}</button>
        </div>
      </div>
      {state.error && <p role="alert" className="text-alert-500">{t('api.connection.error')} <span className="font-mono">{state.error}</span></p>}
      {!state.lastSyncedAt && !state.error && <p>{t('api.connection.loading')}</p>}
      {state.lastSyncedAt && count === 0 && <p>{t('api.connection.empty')} {t('api.connection.emptyHint')}</p>}
      <p className="text-ink-300">{t('api.connection.mockAreas')}</p>
    </section>
  );
}
