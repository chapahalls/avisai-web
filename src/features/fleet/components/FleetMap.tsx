import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RECEIVERS, useOps } from '../../../services/mock/engine';
import { ORIGIN } from '../../../services/mock/data';
import type { LatLng } from '../../../types/geo';

const W = 640;
const H = 360;
const PAD = 30;
const phaseColor = { driving: '#099DFD', approaching: '#099DFD', waiting: '#F5A524', unloaded: '#17B26A' } as const;

/**
 * Mapa MOCK da frota em SVG. Mapa real (depois): @vis.gl/react-google-maps com VITE_GOOGLE_MAPS_API_KEY,
 * mesmas coordenadas, mesmos marcadores.
 */
export function FleetMap() {
  const { t } = useTranslation();
  const trips = useOps((s) => s.trips);
  const nav = useNavigate();
  const pts = [ORIGIN, ...RECEIVERS.map((r) => r.position)];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const pr = (p: LatLng) => ({ x: PAD + ((p.lng - c) / (d - c)) * (W - 2 * PAD), y: PAD + ((b - p.lat) / (b - a)) * (H - 2 * PAD) });
  const o = pr(ORIGIN);
  return (
    <div className="rounded-card border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h3 className="text-sm font-semibold">{t('fleet.title')}</h3>
        <span className="text-xs text-ink-300">{t('fleet.mock')}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('fleet.title')}>
        <rect width={W} height={H} fill="#121A2B" />
        {RECEIVERS.map((r) => {
          const p = pr(r.position);
          return (
            <g key={r.id}>
              <line x1={o.x} y1={o.y} x2={p.x} y2={p.y} stroke="#2A3550" strokeWidth={4} strokeLinecap="round" />
              <circle cx={p.x} cy={p.y} r={14} fill="#F5A524" opacity={0.15} />
              <circle cx={p.x} cy={p.y} r={5} fill="#F5A524" />
              <text x={p.x + 10} y={p.y - 10} fill="#A7B1C6" fontSize={11}>{r.name}</text>
            </g>
          );
        })}
        <circle cx={o.x} cy={o.y} r={7} fill="#099DFD" />
        <text x={o.x + 10} y={o.y + 4} fill="#A7B1C6" fontSize={11}>{t('fleet.origin')}</text>
        {trips.map((tr) => {
          const p = pr(tr.position);
          return (
            <g key={tr.id} className="cursor-pointer" onClick={() => nav(`/trips/${tr.id}`)}>
              <circle cx={p.x} cy={p.y} r={8} fill="#F4F6FA" stroke={phaseColor[tr.phase]} strokeWidth={3} />
              <text x={p.x + 10} y={p.y + 4} fill="#F4F6FA" fontSize={10}>{tr.plate}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 border-t border-ink-700 px-4 py-2 text-xs text-ink-300">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" />{t('fleet.driving')}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-wait-500" />{t('fleet.waiting')}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ok-500" />{t('fleet.unloaded')}</span>
      </div>
    </div>
  );
}
