import { useTranslation } from 'react-i18next';
import { RankingTable } from '../features/receivers';
import { PageHeader } from '../components/PageHeader';
import { useMode } from '../services/operations';

export function ReceiversPage() {
  const { t } = useTranslation();
  const mode = useMode();
  return (
    <>
      <PageHeader title={t('nav.receivers')} description={t(mode === 'api' ? 'backendMetrics.rankingHint' : 'receivers.hint')} eyebrow={t(mode === 'api' ? 'backendMetrics.rankingSource' : 'receivers.eyebrow')} />
      <RankingTable />
    </>
  );
}
