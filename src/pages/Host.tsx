import { useEffect, useMemo, useState } from 'react'
import { SELF_STATUS_LABEL, STATE_LABEL, type BehaviorState } from '../engagement/behavior'
import { useRoomHost, type RosterEntry } from '../room/useRoomHost'
import { fmtDuration, StateBadge, stateColor } from '../components/StateBadge'

interface Props {
  room: string
}

export default function Host({ room }: Props) {
  const h = useRoomHost(room)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)
  const [sound, setSound] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const unseen = h.alerts.filter((a) => !a.seen)
  useEffect(() => {
    document.title = unseen.length ? `(${unseen.length}) FocusAI host` : 'FocusAI host'
  }, [unseen.length])

  // Optional short beep for new check-in alerts.
  useEffect(() => {
    if (!sound || !unseen.some((a) => a.alert.severity === 'check_in')) return
    try {
      const ctx = new AudioContext()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 660
      g.gain.value = 0.05
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.15)
    } catch {
      /* no audio */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen.length, sound])

  const joinLink = `${location.origin}${location.pathname}#/join/${room}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  const counts = useMemo(() => {
    const c: Partial<Record<BehaviorState, number>> = {}
    for (const p of h.participants) c[p.state] = (c[p.state] ?? 0) + 1
    return c
  }, [h.participants])

  const needsCheckIn = h.participants.filter((p) => !p.excused && !p.stale && (p.state === 'stepped_away' || p.state === 'distracted' || p.state === 'drowsy'))

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <a href="#/" className="hover:underline">
              Focus<span style={{ color: 'var(--accent)' }}>AI</span>
            </a>
            <span className="ml-3 rounded-md border border-[var(--border)] px-2 py-0.5 align-middle text-[11px] font-medium text-[var(--muted)]">
              Host
            </span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Room code <span className="font-mono text-base font-semibold tracking-widest text-[var(--text)]">{room}</span>
            <span className="mx-2">·</span>
            {h.kind === 'supabase' ? 'Realtime: participants can join from any device' : 'Demo mode: only tabs in this browser can join'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="accent-[var(--accent)]" />
            Sound on check-in
          </label>
          <button
            type="button"
            onClick={copy}
            className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel-2)]"
          >
            {copied ? 'Copied' : 'Copy join link'}
          </button>
        </div>
      </header>

      <main className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--text)]">{h.participants.length} participant{h.participants.length === 1 ? '' : 's'}</span>
            {(Object.keys(counts) as BehaviorState[]).map((st) => (
              <span key={st} className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColor(st) }} />
                {counts[st]} {STATE_LABEL[st].toLowerCase()}
              </span>
            ))}
          </div>

          {h.participants.length === 0 ? (
            <div className="panel flex flex-col items-center gap-2 p-10 text-center text-sm text-[var(--muted)]">
              <div className="text-base font-medium text-[var(--text)]">Waiting for participants</div>
              <div>Share the room code or the join link. Each person opens it next to the meeting and starts sharing.</div>
              <code className="mt-2 rounded-md bg-[var(--panel-2)] px-2 py-1 text-xs">{joinLink}</code>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {h.participants.map((p) => (
                <ParticipantCard key={p.id} p={p} now={now} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <div className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Suggested check-ins</div>
              {needsCheckIn.length > 0 && <span className="text-xs" style={{ color: 'var(--warn)' }}>{needsCheckIn.length} now</span>}
            </div>
            {needsCheckIn.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">Nobody right now.</div>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {needsCheckIn.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {STATE_LABEL[p.state].toLowerCase()} for {fmtDuration(now - p.since)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Alerts</div>
              <div className="flex gap-3 text-xs">
                {unseen.length > 0 && (
                  <button type="button" onClick={() => h.markSeen()} className="cursor-pointer hover:underline">
                    Mark all seen
                  </button>
                )}
                {h.alerts.length > 0 && (
                  <button type="button" onClick={h.clearAlerts} className="cursor-pointer text-[var(--muted)] hover:underline">
                    Clear
                  </button>
                )}
              </div>
            </div>
            {h.alerts.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">
                No alerts yet. You are only alerted after long, unexplained patterns. Note-taking, short interruptions and
                talking to someone never alert.
              </div>
            ) : (
              <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
                {h.alerts.map((a) => (
                  <li
                    key={`${a.id}-${a.alert.id}`}
                    className="rounded-lg border p-2.5 text-sm"
                    style={{ borderColor: a.seen ? 'var(--border)' : a.alert.severity === 'check_in' ? 'var(--warn)' : 'var(--info)', opacity: a.seen ? 0.7 : 1 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-[11px] tabular-nums text-[var(--muted)]">{new Date(a.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: a.alert.severity === 'check_in' ? 'var(--warn)' : 'var(--info)' }}>
                      {a.alert.severity === 'check_in' ? 'Consider checking in' : 'For your information'}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">{a.alert.message}</div>
                    {!a.seen && (
                      <button type="button" onClick={() => h.markSeen(a.alert.id)} className="mt-1.5 cursor-pointer text-[11px] hover:underline">
                        Seen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-4 text-xs leading-relaxed text-[var(--muted)]">
            <div className="mb-1 font-medium text-[var(--text)]">What you are seeing</div>
            Each participant's camera is analysed on their own device. You receive a state label, how long it has
            lasted, and a rough visual engagement number. You never receive video. Blue states are normal activities
            and are never counted against anyone. Participants can override the camera by marking themselves.
          </div>
        </aside>
      </main>
    </div>
  )
}

function ParticipantCard({ p, now }: { p: RosterEntry; now: number }) {
  const color = stateColor(p.state)
  const attention = p.score !== null && p.camera ? p.score : null
  return (
    <div className="panel flex flex-col gap-2.5 p-4" style={{ opacity: p.stale ? 0.55 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{p.name}</div>
          <div className="text-[11px] text-[var(--muted)]">
            {p.stale ? `No update for ${fmtDuration(now - p.lastSeen)}` : p.camera ? 'Sharing' : 'Camera off'}
          </div>
        </div>
        <span className="text-xl font-semibold tabular-nums" style={{ color: attention === null ? 'var(--muted)' : color }}>
          {attention ?? '—'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={p.state} size="sm" />
        <span className="text-[11px] tabular-nums text-[var(--muted)]">{fmtDuration(now - p.since)}</span>
      </div>
      {p.selfStatus !== 'none' && (
        <div className="text-[11px]" style={{ color: 'var(--info)' }}>
          Marked themself: {SELF_STATUS_LABEL[p.selfStatus]}
        </div>
      )}
      <div className="text-[11px] text-[var(--muted)]">{p.reason}</div>
    </div>
  )
}
