import { useTranslation } from 'react-i18next';

interface Props {
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
  hasData: boolean;
  retry: () => Promise<void>;
}

export function AnalyticsStatus({ loading, error, updatedAt, hasData, retry }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
      <p role={error ? 'alert' : 'status'}>
        {error ? `${t('backendMetrics.error')} ${hasData ? t('backendMetrics.previous') : ''}`
          : loading ? t('backendMetrics.loading')
          : updatedAt ? t('backendMetrics.updated', { time: new Date(updatedAt).toLocaleTimeString(locale) }) : t('backendMetrics.loading')}
      </p>
      <button type="button" disabled={loading} onClick={() => { void retry(); }}
        className="rounded-input border border-ink-700 px-3 py-2 font-medium text-ink-50 transition hover:bg-ink-800 disabled:cursor-wait disabled:opacity-50">
        {t('backendMetrics.retry')}
      </button>
    </div>
  );
}
