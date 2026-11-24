export type LoaderPhase = 'loading' | 'exit' | 'done';
export type LoaderStage = 'routes' | 'fleet' | 'cco' | 'ready';

/** Tempo mínimo do contador: evita um salto direto de 0 para 100 quando os arquivos já estão em cache. */
export const LOADER_MIN_MS = 1800;
/** Limite de segurança: um arquivo lento não prende o visitante na tela de carregamento. */
export const LOADER_MAX_MS = 8000;
/** Pausa em 100 antes da saída. */
export const LOADER_HOLD_MS = 350;
/** Duração da saída (o anel encolhe até o símbolo RODAR da abertura). */
export const LOADER_EXIT_MS = 1000;
/** Intervalo mínimo entre atualizações visíveis do contador. */
export const LOADER_STEP_MS = 60;
/** Marcações do anel. */
export const LOADER_TICKS = 120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Percentual-alvo do contador: o progresso real dos arquivos, limitado por um piso de tempo.
 * Só chega a 100 quando os arquivos terminaram E o tempo mínimo passou, ou quando o limite de segurança expira.
 */
export function loaderTarget(realFraction: number, elapsedMs: number, minMs = LOADER_MIN_MS, maxMs = LOADER_MAX_MS): number {
  if (elapsedMs >= maxMs) return 100;
  const real = clamp(Number.isFinite(realFraction) ? realFraction : 0, 0, 1) * 100;
  const time = minMs <= 0 ? 100 : clamp((elapsedMs / minMs) * 100, 0, 100);
  return Math.floor(Math.min(real, time));
}

/** Próximo valor exibido: só avança, em passos visíveis, e nunca ultrapassa o alvo. */
export function nextDisplayed(shown: number, target: number): number {
  if (target <= shown) return shown;
  const step = Math.max(1, Math.ceil((target - shown) * 0.18));
  return Math.min(target, shown + step);
}

export function loaderStage(progress: number): LoaderStage {
  if (progress >= 100) return 'ready';
  if (progress > 70) return 'cco';
  if (progress > 35) return 'fleet';
  return 'routes';
}

export function formatCounter(progress: number): string {
  return String(Math.floor(clamp(Number.isFinite(progress) ? progress : 0, 0, 100))).padStart(2, '0');
}

/** Padrão de traços que desenha LOADER_TICKS marcações num círculo de raio `radius`. */
export function tickDashArray(radius: number, ticks = LOADER_TICKS, tickWidth = 1.2): string {
  const period = (2 * Math.PI * radius) / ticks;
  return `${tickWidth} ${(period - tickWidth).toFixed(3)}`;
}
