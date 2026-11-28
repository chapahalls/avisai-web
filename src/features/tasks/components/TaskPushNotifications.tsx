import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOps } from '../../../services/operations';

/**
 * Nível 1/3 do escalonamento do CCO (R4): "push" é uma notificação do navegador, via Notification API.
 * Não depende de backend nem de serviço de push; só funciona com a aba aberta e permissão concedida.
 * A permissão só é pedida a partir de um gesto do CCO (clique em "Ativar"); navegadores ignoram ou
 * bloqueiam o pedido feito sozinho, sem gesto, ao carregar a página.
 */
export function TaskPushNotifications() {
  const { t } = useTranslation();
  const feed = useOps((state) => state.feed);
  const known = useRef(new Set<string>());
  const initialized = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ));
  const [dismissed, setDismissed] = useState(false);

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

  if (permission !== 'default' || dismissed) return null;
  return (
    <aside className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-card border border-ink-700 bg-ink-900 p-3 text-sm shadow-xl shadow-depth/40" aria-label={t('push.enableTitle')}>
      <p className="text-ink-100">{t('push.enableTitle')}</p>
      <button type="button" onClick={enable} className="shrink-0 rounded-input bg-brand-500 px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-brand-600">{t('push.enable')}</button>
      <button type="button" onClick={() => setDismissed(true)} className="rounded p-1 text-ink-300 hover:bg-ink-950/30" aria-label={t('push.dismiss')}>×</button>
    </aside>
  );
}
