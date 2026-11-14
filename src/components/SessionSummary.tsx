import type { SessionSummary as Summary } from '../hooks/useSession'
import { MetricCard } from './MetricCard'
import { Timeline, fmtSec } from './Timeline'
import { scoreColor } from './EngagementGauge'

interface Props {
  summary: Summary
  onDismiss: () => void
}

export function SessionSummary({ summary, onDismiss }: Props) {
  const s = summary
  const lines = explain(s)

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Session summary</div>
          <div className="mt-1 text-lg font-semibold">Duration {fmtSec(s.durationSec)}</div>
          <div className="text-xs text-[var(--muted)]">
            {s.calibrated ? 'Calibrated to your screen position.' : 'Not calibrated. Angles measured relative to the camera.'}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-center">
            <div className="text-xs text-[var(--muted)]">Average</div>
            <div className="text-3xl font-semibold" style={{ color: s.avgScore === null ? 'var(--muted)' : scoreColor(s.avgScore) }}>
              {s.avgScore ?? '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[var(--muted)]">Lowest</div>
            <div className="text-3xl font-semibold" style={{ color: s.minScore === null ? 'var(--muted)' : scoreColor(s.minScore) }}>
              {s.minScore ?? '—'}
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--panel-2)]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Face detected" value={`${s.presentPct}%`} fraction={s.presentPct / 100} tone="ok" />
        <MetricCard label="Screen-directed gaze" value={`${s.onScreenPct}%`} fraction={s.onScreenPct / 100} />
        <MetricCard label="Head toward screen" value={`${s.headTowardPct}%`} fraction={s.headTowardPct / 100} tone="warn" />
        <MetricCard label="Looking away" value={`${s.lookingAwayPct}%`} fraction={s.lookingAwayPct / 100} tone="bad" />
        <MetricCard label="Insufficient data" value={`${s.insufficientPct}%`} hint="of the session" />
        <MetricCard label="Longest absence" value={fmtSec(s.longestAbsenceSec)} />
      </div>

      <Timeline data={s.timeline} title="Full session" height={240} />

      <div className="panel p-4 text-sm leading-relaxed">
        <div className="mb-2 text-sm font-medium">What this means</div>
        <ul className="list-disc space-y-1 pl-5 text-[var(--muted)]">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          <li>
            These numbers describe where your head and eyes were pointed. They are not a measure of concentration,
            understanding, or effort.
          </li>
        </ul>
      </div>
    </div>
  )
}

function explain(s: Summary): string[] {
  const out: string[] = []
  if (s.durationSec < 30) {
    out.push('This session was very short, so the percentages are not meaningful yet. Try a session of at least 10 minutes.')
    return out
  }
  if (s.presentPct < 80) {
    out.push(`A face was visible for ${s.presentPct}% of the session. Check the camera angle or whether you left the desk.`)
  }
  if (s.insufficientPct > 25) {
    out.push(`The camera could not measure reliably ${s.insufficientPct}% of the time. Better lighting or sitting closer usually fixes this.`)
  }
  if (s.onScreenPct >= 75) {
    out.push('Your gaze was directed at the screen most of the time.')
  } else if (s.onScreenPct >= 50) {
    out.push('Your gaze was off-screen for a noticeable share of the session. That can be note-taking or a second monitor, not necessarily distraction.')
  } else if (s.presentPct >= 80) {
    out.push('Your gaze was off-screen more often than on. If the lesson was on another monitor, calibrate while looking at it next time.')
  }
  if (s.longestAbsenceSec >= 60) {
    out.push(`The longest period with no face in view was ${fmtSec(s.longestAbsenceSec)}.`)
  }
  if (!s.calibrated) {
    out.push('Calibrating at the start of a session (look at the lesson and press Calibrate) makes gaze estimates noticeably more accurate.')
  }
  return out
}
