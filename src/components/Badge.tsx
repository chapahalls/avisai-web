const tones = {
  brand: 'border-brand-500 bg-brand-500/15',
  ok: 'border-ok-500 bg-ok-500/15',
  wait: 'border-wait-500 bg-wait-500/15',
  alert: 'border-alert-500 bg-alert-500/15',
} as const;

/** Badge sempre com texto: cor nunca comunica sozinha. */
export function Badge({ label, tone }: { label: string; tone: keyof typeof tones }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-ink-50 ${tones[tone]}`}>{label}</span>;
}
