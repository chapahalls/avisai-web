import type { CSSProperties } from 'react';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Esfera do AvisAI (espelha o AuroraVoiceOrb do app): faixa de luz que acelera ao falar e pulsa ao ouvir. */
export function AuroraOrb({ state, size, muted = false }: { state: OrbState; size: number; muted?: boolean }) {
  return (
    <span className="da-orb" data-state={state} data-muted={muted || undefined} style={{ '--orb-size': `${size}px` } as CSSProperties} aria-hidden="true">
      <span className="da-orb-band" />
      <span className="da-orb-shine" />
    </span>
  );
}
