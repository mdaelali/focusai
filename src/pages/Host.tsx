import { useEffect, useMemo, useState } from 'react'
import { SELF_STATUS_LABEL, STATE_LABEL, type BehaviorState } from '../engagement/behavior'
import { useRoomHost, type RosterEntry } from '../room/useRoomHost'
import { fmtDuration, StateBadge, stateColor } from '../components/StateBadge'
import { useHostNotices } from '../room/useHostNotices'
import { ClassOverview } from '../components/ClassOverview'
import { LessonReview } from '../components/LessonReview'
import { ensureKeys, findPreset, findPresetByRoom, markUsed, SENSITIVITY_LABEL, SENSITIVITY_POLICY, upsertPreset, type LessonPreset } from '../lessons/presets'
import { formatRoomCode } from '../room/crypto'
import { JoinQr } from '../components/JoinQr'
import { holdWakeLock, notificationsPossible } from '../lib/device'

interface Props {
  room: string
  presetId: string | null
}

export default function Host({ room, presetId }: Props) {
  // The dashboard needs the lesson's private key, which lives only in the
  // browser that created the lesson. Without it there is nothing to decrypt.
  const [preset, setPreset] = useState<LessonPreset | null | 'missing'>(null)
  const [startedAt] = useState(() => Date.now())
  useEffect(() => {
    const found = (presetId ? findPreset(presetId) : null) ?? findPresetByRoom(room)
    if (!found) {
      setPreset('missing')
      return
    }
    void ensureKeys(found).then((p) => {
      if (p !== found) upsertPreset(p)
      if (p.roomCode !== room) {
        location.hash = `#/host/${p.roomCode}?preset=${p.id}`
        return
      }
      markUsed(p.id)
      setPreset(p)
    })
  }, [presetId, room])
  const live = preset && preset !== 'missing' ? preset : null
  const h = useRoomHost(
    room,
    live
      ? {
          lesson: { name: live.name, subject: live.subject, durationMin: live.durationMin, startedAt },
          policy: SENSITIVITY_POLICY[live.sensitivity],
        }
      : {},
    live?.hostKeys ?? null,
  )
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const n = useHostNotices(h.participants, h.alerts)

  const download = () => {
    const report = h.buildReport()
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `focusai-${room}-${stamp}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    // Also a CSV for spreadsheets.
    const cols = ['name', 'minutesTracked', 'attentivePct', 'notesPct', 'talkingPct', 'awayPct', 'elsewherePct', 'phonePct', 'eyesClosedPct', 'noDataPct', 'selfDeclaredMinutes', 'alerts'] as const
    const csv = [cols.join(','), ...report.participants.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
    const b2 = new Blob([csv], { type: 'text/csv' })
    const a2 = document.createElement('a')
    a2.href = URL.createObjectURL(b2)
    a2.download = `focusai-${room}-${stamp}.csv`
    a2.click()
    URL.revokeObjectURL(a2.href)
    // And every student's episodes, one row each.
    const rows = ['name,start,end,seconds,state,selfDeclared,reason']
    for (const r of report.participants) for (const e of r.episodes) rows.push([r.name, e.start, e.end, e.seconds, e.state, e.selfDeclared, e.reason].map((v) => JSON.stringify(v ?? '')).join(','))
    const b3 = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a3 = document.createElement('a')
    a3.href = URL.createObjectURL(b3)
    a3.download = `focusai-${room}-${stamp}-episodes.csv`
    a3.click()
    URL.revokeObjectURL(a3.href)
  }

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  // A teacher may run this on a phone propped next to the laptop: keep it awake.
  useEffect(() => holdWakeLock(), [])
  const [showQr, setShowQr] = useState(false)
  const notifyPossible = notificationsPossible()

  const unseen = h.alerts.filter((a) => !a.seen)
  useEffect(() => {
    const base = live ? `${live.name} · FocusAI` : 'FocusAI host'
    document.title = unseen.length ? `(${unseen.length}) ${base}` : base
  }, [unseen.length, live])

  const elapsedMin = (now - startedAt) / 60_000
  const lessonPct = live ? Math.min(100, Math.round((elapsedMin / live.durationMin) * 100)) : null
  const remainingMin = live ? Math.max(0, Math.ceil(live.durationMin - elapsedMin)) : null
  // Break reminder: a banner for 3 minutes each time a break interval passes.
  const breakDue = live && live.breakEveryMin > 0 && elapsedMin >= live.breakEveryMin
    ? elapsedMin % live.breakEveryMin < 3
    : false
  const lessonOver = live ? elapsedMin >= live.durationMin : false

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

  const needsCheckIn = h.participants.filter((p) => !p.left && (p.stale || !p.camera || (!p.excused && (p.state === 'stepped_away' || p.state === 'distracted' || p.state === 'drowsy' || p.state === 'using_phone'))))
  const checkInLabel = (p: RosterEntry) =>
    p.stale ? `connection lost ${fmtDuration(now - p.lastSeen)} ago` : !p.camera ? `camera off for ${fmtDuration(now - p.since)}` : `${STATE_LABEL[p.state].toLowerCase()} for ${fmtDuration(now - p.since)}`

  if (preset === 'missing') {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 px-4 py-10">
        <div className="panel flex flex-col gap-3 p-6">
          <h1 className="text-xl font-semibold tracking-tight">This room's key is not on this device</h1>
          <p className="text-sm text-[var(--muted)]">
            Room <span className="font-mono tracking-widest text-[var(--text)]">{formatRoomCode(room)}</span> belongs to a lesson whose key lives in the browser
            that created it. Students' statuses are encrypted to that key, so only that browser can open this dashboard. Open FocusAI
            where you created the lesson, or create a new lesson here.
          </p>
          <a href="#/" className="btn-primary self-start">
            Go to my lessons
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <a href="#/" className="hover:underline">
              Focus<span style={{ color: 'var(--accent)' }}>AI</span>
            </a>
            <span className="ml-3 rounded-md border border-[var(--border)] px-2 py-0.5 align-middle text-[11px] font-medium text-[var(--muted)]">
              {live ? live.subject || 'Lesson' : 'Host'}
            </span>
          </h1>
          {live && <div className="mt-1 text-lg font-medium">{live.name}</div>}
          <p className="mt-1 text-sm text-[var(--muted)]">
            Room code <span className="font-mono text-base font-semibold tracking-widest text-[var(--text)]">{formatRoomCode(room)}</span>
            {live && (
              <>
                <span className="mx-2">·</span>
                {live.durationMin} min · {SENSITIVITY_LABEL[live.sensitivity].toLowerCase()} alerts
              </>
            )}
            <span className="mx-2">·</span>
            {h.kind === 'supabase' ? 'students can join from any device' : 'demo mode: only tabs in this browser can join'}
            <span className="mx-2">·</span>
            end-to-end encrypted to this browser
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]">
            <input type="checkbox" checked={n.sound} onChange={(e) => n.setSound(e.target.checked)} className="accent-[var(--accent)]" />
            Sound
          </label>
          {n.desktop === 'default' && (
            <button
              type="button"
              onClick={n.requestDesktop}
              className="btn-ghost"
              title="Get a system notification when this tab is behind the meeting window"
            >
              Turn on notifications
            </button>
          )}
          {n.desktop === 'granted' && (
            <button type="button" onClick={() => void n.testNotification()} className="btn-ghost" title="Send yourself a sample alert. Switch to your meeting first to see it appear over it.">
              Notifications on · Send a test
            </button>
          )}
          {n.desktop === 'denied' && <span className="text-xs text-[var(--muted)]">Notifications blocked in browser settings</span>}
          <button type="button" onClick={copy} className="btn-ghost">
            {copied ? 'Copied' : 'Copy join link'}
          </button>
          <button type="button" onClick={() => setShowQr((v) => !v)} className="btn-ghost" aria-pressed={showQr} title="Students on phones can scan this">
            QR code
          </button>
          <button
            type="button"
            onClick={() => setReviewing((v) => !v)}
            title="Every student's timeline, episodes and alerts for this lesson"
            className="btn-primary"
          >
            {reviewing ? 'Back to live view' : 'End lesson & review'}
          </button>
        </div>
      </header>

      {n.notices.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
          {n.notices.map((t) => {
            const color = t.kind === 'info' ? 'var(--info)' : 'var(--warn)'
            return (
              <div
                key={t.id}
                className="panel pointer-events-auto flex items-start gap-3 p-3 shadow-lg"
                style={{ borderColor: color, background: 'color-mix(in srgb, ' + color + ' 10%, var(--panel))' }}
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-[var(--muted)]">{t.text}</div>
                  {t.kind === 'check_in' && <div className="mt-0.5 text-[11px]" style={{ color }}>Consider checking in</div>}
                </div>
                <button type="button" onClick={() => n.dismiss(t.id)} aria-label="Dismiss" className="cursor-pointer text-xs text-[var(--muted)] hover:text-[var(--text)]">
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showQr && (
        <div className="panel flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-center">
          <JoinQr url={joinLink} size={200} />
          <div className="text-center sm:text-left">
            <div className="text-lg font-semibold">Scan to join from a phone</div>
            <div className="mt-1 text-sm text-[var(--muted)]">Students point their camera app at this code. It opens the join page for room <span className="font-mono tracking-widest text-[var(--text)]">{room}</span>. Share your screen for a moment so everyone can scan it.</div>
            <code className="mt-2 block break-all rounded-md bg-[var(--panel-2)] px-2 py-1 text-xs">{joinLink}</code>
          </div>
        </div>
      )}

      {n.testResult && n.testResult !== 'pending' && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: n.testResult === 'shown' ? 'var(--info)' : 'var(--warn)', background: `color-mix(in srgb, ${n.testResult === 'shown' ? 'var(--info)' : 'var(--warn)'} 10%, transparent)` }}>
          {n.testResult === 'shown' ? (
            <>
              <div className="font-medium">The browser sent the test notification.</div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                If it did not appear on your screen, your operating system is hiding Chrome's notifications. On Windows: Settings → System →
                Notifications → turn <b>Do not disturb</b> off, open <b>Turn on do not disturb automatically</b> and untick "when using an app in
                full-screen mode" and "when playing a game" (Zoom and Meet count as full-screen apps), then scroll down and make sure Google Chrome
                is allowed and can show banners. On a Mac: System Settings → Notifications → Google Chrome → Allow, and turn Focus off while teaching.
                Then switch to your meeting and send the test again.
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">The browser could not show a notification.</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Click the lock icon in the address bar, set Notifications to Allow, reload this page and send the test again.
              </div>
            </>
          )}
        </div>
      )}

      {n.desktop !== 'granted' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <div className="text-sm">
            <div className="font-medium">You will be in Zoom or Meet while teaching. Alerts need to reach you there.</div>
            <div className="text-xs text-[var(--muted)]">
              {n.desktop === 'denied'
                ? 'Notifications are blocked for this site. Click the lock icon in the address bar, allow Notifications, then reload.'
                : n.desktop === 'unsupported'
                  ? notifyPossible === 'install-first'
                    ? 'On iPhone and iPad, notifications only work once FocusAI is on your home screen: tap Share, then "Add to Home Screen", and open it from there.'
                    : 'This browser cannot show system notifications. Keep this window visible on a second screen, or use Chrome or Edge.'
                  : 'Turn on notifications once. A system notification with a sound then appears over the meeting whenever a student steps away, turns the camera off or leaves.'}
            </div>
          </div>
          {n.desktop === 'default' && (
            <button type="button" onClick={n.requestDesktop} className="btn-primary">
              Turn on notifications
            </button>
          )}
        </div>
      )}

      {live && (
        <div className="panel flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="tabular-nums">
              <span className="font-medium">{fmtDuration(now - startedAt)}</span>
              <span className="text-[var(--muted)]"> elapsed</span>
            </span>
            <span className="tabular-nums text-[var(--muted)]">{lessonOver ? 'Planned time is up' : `${remainingMin} min left of ${live.durationMin}`}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
            <div className="h-full rounded-full" style={{ width: `${lessonPct}%`, background: lessonOver ? 'var(--warn)' : 'var(--accent)', transition: 'width 1s linear' }} />
          </div>
          {breakDue && (
            <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--info)', background: 'color-mix(in srgb, var(--info) 10%, transparent)' }}>
              <span className="font-medium">Break time.</span>{' '}
              <span className="text-[var(--muted)]">You asked to be reminded every {live.breakEveryMin} minutes.</span>
            </div>
          )}
          {live.notes && <div className="whitespace-pre-wrap text-xs text-[var(--muted)]">{live.notes}</div>}
        </div>
      )}

      {reviewing && (
        <LessonReview
          students={h.students}
          timeline={h.timeline}
          startedAt={startedAt}
          lessonName={live?.name}
          onBack={() => setReviewing(false)}
          onDownload={download}
        />
      )}

      <main className={reviewing ? 'hidden' : 'grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'}>
        <section className="flex flex-col gap-3">
          <ClassOverview participants={h.participants} timeline={h.timeline} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--text)]">{h.participants.length} participant{h.participants.length === 1 ? '' : 's'}</span>
            <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px]" title="A status is a few seconds of head and eye direction. Students see the same word you do and can correct it.">signals, not evidence</span>
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
              <div>Share the room code or the join link. Each person opens it next to the meeting, on a laptop or a phone, and starts sharing.</div>
              <code className="mt-2 max-w-full break-all rounded-md bg-[var(--panel-2)] px-2 py-1 text-xs">{joinLink}</code>
              <div className="mt-4">
                <JoinQr url={joinLink} size={160} />
              </div>
              <div className="text-xs">Phones can scan this</div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...h.participants]
                .sort((a, b) => Number(a.left) - Number(b.left) || Number(needsCheckIn.includes(b)) - Number(needsCheckIn.includes(a)) || a.name.localeCompare(b.name))
                .map((p) => (
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
                    <span className="text-xs text-[var(--muted)]">{checkInLabel(p)}</span>
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
            <div className="mb-1 font-medium text-[var(--text)]">How you are warned</div>
            The moment someone steps away, looks elsewhere, picks up a phone, closes their eyes, turns the camera off
            or leaves, their card turns amber, a toast appears here, a tone plays, and a system notification with sound
            appears over your meeting whenever this tab is not the one you are looking at. Check-in notifications stay
            on screen until you dismiss them. Windows hides notifications while an app is full screen unless you turn that
            rule off (Settings → System → Notifications → Turn on do not disturb automatically). Use "Send a test" to check.
            After a longer stretch a "consider checking in" alert is added to the list above. Blue states and
            self-declared statuses never trigger any of this.
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
  const attention = p.score !== null && p.camera && !p.left ? p.score : null
  if (p.left) {
    return (
      <div className="panel flex flex-col gap-2 p-4" style={{ opacity: 0.5 }}>
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-medium">{p.name}</div>
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)]">Left</span>
        </div>
        <div className="text-[11px] text-[var(--muted)]">
          Left at {new Date(p.leftAt ?? p.lastSeen).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {fmtDuration(now - (p.leftAt ?? p.lastSeen))} ago
        </div>
      </div>
    )
  }
  return (
    <div className="panel flex flex-col gap-2.5 p-4" style={{ opacity: p.stale ? 0.55 : 1, borderColor: p.stale || !p.camera ? 'var(--warn)' : undefined }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{p.name}</div>
          <div className="text-[11px]" style={{ color: p.stale || !p.camera ? 'var(--warn)' : 'var(--muted)' }}>
            {p.stale ? `Connection lost ${fmtDuration(now - p.lastSeen)} ago` : p.camera ? 'Sharing' : `Camera off for ${fmtDuration(now - p.since)}`}
          </div>
        </div>
        <span className="text-xl font-semibold tabular-nums" style={{ color: attention === null ? 'var(--muted)' : color }}>
          {attention ?? '—'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StateBadge state={p.camera ? p.state : 'no_data'} size="sm" />
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
