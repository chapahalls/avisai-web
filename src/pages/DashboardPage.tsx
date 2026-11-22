import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KpiGrid, useMetrics } from '../features/metrics';
import { TaskQueue } from '../features/tasks';
import { FleetMap } from '../features/fleet';
import { EventFeed } from '../features/trips';
import { Icon } from '../components/Icon';
import { useMode } from '../services/operations';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const result = useMetrics();
  const mode = useMode();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const currency = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value);
  const apiValue = (value: number | null | undefined, format: (number: number) => string = number) => value === null || value === undefined ? '—' : format(value);
  const stats = result.source === 'api' ? [
    { key: 'notified', label: t('cco.stats.notified'), hint: t('backendMetrics.beforeArrival'), value: apiValue(result.data?.pct_recebedores_avisados, (value) => percent(value / 100)), tone: 'ok' },
    { key: 'stopped', label: t('cco.stats.stopped'), hint: t('backendMetrics.completed'), value: apiValue(result.data?.horas_paradas_media, (value) => t('units.hours', { value: number(value) })), tone: 'wait' },
    { key: 'stay', label: t('cco.stats.stay'), hint: t('backendMetrics.allStays'), value: apiValue(result.data?.estadia_devida_total, currency), tone: 'brand' },
    { key: 'escalated', label: t('backendMetrics.escalated'), hint: t('backendMetrics.escalationEvents'), value: apiValue(result.data?.tasks_escaladas), tone: result.data?.tasks_escaladas ? 'alert' : 'default' },
  ] : [
    { key: 'notified', label: t('cco.stats.notified'), hint: t('cco.stats.notifiedHint'), value: percent(result.data.notifiedRate), tone: 'ok' },
    { key: 'stopped', label: t('cco.stats.stopped'), hint: t('cco.stats.stoppedHint'), value: t('units.hours', { value: number(result.data.avgStoppedMin / 60) }), tone: 'wait' },
    { key: 'stay', label: t('cco.stats.stay'), hint: t('cco.stats.stayHint'), value: currency(result.data.stayDue), tone: 'brand' },
    { key: 'escalated', label: t('cco.stats.escalated'), hint: t('cco.stats.escalatedHint'), value: number(result.data.escalatedOpen), tone: result.data.escalatedOpen ? 'alert' : 'default' },
  ];

  return (
    <div className="cco-dashboard">
      <header className="cco-page-heading">
        <div><h1>{t('cco.monitoring')}</h1><p>{t('cco.monitoringHint')}</p></div>
        <Link to="/metrics" className="cco-secondary-link"><Icon name="metrics" className="h-4 w-4" />{t('cco.viewMetrics')}</Link>
      </header>
      <dl className="cco-stat-strip" aria-label={t('cco.summary')}>
        {stats.map((stat) => (
          <div key={stat.key} data-tone={stat.tone}><dt>{stat.label}</dt><dd>{stat.value}</dd><span>{stat.hint}</span></div>
        ))}
      </dl>
      <FleetMap key={mode} />
      <section className="cco-operation-panels" aria-label={t('cco.followUp')}><TaskQueue /><EventFeed limit={16} /></section>
      <section className="cco-performance" aria-labelledby="cco-performance-title">
        <div className="cco-section-heading"><div><h2 id="cco-performance-title">{t('cco.performance')}</h2><p>{t(mode === 'api' ? 'backendMetrics.source' : 'cco.performanceHint')}</p></div><Link to="/metrics" className="cco-secondary-link">{t('cco.viewMetrics')}<Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" /></Link></div>
        <div className="cco-kpi-grid"><KpiGrid /></div>
      </section>
    </div>
  );
}
