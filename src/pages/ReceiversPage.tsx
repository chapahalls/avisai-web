import { useTranslation } from 'react-i18next';
import { RankingTable } from '../features/receivers';

export function ReceiversPage() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-xl font-semibold">{t('nav.receivers')}</h1>
      <p className="text-sm text-ink-300">{t('receivers.hint')}</p>
      <RankingTable />
    </>
  );
}
