import { useTranslation } from 'react-i18next';
import { Charts, KpiGrid } from '../features/metrics';

export function MetricsPage() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-xl font-semibold">{t('nav.metrics')}</h1>
      <p className="text-sm text-ink-300">{t('metricsPage.hint')}</p>
      <KpiGrid />
      <Charts />
    </>
  );
}
