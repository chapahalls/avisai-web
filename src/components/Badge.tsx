const tones = {
  brand: 'border-brand-500/35 bg-brand-500/10 text-brand-500',
  ok: 'border-ok-500/35 bg-ok-500/10 text-ok-500',
  wait: 'border-wait-500/35 bg-wait-500/10 text-wait-500',
  alert: 'border-alert-500/35 bg-alert-500/10 text-alert-500',
} as const;

/** Badge sempre com texto: cor nunca comunica sozinha. */
export function Badge({ label, tone }: { label: string; tone: keyof typeof tones }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{label}</span>;
}
