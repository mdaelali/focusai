import { useState } from 'react'
import { SELF_STATUS_LABEL, STATE_LABEL, type BehaviorState } from '../engagement/behavior'
import type { ClassSample, ParticipantTotals } from '../room/useRoomHost'
import { fmtDuration, StateBadge, stateColor } from './StateBadge'

interface Props {
  students: ParticipantTotals[]
  timeline: ClassSample[]
  startedAt: number
  lessonName?: string
  onBack: () => void
  onDownload: () => void
}

/**
 * End-of-lesson review: one row per student with a colour strip of their whole
 * lesson, their share of time in each state, alerts, and an expandable list of
 * every episode. Everything here is also in the downloaded report.
 */
export function LessonReview({ students, timeline, startedAt, lessonName, onBack, onDownload }: Props) {
  const end = Math.max(Date.now(), ...students.map((s) => s.lastSeen))
  const span = Math.max(60_000, end - startedAt)
  const classAvg = timeline.length ? Math.round(timeline.reduce((a, s) => a + (s.okPct ?? 0), 0) / timeline.filter((s) => s.okPct !== null).length || 0) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Lesson review</div>
          <h2 className="text-xl font-semibold">{lessonName ?? 'This lesson'}</h2>
          <div className="text-sm text-[var(--muted)]">
            {fmtDuration(span)} · {students.length} student{students.length === 1 ? '' : 's'}
            {classAvg !== null && Number.isFinite(classAvg) && <> · class with you or busy {classAvg}% of the time</>}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--warn)' }}>Signals, not evidence. Each status is a few seconds of head and eye direction, shown to the student as it happened. Not for grading or discipline.</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="btn-ghost">
            Back to live view
          </button>
          <button type="button" onClick={onDownload} className="btn-primary">
            Download report (JSON + CSV)
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-[var(--muted)]">No student joined this lesson.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {students.map((s) => (
            <StudentRow key={s.id} s={s} startedAt={startedAt} span={span} />
          ))}
        </div>
      )}

      <div className="panel p-4 text-xs leading-relaxed text-[var(--muted)]">
        States describe where a head and eyes were pointed. Blue stretches are normal activities. Use the strips to
        see <em>when</em> attention dipped and match it to what you were doing, not to rank students. Nothing here
        belongs in a grade book.
      </div>
    </div>
  )
}

/** States a teacher would not call a dip. Everything else is listed as a dip. */
const NORMAL: ReadonlySet<BehaviorState> = new Set<BehaviorState>(['attentive', 'taking_notes'])

function StudentRow({ s, startedAt, span }: { s: ParticipantTotals; startedAt: number; span: number }) {
  const [open, setOpen] = useState(false)
  const [dipsOnly, setDipsOnly] = useState(true)
  const total = Object.values(s.byState).reduce((a, b) => a + (b ?? 0), 0)
  const pct = (st: BehaviorState) => (total > 0 ? Math.round(((s.byState[st] ?? 0) / total) * 100) : 0)
  const episodes = s.episodes.filter((e) => e.end - e.start >= 1000)
  const dips = episodes.filter((e) => !NORMAL.has(e.state))
  const shown = dipsOnly ? dips : episodes
  const longestDip = dips.reduce((m, e) => Math.max(m, e.end - e.start), 0)
  const order: BehaviorState[] = ['attentive', 'taking_notes', 'talking_to_someone', 'brief_interruption', 'stepped_away', 'distracted', 'using_phone', 'drowsy', 'no_data']

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold">{s.name}</span>
          <span className="text-xs text-[var(--muted)]">
            {fmtDuration(total)} tracked · {s.alerts} alert{s.alerts === 1 ? '' : 's'}
            {s.selfDeclaredMs > 0 && <> · self-declared {fmtDuration(s.selfDeclaredMs)}</>}
          </span>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="cursor-pointer text-xs text-[var(--info)] hover:underline">
          {open ? 'Hide episodes' : `Show ${shown.length} episodes`}
        </button>
      </div>

      {/* One-line summary: the numbers a teacher checks first */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">Attentive {pct('attentive')}%</span>
        <span className="text-[var(--muted)]">
          away {pct('stepped_away') + pct('brief_interruption')}% · {dips.length} dip{dips.length === 1 ? '' : 's'} · longest {dips.length ? fmtDuration(longestDip) : '—'}
        </span>
      </div>

      {/* Whole-lesson strip */}
      <div className="relative h-5 w-full overflow-hidden rounded-md bg-[var(--panel-2)]" title="Lesson timeline">
        {episodes.map((e, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{
              left: `${((e.start - startedAt) / span) * 100}%`,
              width: `${Math.max(0.3, ((e.end - e.start) / span) * 100)}%`,
              background: stateColor(e.state),
              opacity: e.selfStatus !== 'none' ? 0.55 : 1,
            }}
            title={`${STATE_LABEL[e.state]} · ${fmtDuration(e.end - e.start)} · ${e.reason}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        {order
          .filter((st) => (s.byState[st] ?? 0) > 0)
          .map((st) => (
            <span key={st} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: stateColor(st) }} />
              {STATE_LABEL[st]} {pct(st)}%
            </span>
          ))}
      </div>

      {s.alertLog.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {s.alertLog.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="tabular-nums text-[var(--muted)]">{new Date(a.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ color: a.severity === 'check_in' ? 'var(--warn)' : 'var(--info)' }}>{a.severity === 'check_in' ? 'Check in' : 'Info'}</span>
              <span className="text-[var(--muted)]">{a.message}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>{dipsOnly ? 'Showing dips only' : 'Showing every episode'}</span>
          <button type="button" onClick={() => setDipsOnly((v) => !v)} className="cursor-pointer text-[var(--info)] hover:underline">
            {dipsOnly ? 'Show all episodes' : 'Show dips only'}
          </button>
        </div>
      )}

      {open && (
        <table className="w-full text-left text-xs">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="py-1 pr-3 font-medium">From</th>
              <th className="py-1 pr-3 font-medium">Length</th>
              <th className="py-1 pr-3 font-medium">State</th>
              <th className="py-1 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="py-1 pr-3 tabular-nums text-[var(--muted)]">{new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td className="py-1 pr-3 tabular-nums">{fmtDuration(e.end - e.start)}</td>
                <td className="py-1 pr-3">
                  <StateBadge state={e.state} size="sm" />
                  {e.selfStatus !== 'none' && <span className="ml-1.5 text-[var(--info)]">marked: {SELF_STATUS_LABEL[e.selfStatus]}</span>}
                </td>
                <td className="py-1 text-[var(--muted)]">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
