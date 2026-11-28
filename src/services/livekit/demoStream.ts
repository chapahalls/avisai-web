import { type DemoBridgeEffect, effectForClientAction, effectForEvent, effectForSpeech } from './demoBridge';

/** Acompanha o `/cco/stream` da rota de demonstração enquanto a voz ao vivo ou a ligação real estão ativas. */
export function openDemoStream(baseUrl: string, routeId: number, onEffect: (effect: DemoBridgeEffect) => void): () => void {
  const source = new EventSource(`${baseUrl}/cco/stream?rota_id=${encodeURIComponent(String(routeId))}`);
  const listen = (channel: string, read: (data: Record<string, unknown>) => DemoBridgeEffect | null) => {
    source.addEventListener(channel, (event) => {
      let data: unknown;
      try { data = JSON.parse((event as MessageEvent<string>).data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const record = data as Record<string, unknown>;
      if (record.rota_id !== undefined && record.rota_id !== routeId) return;
      const effect = read(record);
      if (effect) onEffect(effect);
    });
  };
  listen('acao_cliente', (data) => effectForClientAction(data.acao, data.tela));
  listen('evento', (data) => effectForEvent(data.tipo, data.mensagem, data.dados));
  listen('fala', (data) => effectForSpeech(data.papel, data.texto));
  return () => source.close();
}
