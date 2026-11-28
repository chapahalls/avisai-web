import { API_BASE_URL } from '../../../lib/apiConfig';
import { ApiClient, ApiError } from '../../../services/api/client';
import { normalizeBrazilianMobile } from '../model';

/**
 * Demo pública: o visitante recebe no próprio celular a ligação do agente ao recebedor.
 * Ação explícita (número + aceite); um pedido por clique, sem repetição automática.
 * O backend valida de novo, limita por número, IP e dia, e devolve só o número mascarado.
 */
export type RealCallError = 'invalid_phone' | 'consent' | 'rate_limited' | 'unavailable' | 'failed';
export type RealCallResult = { ok: true; masked: string; routeId: number } | { ok: false; error: RealCallError };

export async function requestRealCall(phone: string, consent: boolean): Promise<RealCallResult> {
  if (!consent) return { ok: false, error: 'consent' };
  const normalized = normalizeBrazilianMobile(phone);
  if (!normalized) return { ok: false, error: 'invalid_phone' };
  if (!API_BASE_URL) return { ok: false, error: 'unavailable' };
  const client = new ApiClient(API_BASE_URL);
  try {
    const sso = await client.authSso();
    client.setAccessToken(sso.token);
    const call = await client.requestDemoCall(normalized, true);
    return { ok: true, masked: call.numero, routeId: call.rota_id };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return { ok: false, error: 'rate_limited' };
    if (error instanceof ApiError && error.status === 503) return { ok: false, error: 'unavailable' };
    if (error instanceof ApiError && error.status === 422) return { ok: false, error: 'invalid_phone' };
    return { ok: false, error: 'failed' };
  }
}
