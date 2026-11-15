import { useEffect, useState } from 'react'
import { useSession } from '../hooks/useSession'
import { useRoomParticipant } from '../room/useRoomParticipant'
import { WebcamView } from '../components/WebcamView'
import { BehaviorPanel } from '../components/BehaviorPanel'
import { StateBadge } from '../components/StateBadge'
import { holdWakeLock, isPhoneOrTablet } from '../lib/device'
import { formatRoomCode } from '../room/crypto'
import { STATE_LABEL, type BehaviorSnapshot, type BehaviorState } from '../engagement/behavior'

/** States that accuse. The student gets a moment to answer before the teacher sees them. */
const GRACE_STATES: ReadonlySet<BehaviorState> = new Set<BehaviorState>(['using_phone', 'drowsy', 'distracted'])
const GRACE_MS = 10_000

interface Props {
  room: string
  name: string
}

export default function Join({ room, name }: Props) {
  const s = useSession()
  const r = useRoomParticipant(room, name, (h) => {
    if (h.policy) s.setPolicy(h.policy)
  })
  const [consented, setConsented] = useState(false)
  const [phone] = useState(isPhoneOrTablet)
  // On a phone the OS pauses the camera the moment another app is in front.
  // Track that explicitly so the host hears "switched to another app", not silence.
  const [inBackground, setInBackground] = useState(false)
  const running = s.status === 'running'
  const [, forceTick] = useState(0)

  // Grace: while an accusatory state is younger than GRACE_MS and the student
  // has not said anything, the teacher sees "brief interruption" instead.
  const snap = s.live.behavior
  const graceLeftMs = snap && GRACE_STATES.has(snap.state) && snap.selfStatus === 'none' ? Math.max(0, GRACE_MS - (performance.now() - snap.since)) : 0
  const inGrace = running && graceLeftMs > 0
  useEffect(() => {
    if (!inGrace) return
    const t = window.setInterval(() => forceTick((n) => n + 1), 500)
    return () => window.clearInterval(t)
  }, [inGrace])
  const shared: BehaviorSnapshot | null = inGrace && snap ? { ...snap, state: 'brief_interruption', excused: true, reason: 'Checking with the student' } : snap

  useEffect(() => {
    if (!phone) return
    const on = () => setInBackground(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [phone])

  // Keep the screen awake while sharing; a sleeping phone is a dead camera.
  useEffect(() => {
    if (!running) return
    return holdWakeLock()
  }, [running])

  // Push the newest state to the room whenever it changes.
  useEffect(() => {
    const stalled = running && s.live.cameraStalled
    const paused = running && (stalled || inBackground)
    const note = inBackground ? 'Switched to another app on their phone' : stalled ? 'Camera is not delivering frames' : null
    r.publish(shared, s.live.window?.score ?? null, running && !paused, note)
    // Backgrounded phones suspend timers almost immediately: send right now.
    if (inBackground) r.flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, s.live.window?.score, running, s.live.cameraStalled, inBackground])

  const start = () => {
    setConsented(true)
    void s.start()
  }

  const leave = () => {
    if (running) s.stop()
    location.hash = '#/'
  }

  const showConsent = !consented || s.status === 'idle' || s.status === 'stopped' || s.status === 'error'

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 py-5 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Focus<span style={{ color: 'var(--accent)' }}>AI</span>
            </h1>
            <span className="rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] tracking-widest text-[var(--muted)]">{formatRoomCode(room)}</span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {r.lesson ? <span className="text-[var(--text)]">{r.lesson.name}</span> : 'Waiting for the host'}
            {' · '}joined as {name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && s.live.cameraStalled && (
            <span className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
              Camera is not delivering frames
            </span>
          )}
          {running && !s.live.cameraStalled && shared && <StateBadge state={shared.state} />}
          <button type="button" onClick={leave} className="btn-ghost">
            Leave
          </button>
        </div>
      </header>

      {r.link === 'untrusted' && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}>
          Someone is answering on this room code, but their key does not match it. Nothing is being sent. Check the code with your teacher.
        </div>
      )}
      {running && r.link === 'connecting' && (
        <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          Waiting for your teacher's room to answer. Nothing is sent until their key is verified.
        </div>
      )}

      {inGrace && snap && (
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }} role="alert">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">The camera reads "{STATE_LABEL[snap.state]}".</span>{' '}
              <span className="text-[var(--muted)]">Your teacher will see it in {Math.ceil(graceLeftMs / 1000)} s unless you say otherwise.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => s.setSelfStatus('fine')} className="btn-primary" style={{ minHeight: '2.25rem', padding: '0.4rem 0.9rem' }}>
                I'm fine
              </button>
              <button type="button" onClick={() => s.setSelfStatus('notes')} className="btn-ghost" style={{ minHeight: '2.25rem', padding: '0.4rem 0.9rem' }}>
                Taking notes
              </button>
              <button type="button" onClick={() => s.setSelfStatus('away')} className="btn-ghost" style={{ minHeight: '2.25rem', padding: '0.4rem 0.9rem' }}>
                Stepping away
              </button>
            </div>
          </div>
        </div>
      )}

      {s.error && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}>
          {s.error}
        </div>
      )}

      {showConsent && (
        <section className="panel panel-glow flex flex-col gap-5 p-5 md:p-7">
          <div>
            <span className="eyebrow">Before you share</span>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Your camera stays with you</h2>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm text-[var(--muted)]">
            <Point>Your video is analysed only on this device. No frame or image is sent anywhere.</Point>
            <Point>
              Your host receives a short status (attentive, taking notes, talking to someone, stepped away) and a 0–100
              estimate. Nothing else.
            </Point>
            <Point>Writing notes, picking something up, or talking to someone who walked in are treated as normal.</Point>
            <Point>You can mark yourself as busy or away at any time, and stop sharing whenever you like.</Point>
            <Point>Everything you send is encrypted to your teacher's key. Classmates with the room code cannot read it or pretend to be you.</Point>
            <Point>You always see the same word your teacher sees, and you get 10 seconds to correct it before it is shown.</Point>
          </ul>
          {phone && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm">
              <div className="font-medium">Using a phone</div>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[var(--muted)]">
                <li>Prop it up so the front camera sees your face, roughly where you look at the lesson.</li>
                <li>Keep this screen open. It stays awake by itself.</li>
                <li>If you switch to another app, the camera pauses and your host is told until you come back.</li>
                <li>If the meeting is on this same phone, use split screen, or join the meeting from another device.</li>
              </ul>
            </div>
          )}
          <button type="button" onClick={start} disabled={s.status === 'loading'} className="btn-primary w-full disabled:cursor-wait sm:w-auto sm:self-start">
            {s.status === 'loading' ? 'Loading the models…' : 'I agree, start sharing my status'}
          </button>
          {s.status === 'loading' && <div className="text-xs text-[var(--muted)]">The first start downloads the models once (about 25 MB). Later starts are instant.</div>}
        </section>
      )}

      <div className={consented && (running || s.status === 'loading') ? 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'hidden'}>
        <div className="panel p-3">
          <div className="mx-auto max-w-xs sm:max-w-none">
            <WebcamView videoRef={s.videoRef} frame={s.live.frame} showLandmarks={false} active={running} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
            <span>Preview stays on this device</span>
            <button type="button" onClick={s.calibrate} disabled={!running} className="cursor-pointer py-1 hover:underline disabled:opacity-40">
              Calibrate: look at the lesson, then tap
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <BehaviorPanel
            snapshot={s.live.behavior}
            running={running}
            alerts={s.alerts}
            selfStatus={s.selfStatus}
            onSelfStatus={s.setSelfStatus}
            compact
          />
          <div className="panel p-4 text-xs text-[var(--muted)]">
            <div className="mb-1 font-medium text-[var(--text)]">Sharing</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
              <span>Channel</span>
              <span>{r.kind === 'supabase' ? 'Realtime, encrypted to your teacher' : 'This browser only, encrypted'}</span>
              <span>Host</span>
              <span>{r.link === 'verified' ? 'Verified' : r.link === 'untrusted' ? 'Not verified' : 'Waiting'}</span>
              <span>Updates sent</span>
              <span>{r.sentCount}</span>
              <span>Engagement estimate</span>
              <span>{s.live.window?.score ?? '—'}</span>
            </div>
          </div>
          <button type="button" onClick={s.stop} disabled={!running} className="btn-danger w-full sm:w-auto sm:self-start">
            Stop sharing
          </button>
        </div>
      </div>
    </div>
  )
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span>{children}</span>
    </li>
  )
}
