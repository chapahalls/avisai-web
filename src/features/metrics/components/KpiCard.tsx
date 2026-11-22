interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'wait' | 'alert' | 'ok';
}

const toneClass = { default: 'text-ink-50', wait: 'text-wait-500', alert: 'text-alert-500', ok: 'text-ok-500' };

export function KpiCard({ label, value, hint, tone = 'default' }: Props) {
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-ink-700 bg-ink-900 p-4 transition hover:border-ink-300/40">
      <p className="min-h-10 text-sm leading-5 text-ink-300">{label}</p>
      <p className={`mt-3 break-words font-display text-[clamp(1.25rem,2vw,1.8rem)] font-semibold leading-tight tabular-nums ${toneClass[tone]}`}>{value}</p>
      {hint && <p className="mt-3 text-xs leading-5 text-ink-300">{hint}</p>}
    </div>
  );
}
