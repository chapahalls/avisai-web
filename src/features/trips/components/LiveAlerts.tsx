import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOps } from '../../../services/operations';
import { APP_ROUTES } from '../../../lib/routes';

type AlertToast = {
  id: string;
  tripId: string;
  title: string;
  summary: string;
  priority: 'info' | 'atencao' | 'critico';
  plate: string;
};

const priorityClass = {
  info: 'border-brand-500/70 bg-brand-500/15',
  atencao: 'border-wait-500/70 bg-wait-500/15',
  critico: 'border-alert-500/70 bg-alert-500/15',
} as const;

function priorityFrom(value: unknown): AlertToast['priority'] {
  return value === 'critico' || value === 'atencao' ? value : 'info';
}

function playCriticalTone() {
  if (typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  try {
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
    oscillator.addEventListener('ended', () => { void context.close(); });
  } catch {
    // Navegadores podem bloquear áudio sem gesto; o alerta visual e aria-live continuam ativos.
  }
}

export function LiveAlerts({ onAlertSelect, onlyTripId }: { onAlertSelect?: (tripId: string) => void; onlyTripId?: string }) {
  const { t } = useTranslation();
  const feed = useOps((state) => state.feed);
  const known = useRef(new Set<string>());
  const initialized = useRef(false);
  const [toasts, setToasts] = useState<AlertToast[]>([]);

  useEffect(() => {
    if (!initialized.current) {
      feed.forEach((event) => known.current.add(event.id));
      initialized.current = true;
      return;
    }
    const incoming = feed.filter((event) => !known.current.has(event.id));
    incoming.forEach((event) => known.current.add(event.id));
    const alertToasts = incoming.flatMap((event) => {
      const rawType = typeof event.payload.tipo === 'string' ? event.payload.tipo : null;
      const priority = priorityFrom(event.payload.prioridade);
      if (onlyTripId && event.tripId !== onlyTripId) return [];
      if (!rawType && event.payload.backendType !== 'escalada_supervisor') return [];
      const title = rawType
        ? t(`alerts.types.${rawType}`, { defaultValue: rawType })
        : t('alerts.supervisor');
      const summary = typeof event.payload.resumo === 'string'
        ? event.payload.resumo
        : typeof event.payload.backendMessage === 'string'
          ? event.payload.backendMessage
          : t('alerts.received');
      const plate = typeof event.payload.plate === 'string' ? event.payload.plate : '';
      return [{ id: event.id, tripId: event.tripId, title, summary, priority, plate }];
    });
    if (!alertToasts.length) return;
    if (alertToasts.some((toast) => toast.priority === 'critico')) playCriticalTone();
    // Um mesmo veículo não acumula mais de um toast; o mais recente substitui o anterior.
    setToasts((current) => [...alertToasts, ...current.filter((toast) => !alertToasts.some((created) => created.tripId === toast.tripId))].slice(0, 6));
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => !alertToasts.some((created) => created.id === toast.id)));
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [feed, t, onlyTripId]);

  if (!toasts.length) return null;
  const visible = toasts.slice(0, 3);
  const overflow = toasts.length - visible.length;
  return (
    // `pointer-events-none` no contêiner e `pointer-events-auto` em cada toast: a pilha nunca bloqueia cliques
    // nos painéis abaixo, mesmo quando sua altura (limitada, com rolagem) chega a sobrepor outro conteúdo.
    <aside className="pointer-events-none fixed right-4 top-16 z-50 flex max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] flex-col gap-2.5 overflow-y-auto pb-1 sm:top-4" aria-live="assertive" aria-label={t('alerts.live')}>
      {visible.map((toast) => (
        <article key={toast.id} className={`pointer-events-auto rounded-card border-l-4 p-3.5 shadow-xl shadow-depth/40 ${priorityClass[toast.priority]}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-semibold">{toast.title}</span>
                {toast.plate && <span className="rounded bg-ink-950/30 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-50">{toast.plate}</span>}
                <span className="text-xs text-ink-200">{t(`alerts.priority.${toast.priority}`)}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-ink-100">{toast.summary}</p>
            </div>
            <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              className="shrink-0 rounded p-1 text-ink-200 hover:bg-ink-950/30" aria-label={t('alerts.dismiss')}>×</button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-3 text-xs font-semibold">
            {toast.tripId && <Link className="text-ink-50 underline" to={APP_ROUTES.trip(toast.tripId)}>{t('alerts.openTrip')}</Link>}
            {toast.tripId && onAlertSelect && <button type="button" onClick={() => {
              onAlertSelect(toast.tripId);
              setToasts((current) => current.filter((item) => item.id !== toast.id));
            }} className="text-ink-50 underline">{t('alerts.sendMessage')}</button>}
            {toast.priority === 'critico' && <Link className="text-ink-50 underline" to={APP_ROUTES.operator}>{t('alerts.openOperator')}</Link>}
          </div>
        </article>
      ))}
      {overflow > 0 && <p className="pointer-events-auto rounded-card border border-ink-700 bg-ink-900/90 px-3.5 py-2 text-center text-xs font-semibold text-ink-300 shadow-xl shadow-depth/40">
        {t('alerts.more', { count: overflow })}
      </p>}
    </aside>
  );
}
