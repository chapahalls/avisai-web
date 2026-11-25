import type { TFunction } from 'i18next';
import type { FeedEvent } from '../../services/mock/engine';

/** Título, mensagem e resultado de um evento, igual em Demo e API. */
export function describeEvent(event: Pick<FeedEvent, 'type' | 'payload'>, t: TFunction, isApi: boolean) {
  const result = typeof event.payload.resultCode === 'string' ? t(`${isApi ? 'api.calls.results' : 'calls.results'}.${event.payload.resultCode}`, { dock: event.payload.dock, defaultValue: event.payload.resultCode }) : null;
  const channel = typeof event.payload.channel === 'string' ? t(`channels.${event.payload.channel}`, { defaultValue: event.payload.channel }) : null;
  const backendType = typeof event.payload.backendType === 'string' ? event.payload.backendType : null;
  const alertType = typeof event.payload.tipo === 'string' ? event.payload.tipo : null;
  const priority = event.payload.prioridade === 'critico' || event.payload.prioridade === 'atencao' ? event.payload.prioridade : 'info';
  const title = alertType
    ? t(`alerts.types.${alertType}`, { defaultValue: alertType })
    : isApi && backendType ? t(`api.events.${backendType}`, { defaultValue: backendType }) : t(`events.${event.type}`);
  const message = isApi
    ? typeof event.payload.backendMessage === 'string' ? event.payload.backendMessage : null
    : typeof event.payload.messageKey === 'string' ? t(event.payload.messageKey)
      : typeof event.payload.text === 'string' ? event.payload.text
        : typeof event.payload.details === 'string' ? event.payload.details : null;
  return { title, message, result, channel, alertType, priority } as const;
}
