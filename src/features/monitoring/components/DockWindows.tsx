import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { SIMULATION } from '../../../lib/config';
import { receiverById, useOps } from '../../../services/operations';
import { dockWindows } from '../model';

const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const span = DAY_END - DAY_START;
const position = (minute: number) => `${Math.min(100, Math.max(0, ((minute - DAY_START) / span) * 100))}%`;

/** Agenda de docas do dia por recebedor, com a linha do "agora". */
export function DockWindows({ onSelect }: { onSelect: (tripId: string) => void }) {
  const { t } = useTranslation();
  const { trips, calls, simMinutes } = useOps();
  const rows = dockWindows({ trips, calls, simMinutes });
  const now = SIMULATION.startHour * 60 + simMinutes;
  const ticks = Array.from({ length: 9 }, (_, index) => DAY_START + index * 120);

  return (
    <section className="mon-panel mon-docks" aria-labelledby="mon-docks-title">
      <header className="mon-panel-heading">
        <div className="mon-grid-title"><h2 id="mon-docks-title">{t('monitoring.docks.title')}</h2><p>{t('monitoring.docks.subtitle')}</p></div>
        <ul className="mon-legend">
          {(['waiting', 'unloaded', 'planned'] as const).map((kind) => <li key={kind}><i data-kind={kind} aria-hidden="true" />{t(`monitoring.docks.legend.${kind}`)}</li>)}
        </ul>
      </header>
      {!rows.length ? <p className="mon-empty">{t('monitoring.docks.empty')}</p> : (
        <div className="mon-dock-scroll">
          <div className="mon-dock-chart" style={{ '--now': position(now) } as CSSProperties}>
            <div className="mon-dock-axis" aria-hidden="true">
              <span />
              <div>{ticks.map((tick) => <b key={tick} style={{ left: position(tick) }}>{`${String(tick / 60).padStart(2, '0')}h`}</b>)}</div>
            </div>
            {rows.map((row) => (
              <div key={row.receiverId} className="mon-dock-row">
                <span className="mon-dock-name">{receiverById(row.receiverId).name}</span>
                <div className="mon-dock-track">
                  {row.bars.map((bar) => {
                    const kind = t(`monitoring.docks.kinds.${bar.kind}`);
                    const label = bar.dock !== undefined ? t('monitoring.docks.barDock', { plate: bar.plate, dock: bar.dock }) : t('monitoring.docks.bar', { plate: bar.plate, kind });
                    return (
                      <button key={bar.tripId} type="button" className="mon-dock-bar" data-kind={bar.kind}
                        style={{ left: position(bar.start), width: `calc(${position(bar.end)} - ${position(bar.start)})` }}
                        title={`${label} · ${kind}`} aria-label={`${label} · ${kind}`} onClick={() => onSelect(bar.tripId)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <span className="mon-dock-now" aria-label={t('monitoring.docks.now')} />
          </div>
        </div>
      )}
    </section>
  );
}
