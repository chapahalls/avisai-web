import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useOps } from '../../../services/operations';

/**
 * Nível 1/3 do escalonamento do CCO (R4): "push" é uma notificação do navegador, via Notification API.
 * Não depende de backend nem de serviço de push; só funciona com a aba aberta e permissão concedida.
 */
export function TaskPushNotifications() {
  const { t } = useTranslation();
  const feed = useOps((state) => state.feed);
  const known = useRef(new Set<string>());
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') void Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      feed.forEach((event) => known.current.add(event.id));
      initialized.current = true;
      return;
    }
    const incoming = feed.filter((event) => !known.current.has(event.id));
    incoming.forEach((event) => known.current.add(event.id));
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
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
  }, [feed, t]);

  return null;
}
