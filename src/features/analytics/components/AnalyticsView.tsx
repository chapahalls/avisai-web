import { Fragment, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../../../lib/config';
import { receiverById, useReceivers } from '../../../services/operations';
import { hhmm } from '../../../utils/format';
import { useMetrics } from '../../metrics';
import { useRanking } from '../../receivers';
import { ALL, dayOfCall, minuteOfDayOfCall, toCsv, type AnalyticsFilters, type OccurrenceKind, type Period } from '../model';
import { useAnalytics } from '../useAnalytics';
import { AnalyticsCharts } from './AnalyticsCharts';
import './analytics.css';

const TABS = ['occurrences', 'calls', 'contacts', 'drivers', 'receivers'] as const;
type Tab = (typeof TABS)[number];
const PERIODS: Period[] = ['today', '7d', '30d'];
const KINDS: OccurrenceKind[] = ['receiverNoAnswer', 'overFranchise', 'gateQueue', 'backendAlert'];

type Row = { key: string; cells: ReactNode[]; csv: (string | number | null)[]; detail?: ReactNode; tone?: string };

/** Análises (mockup 05): filtros, indicadores, gráficos e cinco abas de detalhe. */
export function AnalyticsView() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt-BR';
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : 'occurrences';
  const [filters, setFilters] = useState<AnalyticsFilters>({ period: '7d', receiverId: ALL, driver: ALL, occurrence: ALL });
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);
  const data = useAnalytics(filters);
  const metrics = useMetrics();
  const ranking = useRanking();
  const receivers = useReceivers();
  const apiMode = data.mode === 'api';

  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const dash = <T,>(value: T | null | undefined, format: (value: T) => string) => value === null || value === undefined ? '—' : format(value);
  const clockOf = (minute: number | null) => minute === null ? '—' : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;
  const dayOf = (day: number) => day === data.today ? '' : `${t('analytics.daily.day', { offset: day - data.today })} · `;
  const driverName = (name: string) => !apiMode && /^Motorista [A-Z]$/.test(name) ? t('drivers.name', { letter: name.slice(-1) }) : name;
  const receiverName = (id: string | null) => id ? receiverById(id).name : '—';

  /* ----------------------------------------------------------------- indicadores */
  const k = data.kpis;
  const api = metrics.source === 'api' ? metrics.data : null;
  const kpis = [
    { key: 'trips', value: apiMode ? dash(api?.entregas, number) : number(k.trips), hint: apiMode ? t('analytics.kpis.serverHint') : t('analytics.kpis.tripsHint', { drivers: k.drivers, receivers: k.receivers }) },
    { key: 'calls', value: number(k.calls), hint: apiMode ? t('analytics.kpis.sessionHint') : t('analytics.kpis.callsHint', { answered: k.answeredCalls }) },
    { key: 'firstAnswer', value: apiMode ? dash(api?.pct_ligacoes_atendidas, (value) => percent(value / 100)) : dash(k.firstAnswerRate, percent), hint: t(apiMode ? 'analytics.kpis.serverHint' : 'analytics.kpis.firstAnswerHint'), tone: 'ok' },
    { key: 'escalations', value: apiMode ? dash(api?.tasks_escaladas, number) : number(k.escalations), hint: t(apiMode ? 'analytics.kpis.serverHint' : 'analytics.kpis.escalationsHint'), tone: 'wait' },
    { key: 'occurrences', value: number(k.occurrences), hint: t('analytics.kpis.occurrencesHint', { open: k.openOccurrences }), tone: 'alert' },
    { key: 'avgWait', value: apiMode ? dash(api?.horas_paradas_media, (value) => hhmm(value * 60, locale)) : dash(k.avgWaitMin, (value) => hhmm(value, locale)), hint: t('analytics.kpis.avgWaitHint', { hours: BUSINESS.franchiseHours }) },
    { key: 'stay', value: apiMode ? dash(api?.estadia_devida_total, money) : money(k.stayDue), hint: apiMode ? t('analytics.kpis.serverHint') : t('analytics.kpis.stayHint', { charged: money(k.stayCharged) }), tone: 'wait' },
    { key: 'contactsAvoided', value: apiMode ? dash(api?.contatos_resolvidos_pelo_agente, number) : number(k.contactsAvoided), hint: t(apiMode ? 'analytics.kpis.serverHint' : 'analytics.kpis.contactsAvoidedHint'), tone: 'ok' },
    { key: 'ccoAction', value: apiMode ? dash(api?.tempo_ate_acao_cco_min_media, (value) => t('analytics.minutes', { value: number(value) })) : dash(k.avgCcoActionMin, (value) => t('analytics.minutes', { value: number(value) })), hint: t(apiMode ? 'analytics.kpis.serverHint' : 'analytics.kpis.ccoActionHint') },
    { key: 'notified', value: apiMode ? dash(api?.pct_recebedores_avisados, (value) => percent(value / 100)) : dash(k.notifiedRate, percent), hint: t(apiMode ? 'analytics.kpis.serverHint' : 'analytics.kpis.notifiedHint'), tone: 'ok' },
  ];

  /* ------------------------------------------------------------------- abas */
  const buildTables = (): Record<Tab, { columns: string[]; rows: Row[] }> => {
    const yesNo = (value: boolean) => t(value ? 'analytics.yes' : 'analytics.no');
    const kindLabel = (kind: OccurrenceKind, backendType?: string) => kind === 'backendAlert' && backendType
      ? t(`alerts.types.${backendType}`, { defaultValue: backendType }) : t(`analytics.occurrenceKinds.${kind}`);
    const occurrences = {
      columns: ['opened', 'type', 'plateDriver', 'where', 'detectedBy', 'attempts', 'escalated', 'status'],
      rows: data.occurrences.map((row): Row => ({
        key: row.id,
        tone: row.status,
        csv: [`${dayOf(row.day)}${clockOf(row.minuteOfDay)}`, kindLabel(row.kind, row.backendType), `${row.plate} · ${driverName(row.driver)}`, receiverName(row.receiverId), t(`analytics.detectedBy.${row.detectedBy}`), row.attempts, yesNo(row.escalated), t(`analytics.status.${row.status}`)],
        cells: [
          <span className="anl-mono">{dayOf(row.day)}{clockOf(row.minuteOfDay)}</span>,
          <strong>{kindLabel(row.kind, row.backendType)}</strong>,
          <><span className="anl-plate">{row.plate}</span> · {driverName(row.driver)}</>,
          receiverName(row.receiverId),
          t(`analytics.detectedBy.${row.detectedBy}`),
          row.attempts === null ? '—' : `${row.attempts}×`,
          yesNo(row.escalated),
          <span className="anl-status" data-tone={row.status === 'open' ? 'alert' : 'ok'}>{t(`analytics.status.${row.status}`)}</span>,
        ],
      })),
    };
    const calls = {
      columns: ['time', 'fromTo', 'plate', 'request', 'result', 'transcript'],
      rows: data.calls.map((call): Row => {
        const isApi = call.source === 'api';
        const result = t(`${isApi ? 'api.calls.results' : 'calls.results'}.${call.resultCode}`, { dock: call.dock, defaultValue: call.status ?? call.result });
        const tone = call.resultCode === 'dock_confirmed' ? 'ok' : call.resultCode === 'no_answer' || call.resultCode === 'failed' ? 'alert' : 'wait';
        const time = `${dayOf(dayOfCall(call))}${clockOf(minuteOfDayOfCall(call))}`;
        const open = openTranscript === call.id;
        return {
          key: call.id,
          csv: [time, t(`analytics.fromTo.${call.moment}`), call.plate, t(`analytics.requests.${call.moment}`), result, call.transcript.map((line) => `${line.who}: ${isApi || !line.messageKey ? line.text : t(line.messageKey, line.values ?? {})}`).join(' | ')],
          cells: [
            <span className="anl-mono">{time}</span>,
            <span className="anl-chip" data-moment={call.moment}>{t(`analytics.fromTo.${call.moment}`)}</span>,
            <span className="anl-plate">{call.plate}</span>,
            t(`analytics.requests.${call.moment}`),
            <span data-tone={tone} className="anl-result">{result}</span>,
            <button type="button" className="anl-link" aria-expanded={open} onClick={() => setOpenTranscript(open ? null : call.id)}>{t(open ? 'analytics.hideTranscript' : 'analytics.showTranscript')}</button>,
          ],
          detail: open ? (
            call.transcript.length ? <ol className="anl-transcript">{call.transcript.map((line, index) => <li key={index} data-who={line.who}><strong>{t(`monitoring.call.who.${line.who}`)}</strong> · {isApi || !line.messageKey ? line.text : t(line.messageKey, line.values ?? {})}</li>)}</ol>
              : <p className="anl-empty">{t('analytics.noTranscript')}</p>
          ) : undefined,
        };
      }),
    };
    const contacts = {
      columns: ['time', 'contactType', 'who', 'reason', 'actionTime', 'outcome'],
      rows: data.contacts.map((row): Row => ({
        key: row.id,
        csv: [`${dayOf(row.day)}${clockOf(row.minuteOfDay)}`, t(`analytics.contactKinds.${row.kind}`), `${row.plate} · ${receiverName(row.receiverId)}`, t('analytics.contactReason', { attempts: row.attempts, max: BUSINESS.maxCcoAttempts }), row.actionMin, t(`analytics.outcomes.${row.outcome}`)],
        cells: [
          <span className="anl-mono">{dayOf(row.day)}{clockOf(row.minuteOfDay)}</span>,
          <span className="anl-chip" data-moment="escalation">{t(`analytics.contactKinds.${row.kind}`)}</span>,
          <><span className="anl-plate">{row.plate}</span> · {receiverName(row.receiverId)}</>,
          t('analytics.contactReason', { attempts: row.attempts, max: BUSINESS.maxCcoAttempts }),
          <span className="anl-mono">{row.actionMin === null ? '—' : t('analytics.minutes', { value: row.actionMin })}</span>,
          t(`analytics.outcomes.${row.outcome}`),
        ],
      })),
    };
    const drivers = {
      columns: ['driver', 'trips', 'avgWait', 'notified', 'escalations', 'occurrences', 'stay'],
      rows: data.driverRows.map((row): Row => ({
        key: row.driver,
        csv: [driverName(row.driver), row.trips, row.avgWaitMin === null ? null : hhmm(row.avgWaitMin, locale), row.notifiedRate === null ? null : percent(row.notifiedRate), row.escalations, row.occurrences, row.stayDue],
        cells: [
          <span className="anl-person"><strong>{driverName(row.driver)}</strong><span className="anl-plate">{row.plates.join(' · ')}</span></span>,
          row.trips,
          dash(row.avgWaitMin, (value) => hhmm(value, locale)),
          dash(row.notifiedRate, percent),
          row.escalations,
          row.occurrences,
          money(row.stayDue),
        ],
      })),
    };
    const receiverRows: Row[] = ranking.source === 'api'
      ? (ranking.data ?? []).map((row) => ({
          key: row.recebedor,
          csv: [row.recebedor, row.entregas, row.espera_media_h === null ? null : hhmm(row.espera_media_h * 60, locale), null, row.ligacoes ? percent(row.ligacoes_atendidas / row.ligacoes) : null, row.entregas ? percent(row.avisados_antes_da_chegada / row.entregas) : null, null, row.estadia_devida],
          cells: [<strong>{row.recebedor}</strong>, row.entregas, dash(row.espera_media_h, (value) => hhmm(value * 60, locale)), '—', row.ligacoes ? percent(row.ligacoes_atendidas / row.ligacoes) : '—', row.entregas ? percent(row.avisados_antes_da_chegada / row.entregas) : '—', '—', money(row.estadia_devida)],
        }))
      : data.receiverRows.map((row) => ({
          key: row.receiverId,
          csv: [receiverName(row.receiverId), row.deliveries, row.avgWaitMin === null ? null : hhmm(row.avgWaitMin, locale), number(row.stoppedHours), row.answerRate === null ? null : percent(row.answerRate), row.notifiedRate === null ? null : percent(row.notifiedRate), row.occurrences, row.stayDue],
          cells: [
            <strong>{receiverName(row.receiverId)}</strong>, row.deliveries,
            <span data-tone={(row.avgWaitMin ?? 0) > BUSINESS.franchiseHours * 60 ? 'alert' : (row.avgWaitMin ?? 0) > 4 * 60 ? 'wait' : undefined}>{dash(row.avgWaitMin, (value) => hhmm(value, locale))}</span>,
            `${number(row.stoppedHours)} h`, dash(row.answerRate, percent), dash(row.notifiedRate, percent), row.occurrences, money(row.stayDue),
          ],
        }));
    return {
      occurrences, calls, contacts, drivers,
      receivers: { columns: ['receiver', 'deliveries', 'avgWait', 'stopped', 'answers', 'dockBefore', 'occurrences', 'stay'], rows: receiverRows },
    };
  };
  const tables = buildTables();

  const active = tables[tab];
  const exportCsv = () => {
    const csv = toCsv(active.columns.map((column) => t(`analytics.columns.${column}`)), active.rows.map((row) => row.csv));
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = t('analytics.exportFile', { tab });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const activeFilters = [filters.receiverId, filters.driver, filters.occurrence].filter((value) => value !== ALL).length;
  const setFilter = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="anl">
      <header className="anl-heading">
        <div>
          <p className="anl-eyebrow">{t('analytics.eyebrow')}</p>
          <h1>{t('analytics.title')}</h1>
          <p>{t('analytics.subtitle')}</p>
        </div>
        <button type="button" className="anl-button" onClick={exportCsv} disabled={!active.rows.length}>{t('analytics.export')}</button>
      </header>

      <section className="anl-filters" aria-label={t('analytics.filters.label')}>
        <div className="anl-segmented" role="group" aria-label={t('analytics.filters.period')}>
          {PERIODS.map((period) => <button key={period} type="button" aria-pressed={filters.period === period} onClick={() => setFilter('period', period)}>{t(`analytics.filters.periods.${period}`)}</button>)}
        </div>
        <label><span>{t('analytics.filters.receiver')}</span>
          <select value={filters.receiverId} onChange={(event) => setFilter('receiverId', event.target.value)}>
            <option value={ALL}>{t('analytics.filters.all')}</option>
            {receivers.map((receiver) => <option key={receiver.id} value={receiver.id}>{receiver.name}</option>)}
          </select>
        </label>
        <label><span>{t('analytics.filters.driver')}</span>
          <select value={filters.driver} onChange={(event) => setFilter('driver', event.target.value)}>
            <option value={ALL}>{t('analytics.filters.all')}</option>
            {data.drivers.map((driver) => <option key={driver} value={driver}>{driverName(driver)}</option>)}
          </select>
        </label>
        <label><span>{t('analytics.filters.occurrence')}</span>
          <select value={filters.occurrence} onChange={(event) => setFilter('occurrence', event.target.value as AnalyticsFilters['occurrence'])}>
            <option value={ALL}>{t('analytics.filters.all')}</option>
            {KINDS.map((kind) => <option key={kind} value={kind}>{t(`analytics.occurrenceKinds.${kind}`)}</option>)}
          </select>
        </label>
        <p className="anl-filter-state">{activeFilters ? t('analytics.filters.active', { count: activeFilters }) : t('analytics.filters.none')}</p>
        {apiMode && <p className="anl-filter-note">{t('analytics.filters.apiNote')}</p>}
      </section>

      <dl className="anl-kpis" aria-label={t('analytics.kpis.label')}>
        {kpis.map((item) => <div key={item.key} data-tone={item.tone}><dt>{t(`analytics.kpis.${item.key}`)}</dt><dd>{item.value}</dd><span>{item.hint}</span></div>)}
      </dl>

      <AnalyticsCharts deliveries={data.deliveries} calls={data.calls} occurrences={data.allOccurrences} today={data.today} period={filters.period} apiMode={apiMode} />

      <section className="anl-card anl-tabs-card" aria-label={t('analytics.tabs.label')}>
        <div className="anl-tabs" role="tablist" aria-label={t('analytics.tabs.label')}>
          {TABS.map((item) => (
            <button key={item} type="button" role="tab" id={`anl-tab-${item}`} aria-selected={tab === item} aria-controls="anl-tab-panel"
              onClick={() => { setOpenTranscript(null); setParams((current) => { const next = new URLSearchParams(current); next.set('tab', item); return next; }, { replace: true }); }}>
              {t(`analytics.tabs.${item}`)}<span>{tables[item].rows.length}</span>
            </button>
          ))}
        </div>
        <div id="anl-tab-panel" role="tabpanel" aria-labelledby={`anl-tab-${tab}`} className="anl-table-wrap">
          <table className="anl-table">
            <thead><tr>{active.columns.map((column) => <th key={column} scope="col">{t(`analytics.columns.${column}`)}</th>)}</tr></thead>
            <tbody>
              {!active.rows.length && <tr><td colSpan={active.columns.length} className="anl-empty">{t('analytics.tabs.empty')}</td></tr>}
              {active.rows.map((row) => (
                <Fragment key={row.key}>
                  <tr>{row.cells.map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>
                  {row.detail && <tr className="anl-detail"><td colSpan={active.columns.length}>{row.detail}</td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
