interface Props {
  label: string
  value: string
  hint?: string
  /** 0..1 fill for the bar; omit for no bar */
  fraction?: number
  tone?: 'neutral' | 'ok' | 'warn' | 'bad'
}

export function MetricCard({ label, value, hint, fraction, tone = 'neutral' }: Props) {
  const color =
    tone === 'ok' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--info)'
  return (
    <div className="panel flex flex-col gap-1.5 p-4">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {fraction !== undefined && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`,
              background: color,
              transition: 'width 250ms ease',
            }}
          />
        </div>
      )}
      {hint && <div className="text-[11px] text-[var(--muted)]">{hint}</div>}
    </div>
  )
}
