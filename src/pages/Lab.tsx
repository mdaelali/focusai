import { useState } from 'react'
import { useSession } from '../hooks/useSession'
import { WebcamView } from '../components/WebcamView'
import { EngagementGauge } from '../components/EngagementGauge'
import { MetricCard } from '../components/MetricCard'
import { Timeline, fmtSec } from '../components/Timeline'
import { WeightsPanel } from '../components/WeightsPanel'
import { SessionSummary } from '../components/SessionSummary'
import { BehaviorPanel } from '../components/BehaviorPanel'

export default function Lab() {
  const s = useSession()
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showTuning, setShowTuning] = useState(false)
  const [calMsg, setCalMsg] = useState<string | null>(null)
  const [summaryDismissed, setSummaryDismissed] = useState(false)

  const running = s.status === 'running'
  const w = s.live.window
  const f = s.live.frame
  const pct = (v: number) => `${Math.round(v * 100)}%`

  const onStart = () => {
    setSummaryDismissed(false)
    void s.start()
  }

  const onCalibrate = () => {
    const ok = s.calibrate()
    setCalMsg(
      ok
        ? 'Calibrated. Angles are now measured relative to where you were just looking.'
        : 'Need a clear, steady face for about one second. Try again.',
    )
    setTimeout(() => setCalMsg(null), 3500)
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
              Solo lab
            </span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Visual engagement estimation for online lessons. All processing happens in this browser tab.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <span className="mr-2 text-sm tabular-nums text-[var(--muted)]">
              {fmtSec(s.live.elapsedSec)} · {s.live.fps} fps
            </span>
          )}
          {!running ? (
            <button
              onClick={onStart}
              disabled={s.status === 'loading'}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:cursor-wait disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {s.status === 'loading' ? 'Loading model…' : 'Start session'}
            </button>
          ) : (
            <button
              onClick={s.stop}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--bad)', color: '#111' }}
            >
              Stop session
            </button>
          )}
        </div>
      </header>

      {s.error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}>
          {s.error}
        </div>
      )}

      {s.summary && !summaryDismissed && (
        <SessionSummary summary={s.summary} onDismiss={() => setSummaryDismissed(true)} />
      )}

      <main className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col gap-3">
          <div className="panel p-3">
            <WebcamView videoRef={s.videoRef} frame={f} showLandmarks={showLandmarks} active={running} />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showLandmarks}
                  onChange={(e) => setShowLandmarks(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Show landmarks
              </label>
              <button
                onClick={onCalibrate}
                disabled={!running}
                className="cursor-pointer rounded-md border border-[var(--border)] px-2.5 py-1 hover:bg-[var(--panel-2)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Calibrate (look at the lesson, then click)
              </button>
              {s.calibration && (
                <button onClick={s.resetCalibration} className="cursor-pointer text-[var(--muted)] hover:underline">
                  Reset calibration
                </button>
              )}
              <button
                onClick={() => setShowTuning((v) => !v)}
                className="ml-auto cursor-pointer text-[var(--info)] hover:underline"
              >
                {showTuning ? 'Hide tuning' : 'Tuning'}
              </button>
            </div>
            {calMsg && (
              <div className="mt-2 text-xs" style={{ color: 'var(--info)' }}>
                {calMsg}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Head yaw / pitch / roll"
              value={
                f?.facePresent
                  ? `${sign(f.yaw - (s.calibration?.yaw ?? 0))} / ${sign(f.pitch - (s.calibration?.pitch ?? 0))} / ${sign(f.roll)}`
                  : '—'
              }
              hint="degrees · 0 = facing the screen"
            />
            <MetricCard
              label="Eye offset (H / V)"
              value={f?.facePresent ? `${f.eyeH.toFixed(2)} / ${f.eyeV.toFixed(2)}` : '—'}
              hint={f?.eyesClosed ? 'eyes closed' : 'relative to head · −1..1'}
            />
            <MetricCard
              label="Frame quality"
              value={f?.facePresent ? pct(f.quality) : '—'}
              fraction={f?.quality ?? 0}
              tone={(f?.quality ?? 0) >= 0.4 ? 'ok' : 'warn'}
              hint="face size, framing, face count"
            />
          </div>

          <Timeline data={s.liveTimeline} />
        </section>

        <aside className="flex flex-col gap-3">
          <EngagementGauge stats={w} running={running} />
          <BehaviorPanel
            snapshot={s.live.behavior}
            running={running}
            alerts={s.alerts}
            selfStatus={s.selfStatus}
            onSelfStatus={s.setSelfStatus}
          />

          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Screen-directed gaze" value={w ? pct(w.components.G) : '—'} fraction={w?.components.G} hint="G · of reliable frames" />
            <MetricCard label="Head toward screen" value={w ? pct(w.components.H) : '—'} fraction={w?.components.H} tone="warn" hint="H · of reliable frames" />
            <MetricCard label="Present in view" value={w ? pct(w.components.P) : '—'} fraction={w?.components.P} tone="ok" hint="P · of all frames" />
            <MetricCard label="Looking away" value={w ? pct(w.lookingAwayRatio) : '—'} fraction={w?.lookingAwayRatio} tone="bad" />
            <MetricCard label="Gaze stability" value={w ? pct(w.components.S) : '—'} fraction={w?.components.S} hint="S · 1 = steady" />
            <MetricCard label="Head stillness" value={w ? pct(w.components.M) : '—'} fraction={w?.components.M} hint="M · 1 = still" />
          </div>

          {w && running && (
            <div className="panel p-4 text-xs text-[var(--muted)]">
              <div className="mb-1 font-medium text-[var(--text)]">Window diagnostics</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                <span>Frames in window</span>
                <span>{w.samples}</span>
                <span>Reliable frames</span>
                <span>{w.reliableSamples}</span>
                <span>Mean gaze angle</span>
                <span>{w.meanGazeAngle.toFixed(1)}°</span>
                <span>Eyes closed</span>
                <span>{pct(w.eyesClosedRatio)}</span>
                <span>Multiple faces</span>
                <span>{pct(w.multipleFacesRatio)}</span>
                <span>Low quality</span>
                <span>{pct(w.lowQualityRatio)}</span>
              </div>
            </div>
          )}

          {showTuning && (
            <WeightsPanel
              weights={s.weights}
              onWeights={s.setWeights}
              thresholds={s.thresholds}
              onThresholds={s.setThresholds}
            />
          )}

          <div className="panel p-4 text-xs leading-relaxed text-[var(--muted)]">
            <div className="mb-1 font-medium text-[var(--text)]">Privacy</div>
            Video frames are analysed on your device with MediaPipe running in WebAssembly. No video, image, or
            measurement is uploaded anywhere. Stopping the session releases the camera. Closing the tab discards
            all data.
          </div>
        </aside>
      </main>
    </div>
  )
}

function sign(v: number): string {
  const r = Math.round(v)
  return r > 0 ? `+${r}` : `${r}`
}
