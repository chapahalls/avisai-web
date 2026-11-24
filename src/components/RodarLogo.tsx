import type { CSSProperties, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import './brand.css';

/** Contorno do símbolo (fonte: docs/RODAR-telas/marca/rodar-icone.svg). O "R" é vazado: mostra o fundo. */
export const RODAR_MARK_PATH = 'M158 0L740 0A35 35 0 0 1 775 35L775 578.5A52 52 0 0 1 759.8 615.2L591.2 783.8A52 52 0 0 1 554.5 799L35 799A35 35 0 0 1 0 764L0 158A70 70 0 0 1 20.5 108.5L108.5 20.5A70 70 0 0 1 158 0ZM167.9 149.9L298.2 149.9A4 4 0 0 1 301.1 151.1L380.2 230.2A11.5 11.5 0 0 0 399.8 222L399.8 155.9A6 6 0 0 1 405.8 149.9L464 149.9C580.8 149.9 621.3 218 621.3 310.5C621.3 425.9 578.1 442 539 469L621.1 626A16 16 0 0 1 606.9 649.4L494.2 649.4A8 8 0 0 1 487.1 645.1L413.4 504.3A30 30 0 0 0 408 497L315.8 404.8A17.1 17.1 0 0 1 327.9 375.6L455.8 375.6A30 30 0 0 0 485.8 345.6L485.8 289.3A30 30 0 0 0 455.8 259.3L296.1 259.3A12 12 0 0 0 284.1 271.3L284.1 631.4A18 18 0 0 1 266.1 649.4L167.9 649.4A18 18 0 0 1 149.9 631.4L149.9 167.9A18 18 0 0 1 167.9 149.9Z';

/**
 * Símbolo RODAR: bloco lima com cantos chanfrados e o "R" vazado, na cor do token `rodar-mark`.
 * Com `label`, é uma imagem com nome acessível; sem ele, é decorativo.
 */
export function RodarMark({ label, className = '', ...props }: SVGProps<SVGSVGElement> & { label?: string }) {
  return (
    <svg
      viewBox="0 0 775 799"
      className={`rodar-mark ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" d={RODAR_MARK_PATH} />
    </svg>
  );
}

/**
 * Assinatura RODAR: símbolo + palavra "RODAR" (Kumbh Sans 750).
 * `size` é a altura do símbolo; a altura das maiúsculas fica em ≈ 0,53 dela e o espaço em ≈ 0,2.
 * A palavra pode ser ocultada por CSS (`.rodar-logo-word`) quando só cabe o símbolo.
 */
export function RodarLogo({ size, className = '' }: { size: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`rodar-logo ${className}`.trim()} style={{ '--rodar-logo-size': `${size}px` } as CSSProperties}>
      <RodarMark className="rodar-logo-mark" />
      <span className="rodar-logo-word">{t('app.name')}</span>
    </span>
  );
}
