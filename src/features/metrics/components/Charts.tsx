import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useDailySeries } from '../hooks/useMetrics';

const axis = { stroke: '#A7B1C6', fontSize: 12 };
const grid = '#2A3550';
const tooltip = { contentStyle: { background: '#121A2B', border: '1px solid #2A3550', borderRadius: 8 } };

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-ink-700 bg-ink-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink-50">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

export function Charts() {
  const { t } = useTranslation();
  const data = useDailySeries();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title={t('charts.stoppedVsNotified')}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="day" {...axis} />
            <YAxis yAxisId="h" {...axis} />
            <YAxis yAxisId="p" orientation="right" {...axis} unit="%" />
            <Tooltip {...tooltip} />
            <Legend />
            <Line yAxisId="h" type="monotone" dataKey="horasParadas" name={t('charts.stoppedHours')} stroke="#F5A524" strokeWidth={2} />
            <Line yAxisId="p" type="monotone" dataKey="avisados" name={t('charts.notifiedPct')} stroke="#099DFD" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title={t('charts.stayDueVsCharged')}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="day" {...axis} />
            <YAxis {...axis} />
            <Tooltip {...tooltip} />
            <Legend />
            <Bar dataKey="estadiaDevida" name={t('charts.due')} fill="#F5A524" radius={[4, 4, 0, 0]} />
            <Bar dataKey="estadiaCobrada" name={t('charts.charged')} fill="#17B26A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
