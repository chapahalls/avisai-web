import { useTranslation } from 'react-i18next';
import { brl, hhmm, pct } from '../../../utils/format';
import { useRanking } from '../hooks/useRanking';
import { BUSINESS } from '../../../lib/config';
import { AnalyticsStatus } from '../../../components/AnalyticsStatus';
import type { BackendReceiver } from '../../../services/api/types';

function BackendTable({ rows }: { rows: BackendReceiver[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const max = Math.max(...rows.map((row) => row.espera_media_h ?? 0), 1);
  if (!rows.length) return <p className="rounded-card border border-ink-700 bg-ink-900 p-5 text-sm text-ink-300">{t('backendMetrics.rankingEmpty')}</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-ink-700 bg-ink-900">
      <table className="w-full min-w-[800px] text-sm">
        <caption className="sr-only">{t('backendMetrics.rankingHint')}</caption>
        <thead className="text-left text-ink-300">
          <tr className="border-b border-ink-700">
            <th scope="col" className="px-5 py-4 font-medium">{t('receivers.name')}</th>
            <th scope="col" className="px-5 py-4 font-medium">{t('receivers.avgWait')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('receivers.deliveries')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('backendMetrics.validCallsLabel')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('receivers.stayDue')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('kpi.answered')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.recebedor} className="border-b border-ink-700/60 transition last:border-0 hover:bg-ink-800/50">
              <th scope="row" className="px-5 py-5 text-left font-medium">{row.recebedor}<p className="mt-1 text-xs font-normal text-ink-300">{row.responsavel}</p></th>
              <td className="px-5 py-5">
                <div className="flex items-center gap-3">
                  {row.espera_media_h !== null && <div aria-hidden="true" className="h-1.5 w-20 rounded-full bg-ink-700"><div className="h-1.5 rounded-full bg-wait-500" style={{ width: `${row.espera_media_h / max * 100}%` }} /></div>}
                  <span className="whitespace-nowrap font-display">{row.espera_media_h === null ? '—' : hhmm(row.espera_media_h * 60, locale)}</span>
                </div>
              </td>
              <td className="px-5 py-5 text-right font-display">{row.entregas.toLocaleString(locale)}</td>
              <td className="px-5 py-5 text-right font-display">{row.ligacoes.toLocaleString(locale)}</td>
              <td className="whitespace-nowrap px-5 py-5 text-right font-display">{brl(row.estadia_devida, locale)}</td>
              <td className="px-5 py-5 text-right font-display">{row.ligacoes === 0 ? '—' : pct(row.ligacoes_atendidas / row.ligacoes, locale)}<p className="mt-1 text-xs font-normal text-ink-300">{t('backendMetrics.rankingAnswered', { answered: row.ligacoes_atendidas, total: row.ligacoes })}</p></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingTable() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const result = useRanking();
  if (result.source === 'api') return (
    <div className="space-y-4">
      <AnalyticsStatus loading={result.loading} error={result.error} updatedAt={result.updatedAt} hasData={result.data !== null} retry={result.retry} />
      {result.data !== null && <BackendTable rows={result.data} />}
      <p className="text-xs text-ink-300">{t('backendMetrics.noSamples')}</p>
    </div>
  );
  const rows = result.data;
  const max = Math.max(...rows.map((r) => r.avgWaitMin), 1);
  return (
    <div className="overflow-x-auto rounded-card border border-ink-700 bg-ink-900">
      <table className="w-full min-w-[800px] text-sm">
        <caption className="sr-only">{t('receivers.hint')}</caption>
        <thead className="text-left text-ink-300">
          <tr className="border-b border-ink-700">
            <th scope="col" className="px-5 py-4 font-medium">{t('receivers.name')}</th>
            <th scope="col" className="px-5 py-4 font-medium">{t('receivers.avgWait')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('receivers.deliveries')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('receivers.stoppedHours')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('receivers.stayDue')}</th>
            <th scope="col" className="px-5 py-4 text-right font-medium">{t('receivers.answered')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const over = r.avgWaitMin > BUSINESS.franchiseHours * 60;
            return (
              <tr key={r.id} className="border-b border-ink-700/60 transition last:border-0 hover:bg-ink-800/50">
                <th scope="row" className="px-5 py-5 text-left font-medium">{r.name}</th>
                <td className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="h-1.5 w-20 rounded-full bg-ink-700">
                      <div className={`h-1.5 rounded-full ${over ? 'bg-alert-500' : 'bg-wait-500'}`} style={{ width: `${(r.avgWaitMin / max) * 100}%` }} />
                    </div>
                    <span className="whitespace-nowrap font-display">{hhmm(r.avgWaitMin, locale)}</span>
                  </div>
                  {over && <p className="mt-2 text-xs text-alert-500">{t('receivers.overFranchise')}</p>}
                </td>
                <td className="px-5 py-5 text-right font-display">{r.deliveries.toLocaleString(locale)}</td>
                <td className="px-5 py-5 text-right font-display">{t('units.hours', { value: r.stoppedHours.toLocaleString(locale, { maximumFractionDigits: 1 }) })}</td>
                <td className="whitespace-nowrap px-5 py-5 text-right font-display">{brl(r.stayDue, locale)}</td>
                <td className="px-5 py-5 text-right font-display">{pct(r.answeredRate, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
