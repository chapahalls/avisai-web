import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useDailySeries } from '../hooks/useMetrics';
import { brl } from '../../../utils/format';
import { useMode } from '../../../services/operations';

const axis = { stroke: 'var(--color-ink-300)', fontSize: 12, axisLine: false, tickLine: false };

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-ink-700 bg-ink-900 p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="mb-6 mt-2 text-xs leading-relaxed text-ink-300">{description}</p>
      <div className="h-72">{children}</div>
    </section>
  );
}

export function Charts() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const series = useDailySeries();
  const mode = useMode();
  const data = series.map((point) => ({ ...point, dayLabel: point.day === 0 ? t('charts.today') : t('charts.relativeDay', { day: point.day }) }));
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const moneyTick = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 0 });
  const valueLabel = (key: unknown, value: unknown) => {
    if (typeof value !== 'number') return t('common.unavailable');
    if (key === 'estadiaDevida' || key === 'estadiaCobrada') return brl(value, locale);
    if (key === 'avisados') return `${number(value)}%`;
    return t('units.hours', { value: number(value) });
  };
  const tooltip = (
    <Tooltip content={({ active, payload, label }) => !active || !payload?.length ? null : (
      <div className="rounded-input border border-ink-700 bg-ink-950 p-3 shadow-xl">
        <p className="mb-2 text-sm font-semibold">{String(label ?? '')}</p>
        {payload.map((item) => <p key={String(item.dataKey)} className="flex items-center justify-between gap-4 text-xs leading-6"><span style={{ color: item.color }}>{String(item.name ?? '')}</span><span className="font-display text-ink-50">{valueLabel(item.dataKey, item.value)}</span></p>)}
      </div>
    )} />
  );
  if (mode === 'api') return (
    <section className="rounded-card border border-ink-700 bg-ink-900 p-5">
      <h2 className="font-display text-base font-semibold">{t('charts.stoppedVsNotified')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-300">{t('backendMetrics.historyUnavailable')}</p>
    </section>
  );
  return (
    <div className="grid gap-5 2xl:grid-cols-2">
      <Panel title={t('charts.stoppedVsNotified')} description={t('charts.stoppedDescription')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, bottom: 6, left: -16 }}>
            <CartesianGrid stroke="var(--color-ink-700)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="dayLabel" {...axis} tickMargin={12} />
            <YAxis yAxisId="hours" {...axis} tickFormatter={(value: number) => t('units.hours', { value: number(value) })} width={65} domain={[0, 'auto']} />
            <YAxis yAxisId="percent" orientation="right" {...axis} unit="%" width={45} domain={[0, 100]} />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 20 }} />
            <Line yAxisId="hours" type="monotone" dataKey="horasParadas" name={t('charts.stoppedHours')} stroke="var(--color-wait-500)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line yAxisId="percent" type="monotone" dataKey="avisados" name={t('charts.notifiedPct')} stroke="var(--color-brand-500)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title={t('charts.stayDueVsCharged')} description={t('charts.stayDescription')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 6, left: 0 }} barGap={4}>
            <CartesianGrid stroke="var(--color-ink-700)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="dayLabel" {...axis} tickMargin={12} />
            <YAxis {...axis} tickFormatter={(value: number) => moneyTick.format(value)} width={64} />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 20 }} />
            <Bar dataKey="estadiaDevida" name={t('charts.due')} fill="var(--color-wait-500)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="estadiaCobrada" name={t('charts.charged')} fill="var(--color-ok-500)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
