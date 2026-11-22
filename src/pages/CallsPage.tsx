import { useTranslation } from 'react-i18next';
import { CallLogList } from '../features/calls';

export function CallsPage() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-xl font-semibold">{t('nav.calls')}</h1>
      <p className="text-sm text-ink-300">{t('calls.hint')}</p>
      <CallLogList />
    </>
  );
}
