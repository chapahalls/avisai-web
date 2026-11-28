import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOps } from '../../../services/operations';

const DISMISSED_KEY = 'rodar:push-prompt-dismissed';

/**
 * Nível 1/3 do escalonamento do CCO (R4): "push" é uma notificação do navegador, via Notification API.
 * Não depende de backend nem de serviço de push; só funciona com a aba aberta e permissão concedida.
 * A permissão só é pedida a partir de um gesto do CCO (clique em "Ativar"); navegadores ignoram ou
 * bloqueiam o pedido feito sozinho, sem gesto, ao carregar a página. Esse aviso é distinto dos toasts
 * de `LiveAlerts`: aqueles aparecem só com a aba aberta e em foco; isto cobre a aba em segundo plano.
 * O descarte é lembrado (localStorage) para não repetir o pedido a cada troca de tela do Dashboard.
 */
export function TaskPushNotifications() {
  const { t } = useTranslation();
  const feed = useOps((state) => state.feed);
  const known = useRef(new Set<string>());
  const initialized = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ));
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!initialized.current) {
      feed.forEach((event) => known.current.add(event.id));
      initialized.current = true;
      return;
    }
    const incoming = feed.filter((event) => !known.current.has(event.id));
    incoming.forEach((event) => known.current.add(event.id));
    if (permission !== 'granted') return;
    incoming
      .filter((event) => event.payload.channel === 'push' && (event.type === 'TaskEscalated' || event.type === 'TaskCreated'))
      .forEach((event) => {
        const plate = typeof event.payload.plate === 'string' ? event.payload.plate : '';
        try {
          const notification = new Notification(t('push.title'), { body: t('push.body', { plate }), tag: event.id });
          void notification;
        } catch {
          // Alguns navegadores bloqueiam sem gesto do usuário; o alerta no painel continua valendo.
        }
      });
  }, [feed, t, permission]);

  const enable = () => {
    if (typeof Notification === 'undefined') return;
    void Notification.requestPermission().then(setPermission);
  };
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* armazenamento indisponível: só dura a sessão */ }
  };

  if (permission !== 'default' || dismissed) return null;
  return (
    <aside role="status" className="fixed bottom-4 left-4 z-50 flex max-w-md items-start gap-3 rounded-card border-2 border-wait-500 bg-ink-900 p-4 text-sm shadow-2xl shadow-depth/60 ring-4 ring-wait-500/20" aria-label={t('push.enableTitle')}>
      <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wait-500/40" />
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-wait-500/20 text-wait-500">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M12 2a6 6 0 0 0-6 6v3.1c0 .9-.3 1.8-.86 2.5L4 15.5c-.7.9-.06 2.2 1.06 2.2h13.9c1.12 0 1.76-1.3 1.06-2.2l-1.14-1.9A4.3 4.3 0 0 1 18 11.1V8a6 6 0 0 0-6-6Zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z" />
          </svg>
        </span>
      </span>
      <div className="flex-1">
        <p className="font-semibold leading-snug text-ink-50">{t('push.enableTitle')}</p>
        <p className="mt-1 text-xs leading-snug text-ink-300">{t('push.enableHint')}</p>
        <button type="button" onClick={enable} className="mt-2 rounded-input bg-brand-500 px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-brand-600">{t('push.enable')}</button>
      </div>
      <button type="button" onClick={dismiss} className="shrink-0 rounded p-1 text-ink-300 hover:bg-ink-950/30" aria-label={t('push.dismiss')}>×</button>
    </aside>
  );
}
