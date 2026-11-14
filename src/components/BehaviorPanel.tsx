import { SELF_STATUS_LABEL, type Alert, type BehaviorSnapshot, type SelfStatus } from '../engagement/behavior'
import { fmtDuration, StateBadge } from './StateBadge'

interface Props {
  snapshot: BehaviorSnapshot | null
  running: boolean
  alerts: Alert[]
  selfStatus: SelfStatus
  onSelfStatus: (s: SelfStatus) => void
  /** Compact layout for the participant page. */
  compact?: boolean
}

const SELF_OPTIONS: { value: SelfStatus; label: string; hint: string }[] = [
  { value: 'notes', label: 'Taking notes', hint: 'Head down is expected' },
  { value: 'busy', label: 'Interrupted', hint: 'Someone needs me for a moment' },
  { value: 'away', label: 'Stepping away', hint: 'Back in a few minutes' },
]

export function BehaviorPanel({ snapshot, running, alerts, selfStatus, onSelfStatus, compact }: Props) {
  const snap = running ? snapshot : null
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">What the host would see</div>
        {snap && <span className="text-[11px] tabular-nums text-[var(--muted)]">{fmtDuration(snap.durationMs)}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {snap ? <StateBadge state={snap.state} size="lg" /> : <span className="text-sm text-[var(--muted)]">Not running</span>}
        {snap?.selfStatus && snap.selfStatus !== 'none' && (
          <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)]">
            You marked: {SELF_STATUS_LABEL[snap.selfStatus]}
          </span>
        )}
      </div>
      {snap && (
        <div className="text-xs text-[var(--muted)]">
          {snap.reason}
          {snap.excused && snap.state !== 'attentive' && (
            <span style={{ color: 'var(--info)' }}> · treated as normal, no alert</span>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">Tell the host yourself (always trusted over the camera)</div>
        <div className="flex flex-wrap gap-1.5">
          {SELF_OPTIONS.map((o) => {
            const active = selfStatus === o.value
            return (
              <button
                key={o.value}
                type="button"
                title={o.hint}
                disabled={!running}
                onClick={() => onSelfStatus(active ? 'none' : o.value)}
                className="cursor-pointer rounded-md border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: active ? 'var(--info)' : 'var(--border)',
                  background: active ? 'color-mix(in srgb, var(--info) 15%, transparent)' : 'transparent',
                  color: active ? 'var(--info)' : 'var(--text)',
                }}
              >
                {o.label}
              </button>
            )
          })}
          {selfStatus !== 'none' && (
            <button
              type="button"
              onClick={() => onSelfStatus('none')}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-black"
              style={{ background: 'var(--accent)' }}
            >
              I'm back
            </button>
          )}
        </div>
      </div>

      {!compact && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">Alerts this session ({alerts.length})</div>
          {alerts.length === 0 ? (
            <div className="text-xs text-[var(--muted)]">None. Short interruptions, note-taking and talking to someone never alert.</div>
          ) : (
            <ul className="flex max-h-32 flex-col gap-1 overflow-auto text-xs">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span style={{ color: a.severity === 'check_in' ? 'var(--warn)' : 'var(--info)' }}>
                    {a.severity === 'check_in' ? 'Check in' : 'Info'}
                  </span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
