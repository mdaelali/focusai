import type { WindowStats } from '../engagement/engagement'

interface Props {
  stats: WindowStats | null
  running: boolean
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'var(--accent)'
  if (score >= 40) return 'var(--warn)'
  return 'var(--bad)'
}

export function EngagementGauge({ stats, running }: Props) {
  const score = stats?.score ?? null
  const insufficient = !running || !stats || stats.insufficient
  const r = 54
  const c = 2 * Math.PI * r
  const pct = score === null ? 0 : score / 100
  const color = score === null ? 'var(--muted)' : scoreColor(score)

  return (
    <div className="panel flex flex-col items-center gap-3 p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        Estimated visual engagement
      </div>
      <div className="relative h-[140px] w-[140px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="12" />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {insufficient ? (
            <span className="text-center text-sm leading-tight text-[var(--muted)]">
              {running ? 'Insufficient\ndata' : '—'}
            </span>
          ) : (
            <>
              <span className="text-4xl font-semibold" style={{ color }}>
                {score}
              </span>
              <span className="text-xs text-[var(--muted)]">/ 100</span>
            </>
          )}
        </div>
      </div>
      <div className="min-h-[2.5rem] text-center text-xs text-[var(--muted)]">
        {running && stats?.insufficient && stats.reason ? (
          <span style={{ color: 'var(--warn)' }}>{stats.reason}</span>
        ) : (
          <span>Rolling 10 s window. Indicates visual behaviour, not attention or understanding.</span>
        )}
      </div>
    </div>
  )
}
