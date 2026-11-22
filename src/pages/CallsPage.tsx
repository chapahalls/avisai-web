import { useTranslation } from 'react-i18next';
import { CallLogList } from '../features/calls';
import { PageHeader } from '../components/PageHeader';
import { useMode } from '../services/operations';

export function CallsPage() {
  const { t } = useTranslation();
  const mode = useMode();
  return (
    <>
      <PageHeader title={t('nav.calls')} description={t(mode === 'api' ? 'api.callsHint' : 'calls.hint')} eyebrow={t('calls.eyebrow')} />
      <CallLogList />
    </>
  );
}
