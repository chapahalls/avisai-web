interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'wait' | 'alert' | 'ok';
}

const toneClass = { default: 'text-ink-50', wait: 'text-wait-500', alert: 'text-alert-500', ok: 'text-ok-500' };

export function KpiCard({ label, value, hint, tone = 'default' }: Props) {
  return (
    <div className="rounded-card border border-ink-700 bg-ink-900 p-4">
      <p className="text-sm text-ink-300">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${toneClass[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-300">{hint}</p>}
    </div>
  );
}
