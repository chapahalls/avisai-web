import { useTranslation } from 'react-i18next';
import { brl, hhmm, pct } from '../../../utils/format';
import { useRanking } from '../hooks/useRanking';
import { BUSINESS } from '../../../lib/config';

export function RankingTable() {
  const { t } = useTranslation();
  const rows = useRanking();
  const max = Math.max(...rows.map((r) => r.avgWaitMin), 1);
  return (
    <div className="overflow-x-auto rounded-card border border-ink-700 bg-ink-900">
      <table className="w-full text-sm">
        <thead className="text-left text-ink-300">
          <tr className="border-b border-ink-700">
            <th className="px-4 py-3">{t('receivers.name')}</th>
            <th className="px-4 py-3">{t('receivers.avgWait')}</th>
            <th className="px-4 py-3 text-right">{t('receivers.deliveries')}</th>
            <th className="px-4 py-3 text-right">{t('receivers.stoppedHours')}</th>
            <th className="px-4 py-3 text-right">{t('receivers.stayDue')}</th>
            <th className="px-4 py-3 text-right">{t('receivers.answered')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const over = r.avgWaitMin > BUSINESS.franchiseHours * 60;
            return (
              <tr key={r.id} className="border-b border-ink-700 last:border-0">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-ink-700">
                      <div className={`h-2 rounded-full ${over ? 'bg-alert-500' : 'bg-wait-500'}`} style={{ width: `${(r.avgWaitMin / max) * 100}%` }} />
                    </div>
                    <span className="font-display">{hhmm(r.avgWaitMin)}</span>
                    {over && <span className="text-xs text-alert-500">{t('receivers.overFranchise')}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{r.deliveries}</td>
                <td className="px-4 py-3 text-right">{r.stoppedHours.toFixed(0)} h</td>
                <td className="px-4 py-3 text-right">{brl(r.stayDue)}</td>
                <td className="px-4 py-3 text-right">{pct(r.answeredRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
