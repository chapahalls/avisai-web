import { useTranslation } from 'react-i18next';
import { Charts, KpiGrid } from '../features/metrics';
import { PageHeader } from '../components/PageHeader';
import { useMode } from '../services/operations';

export function MetricsPage() {
  const { t } = useTranslation();
  const mode = useMode();
  return (
    <>
      <PageHeader title={t('nav.metrics')} description={t(mode === 'api' ? 'backendMetrics.hint' : 'metricsPage.hint')} eyebrow={t(mode === 'api' ? 'backendMetrics.source' : 'metricsPage.eyebrow')} />
      <KpiGrid />
      <Charts />
    </>
  );
}
