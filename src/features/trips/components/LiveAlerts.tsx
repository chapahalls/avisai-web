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

export function LiveAlerts({ onAlertSelect }: { onAlertSelect?: (tripId: string) => void }) {
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
      if (!rawType && event.payload.backendType !== 'escalada_supervisor') return [];
      const title = rawType
        ? t(`alerts.types.${rawType}`, { defaultValue: rawType })
        : t('alerts.supervisor');
      const summary = typeof event.payload.resumo === 'string'
        ? event.payload.resumo
        : typeof event.payload.backendMessage === 'string'
          ? event.payload.backendMessage
          : t('alerts.received');
      return [{ id: event.id, tripId: event.tripId, title, summary, priority }];
    });
    if (!alertToasts.length) return;
    if (alertToasts.some((toast) => toast.priority === 'critico')) playCriticalTone();
    setToasts((current) => [...alertToasts, ...current].slice(0, 4));
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => !alertToasts.some((created) => created.id === toast.id)));
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [feed, t]);

  if (!toasts.length) return null;
  return (
    <aside className="fixed right-4 top-16 z-50 grid w-[min(26rem,calc(100vw-2rem))] gap-3 sm:top-4" aria-live="assertive" aria-label={t('alerts.live')}>
      {toasts.map((toast, index) => (
        <article key={toast.id} className={`rounded-card border-l-4 p-4 shadow-xl shadow-depth/40 ${index > 0 ? 'max-sm:hidden' : ''} ${priorityClass[toast.priority]}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-sm font-semibold">{toast.title}</p>
              <p className="mt-1 text-sm text-ink-100">{toast.summary}</p>
              <p className="mt-2 text-xs text-ink-200">{t(`alerts.priority.${toast.priority}`)}</p>
            </div>
            <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              className="rounded p-1 text-ink-200 hover:bg-ink-950/30" aria-label={t('alerts.dismiss')}>×</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
            {toast.tripId && <Link className="text-ink-50 underline" to={APP_ROUTES.trip(toast.tripId)}>{t('alerts.openTrip')}</Link>}
            {toast.tripId && onAlertSelect && <button type="button" onClick={() => {
              onAlertSelect(toast.tripId);
              setToasts((current) => current.filter((item) => item.id !== toast.id));
            }} className="text-ink-50 underline">{t('alerts.sendMessage')}</button>}
            {toast.priority === 'critico' && <Link className="text-ink-50 underline" to={APP_ROUTES.operator}>{t('alerts.openOperator')}</Link>}
          </div>
        </article>
      ))}
    </aside>
  );
}
