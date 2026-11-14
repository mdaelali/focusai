import { useEffect, useState } from 'react'
import { useSession } from '../hooks/useSession'
import { useRoomParticipant } from '../room/useRoomParticipant'
import { WebcamView } from '../components/WebcamView'
import { BehaviorPanel } from '../components/BehaviorPanel'
import { StateBadge } from '../components/StateBadge'

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
  const running = s.status === 'running'

  // Push the newest state to the room whenever it changes.
  useEffect(() => {
    const stalled = running && s.live.cameraStalled
    r.publish(s.live.behavior, s.live.window?.score ?? null, running && !stalled, stalled ? 'Camera is not delivering frames' : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.live.behavior, s.live.window?.score, running, s.live.cameraStalled])

  const start = () => {
    setConsented(true)
    void s.start()
  }

  const leave = () => {
    if (running) s.stop()
    location.hash = '#/'
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Focus<span style={{ color: 'var(--accent)' }}>AI</span>
            <span className="ml-3 rounded-md border border-[var(--border)] px-2 py-0.5 align-middle text-[11px] font-medium text-[var(--muted)]">
              Room {room}
            </span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {r.lesson ? <span className="text-[var(--text)]">{r.lesson.name}</span> : 'Waiting for the host'}
            {' · '}joined as {name}. Keep this tab open next to your meeting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && s.live.cameraStalled && (
            <span className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
              Camera is not delivering frames
            </span>
          )}
          {running && !s.live.cameraStalled && s.live.behavior && <StateBadge state={s.live.behavior.state} />}
          <button
            type="button"
            onClick={leave}
            className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel-2)]"
          >
            Leave
          </button>
        </div>
      </header>

      {s.error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}>
          {s.error}
        </div>
      )}

      {!consented || s.status === 'idle' || s.status === 'stopped' || s.status === 'error' ? (
        <section className="panel flex flex-col gap-4 p-6">
          <h2 className="text-base font-semibold">Before you share your camera</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            <li>Your video is analysed only on this device. No frame or image is sent anywhere.</li>
            <li>
              The host receives a short status label (attentive, taking notes, talking to someone, stepped away) and a
              0–100 visual engagement estimate. Nothing else.
            </li>
            <li>Writing notes, picking something up, or talking to someone who walked in are treated as normal.</li>
            <li>You can mark yourself as busy or away at any time, and you can stop sharing whenever you like.</li>
          </ul>
          <button
            type="button"
            onClick={start}
            disabled={s.status === 'loading'}
            className="cursor-pointer self-start rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:cursor-wait disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {s.status === 'loading' ? 'Loading model…' : 'I agree, start sharing my status'}
          </button>
        </section>
      ) : null}

      <div className={consented && (running || s.status === 'loading') ? 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'hidden'}>
        <div className="panel p-3">
          <WebcamView videoRef={s.videoRef} frame={s.live.frame} showLandmarks={false} active={running} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span>Preview stays on this device</span>
            <button type="button" onClick={s.calibrate} disabled={!running} className="cursor-pointer hover:underline disabled:opacity-40">
              Calibrate (look at the lesson, then click)
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
              <span>{r.kind === 'supabase' ? 'Realtime' : 'This browser only'}</span>
              <span>Updates sent</span>
              <span>{r.sentCount}</span>
              <span>Engagement estimate</span>
              <span>{s.live.window?.score ?? '—'}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={s.stop}
            disabled={!running}
            className="cursor-pointer self-start rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--bad)', color: '#111' }}
          >
            Stop sharing
          </button>
        </div>
      </div>
    </div>
  )
}
